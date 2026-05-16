const nodemailer = require("nodemailer");
const axios = require("axios");

const transientNetworkErrorCodes = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

function buildTransport({ host, port, secure, user, pass }) {
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,

    // Fail fast on hosts that block outbound SMTP.
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10_000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10_000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20_000),

    // STARTTLS is expected on ports like 587/2525.
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

function emailProvider() {
  return String(process.env.EMAIL_PROVIDER || "")
    .trim()
    .toLowerCase();
}

async function sendViaResend({ to, subject, text, html, from }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    const err = new Error("RESEND_API_KEY is not configured");
    err.code = "RESEND_NOT_CONFIGURED";
    throw err;
  }

  const resolvedFrom = String(process.env.RESEND_FROM || from || "").trim();
  if (!resolvedFrom) {
    const err = new Error(
      "Sender is not configured. Set RESEND_FROM (or SMTP_FROM/SMTP_USER)."
    );
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

    // Normalize return shape (nodemailer returns { messageId, accepted, ... }).
    return {
      messageId: resp?.data?.id,
      accepted: payload.to,
      rejected: [],
      provider: "resend",
    };
  } catch (err) {
    // Bubble up a compact error but keep original details available.
    const status = err?.response?.status;
    const data = err?.response?.data;
    const e = new Error(
      `Resend API request failed${status ? ` (HTTP ${status})` : ""}`
    );
    e.code = "RESEND_REQUEST_FAILED";
    e.status = status;
    e.details = data;
    e.cause = err;
    throw e;
  }
}

function smtpConfig() {
  const host = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secureEnv = String(process.env.SMTP_SECURE || "").trim();
  const secure = secureEnv ? secureEnv.toLowerCase() === "true" : port === 465;

  const user = String(process.env.SMTP_USER || "").trim();
  let pass = String(process.env.SMTP_PASS || "").trim();
  // Gmail app passwords are often displayed with spaces; authentication expects no spaces.
  if (/^smtp\.gmail\.com$/i.test(host)) {
    pass = pass.replace(/\s+/g, "");
  }
  const from = String(process.env.SMTP_FROM || user).trim();

  return { host, port, secure, user, pass, from };
}

async function sendEmail({ to, subject, text, html }) {
  const cfg = smtpConfig();
  const provider = emailProvider();
  const hasResend = Boolean(String(process.env.RESEND_API_KEY || "").trim());

  // Prefer HTTP-based provider in production unless explicitly forced to SMTP.
  if (provider === "resend" || (!provider && hasResend)) {
    return sendViaResend({ to, subject, text, html, from: cfg.from });
  }

  if (!cfg.user || !cfg.pass) {
    const err = new Error(
      "Email is not configured. Set RESEND_API_KEY/RESEND_FROM (recommended) or SMTP_USER/SMTP_PASS (and optionally SMTP_HOST/SMTP_PORT/SMTP_FROM)."
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
    const msg = String(originalErr && originalErr.message ? originalErr.message : "");
    const isTransient =
      transientNetworkErrorCodes.has(String(code)) || /timeout/i.test(msg);

    if (!isTransient) throw originalErr;

    // Brevo supports 587 (STARTTLS), 2525 (STARTTLS), and 465 (SSL).
    // Some hosts block certain SMTP ports; try a sensible fallback sequence.
    const portsToTry = [];
    if (cfg.port === 465) portsToTry.push(587, 2525);
    else if (cfg.port === 587) portsToTry.push(2525);
    else if (cfg.port === 2525) portsToTry.push(587);

    let lastErr = originalErr;
    for (const nextPort of portsToTry) {
      try {
        const nextCfg = {
          ...cfg,
          port: nextPort,
          secure: nextPort === 465,
        };
        const nextTransporter = buildTransport(nextCfg);
        return await nextTransporter.sendMail({ ...mail, from: nextCfg.from });
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr;
  }
}

module.exports = { sendEmail };
