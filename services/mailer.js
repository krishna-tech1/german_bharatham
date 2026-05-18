const nodemailer = require("nodemailer");
const axios = require("axios");

// ─── Brevo (Sendinblue) HTTP API ─────────────────────────────────────────────
// Uses HTTPS port 443 — works on Railway (SMTP ports 25/465/587 are blocked).
// Get your API key: Brevo Dashboard → SMTP & API → API Keys → Create a new API key
// Set env var: BREVO_API_KEY=xkeysib-...
async function sendViaBrevo({ to, subject, text, html, from }) {
  const apiKey = String(process.env.BREVO_API_KEY || "").trim();
  if (!apiKey) {
    const err = new Error("BREVO_API_KEY is not configured");
    err.code = "BREVO_NOT_CONFIGURED";
    throw err;
  }

  // Sender — use BREVO_FROM or fall back to SMTP_FROM env var
  const fromRaw = String(process.env.BREVO_FROM || process.env.SMTP_FROM || from || "").trim();
  if (!fromRaw) {
    const err = new Error("Sender not configured. Set BREVO_FROM=Name <email@domain.com>");
    err.code = "BREVO_FROM_NOT_CONFIGURED";
    throw err;
  }

  // Parse "Name <email>" or plain "email"
  const nameMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/);
  const senderName  = nameMatch ? nameMatch[1].trim() : "German Bharatham";
  const senderEmail = nameMatch ? nameMatch[2].trim() : fromRaw;

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: (Array.isArray(to) ? to : [to]).map((e) => ({ email: e })),
    subject,
    ...(text ? { textContent: text } : {}),
    ...(html ? { htmlContent: html } : {}),
  };

  try {
    const resp = await axios.post("https://api.brevo.com/v3/smtp/email", payload, {
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      timeout: Number(process.env.EMAIL_HTTP_TIMEOUT_MS || 15_000),
    });

    return {
      messageId: resp?.data?.messageId,
      accepted: Array.isArray(to) ? to : [to],
      rejected: [],
      provider: "brevo",
    };
  } catch (err) {
    const status = err?.response?.status;
    const data   = err?.response?.data;
    const e = new Error(
      `Brevo API request failed${status ? ` (HTTP ${status})` : ""}: ${JSON.stringify(data)}`
    );
    e.code    = "BREVO_REQUEST_FAILED";
    e.status  = status;
    e.details = data;
    e.cause   = err;
    throw e;
  }
}

// ─── Resend HTTP API ──────────────────────────────────────────────────────────
async function sendViaResend({ to, subject, text, html, from }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    const err = new Error("RESEND_API_KEY is not configured");
    err.code = "RESEND_NOT_CONFIGURED";
    throw err;
  }

  const resolvedFrom = String(process.env.RESEND_FROM || from || "").trim();
  if (!resolvedFrom) {
    const err = new Error("Sender not configured. Set RESEND_FROM=Name <email@yourdomain.com>");
    err.code = "RESEND_FROM_NOT_CONFIGURED";
    throw err;
  }

  const payload = {
    from: resolvedFrom,
    to: Array.isArray(to) ? to : [to],
    subject,
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
  };

  try {
    const resp = await axios.post("https://api.resend.com/emails", payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: Number(process.env.EMAIL_HTTP_TIMEOUT_MS || 15_000),
    });

    return {
      messageId: resp?.data?.id,
      accepted: payload.to,
      rejected: [],
      provider: "resend",
    };
  } catch (err) {
    const status = err?.response?.status;
    const data   = err?.response?.data;
    const e = new Error(
      `Resend API request failed${status ? ` (HTTP ${status})` : ""}`
    );
    e.code    = "RESEND_REQUEST_FAILED";
    e.status  = status;
    e.details = data;
    e.cause   = err;
    throw e;
  }
}

// ─── SMTP (nodemailer) ────────────────────────────────────────────────────────
// ⚠️  Railway blocks outbound SMTP ports (25, 465, 587). Use Brevo or Resend.
const transientNetworkErrorCodes = new Set([
  "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH",
]);

function buildTransport({ host, port, secure, user, pass }) {
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10_000),
    greetingTimeout:   Number(process.env.SMTP_GREETING_TIMEOUT_MS   || 10_000),
    socketTimeout:     Number(process.env.SMTP_SOCKET_TIMEOUT_MS     || 20_000),
    requireTLS: !secure,
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized:
        String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || "true")
          .trim()
          .toLowerCase() !== "false",
    },
  });
}

function smtpConfig() {
  const host     = String(process.env.SMTP_HOST   || "smtp.gmail.com").trim();
  const port     = Number(process.env.SMTP_PORT   || 587);
  const secureEnv = String(process.env.SMTP_SECURE || "").trim();
  const secure   = secureEnv ? secureEnv.toLowerCase() === "true" : port === 465;
  const user     = String(process.env.SMTP_USER   || "").trim();
  let   pass     = String(process.env.SMTP_PASS   || "").trim();
  if (/^smtp\.gmail\.com$/i.test(host)) pass = pass.replace(/\s+/g, "");
  const from     = String(process.env.SMTP_FROM   || user).trim();
  return { host, port, secure, user, pass, from };
}

async function sendViaSmtp({ to, subject, text, html }) {
  const cfg = smtpConfig();
  if (!cfg.user || !cfg.pass) {
    const err = new Error(
      "SMTP not configured. Set SMTP_USER + SMTP_PASS, or use BREVO_API_KEY / RESEND_API_KEY instead."
    );
    err.code = "EMAIL_NOT_CONFIGURED";
    throw err;
  }

  const transporter = buildTransport(cfg);
  const mail = {
    from: cfg.from,
    to,
    subject,
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
  };

  try {
    return await transporter.sendMail(mail);
  } catch (originalErr) {
    const code = originalErr && (originalErr.code || originalErr.errno);
    const msg  = String(originalErr?.message || "");
    const isTransient = transientNetworkErrorCodes.has(String(code)) || /timeout/i.test(msg);
    if (!isTransient) throw originalErr;

    // Try alternate SMTP ports (some hosts block 587 but allow 2525, etc.)
    const portsToTry = [];
    if (cfg.port === 465) portsToTry.push(587, 2525);
    else if (cfg.port === 587) portsToTry.push(2525);
    else if (cfg.port === 2525) portsToTry.push(587);

    let lastErr = originalErr;
    for (const nextPort of portsToTry) {
      try {
        const nextCfg = { ...cfg, port: nextPort, secure: nextPort === 465 };
        return await buildTransport(nextCfg).sendMail({ ...mail, from: nextCfg.from });
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }
}

// ─── Main sendEmail — provider selection ─────────────────────────────────────
// Priority:
//   1. EMAIL_PROVIDER=brevo  → Brevo HTTP API  (recommended for Railway)
//   2. EMAIL_PROVIDER=resend → Resend HTTP API
//   3. BREVO_API_KEY set     → auto-use Brevo HTTP API
//   4. RESEND_API_KEY set    → auto-use Resend HTTP API
//   5. SMTP fallback         → only works outside Railway
async function sendEmail({ to, subject, text, html }) {
  const cfg      = smtpConfig();
  const provider = String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  const hasBrevo  = Boolean(String(process.env.BREVO_API_KEY  || "").trim());
  const hasResend = Boolean(String(process.env.RESEND_API_KEY || "").trim());

  if (provider === "brevo"  || (!provider && hasBrevo))  {
    return sendViaBrevo({ to, subject, text, html, from: cfg.from });
  }
  if (provider === "resend" || (!provider && hasResend)) {
    return sendViaResend({ to, subject, text, html, from: cfg.from });
  }

  // SMTP — ⚠️ will fail on Railway (ports blocked)
  return sendViaSmtp({ to, subject, text, html });
}

module.exports = { sendEmail };
