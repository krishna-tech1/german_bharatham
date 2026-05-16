const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const { protect, adminOnly } = require("./middleware/auth");

const app = express();

// Middleware
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: false,
  })
);
app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      // Preserve raw body for webhook signature verification (e.g. Razorpay).
      // This is safe for other JSON routes too.
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve static files (uploaded images)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── User Module ─────────────────────────────────────────────────────────────
app.use("/api/admin", require("./userModule/admin/adminRoutes"));
app.use("/api/user", require("./userModule/user/routes/authRoutes"));

// ── Accommodation Module ────────────────────────────────────────────────────
app.use("/api/accommodation/admin", protect, require("./accommodationModule/admin"));
app.use("/api/accommodation/user", require("./accommodationModule/user"));

// ── Food & Grocery Module ───────────────────────────────────────────────────
const foodGroceryRoutes = require("./foodGroceryModule/admin/routes/foodGroceryRoutes");
console.log("Food Grocery routes loaded:", typeof foodGroceryRoutes);
app.use(
  "/api/admin/foodgrocery",
  (req, res, next) => {
    console.log(`📍 Food Grocery route accessed: ${req.method} ${req.path}`);
    next();
  },
  protect,
  foodGroceryRoutes
);
app.use("/api/user/foodgrocery", require("./foodGroceryModule/user"));

// ── Jobs Module ─────────────────────────────────────────────────────────────
app.use("/api/jobs/admin", protect, require("./jobsModule/admin"));
app.use("/api/jobs/user", require("./jobsModule/user"));

// ── Services Module ─────────────────────────────────────────────────────────
app.use("/api/services/admin", protect, require("./servicesModule/admin"));
app.use("/api/services/user", require("./servicesModule/user"));

// ── Subscriptions / Payments Module ─────────────────────────────────────────
// Razorpay webhook must NOT be protected; it uses signature verification.
app.post(
  "/api/subscriptions/razorpay/webhook",
  require("./subscriptionModule/razorpayWebhook")
);

// Razorpay callback/redirect landing page (unprotected)
app.get(
  "/api/subscriptions/razorpay/callback",
  require("./subscriptionModule/razorpayCallback")
);
app.use(
  "/api/subscriptions/admin",
  protect,
  adminOnly,
  require("./subscriptionModule/admin")
);
app.use(
  "/api/subscriptions/user",
  protect,
  require("./subscriptionModule/user")
);
// ── Universal Rating Module ─────────────────────────────────────────────────
app.use("/api/ratings", require("./routes/ratingRoutes"));

// ── Problem Reports Module ───────────────────────────────────────────────────
app.use("/api/problem-reports", require("./routes/problemReportRoutes"));

// ── Help Center Module ───────────────────────────────────────────────────────
app.use("/api/help-center", require("./routes/helpCenterRoutes"));

// ── Community Module ────────────────────────────────────────────────────────
app.use("/api/community", require("./communityModule/user/routes/communityRoutes"));
app.use(
  "/api/admin/community",
  require("./communityModule/admin/Routes/communityRoutes")
);

// ── Custom Category Module ──────────────────────────────────────────────────
app.use("/api/custom-categories", protect, require("./categoryModule/admin"));

// ── Settings Module ─────────────────────────────────────────────────────────
app.use("/api/admin/settings", require("./userModule/admin/settingsRoutes"));

// ── Utility routes ──────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("German Bharatham Backend Running");
});
app.get("/api/health", (req, res) => {
  res.status(200).json({ message: "Server is running", status: "OK" });
});

// Password reset page (for email reset-link flow)
app.get("/reset-password", (req, res) => {
  const token = String(req.query.token || "").trim();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Reset Password</title>
      <style>
        :root{--green:#4E7F6D;}
        *{box-sizing:border-box;}
        body{font-family:Arial,sans-serif;margin:0;padding:24px 16px;background:#fff;}
        .main{max-width:420px;margin:0 auto;}
        h1{font-size:24px;margin:8px 0 10px;}
        .desc{margin:0 0 18px;color:#555;font-size:13px;line-height:1.35;}
        form{margin-top:10px;}
        label{display:block;margin:14px 0 6px;font-size:14px;}
        input{width:100%;padding:12px 12px;border:1px solid #ccc;border-radius:10px;outline:none;}
        input:focus{border-color:rgba(78,127,109,0.65);box-shadow:0 0 0 3px rgba(78,127,109,0.12);}
        .pw-wrap{position:relative;}
        .pw-wrap input{padding-right:44px;}
        .pw-toggle{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:32px;height:32px;border:0;background:transparent;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--green);z-index:2;}
        .pw-toggle:active{background:rgba(78,127,109,0.10);}
        .pw-toggle svg{width:20px;height:20px;display:block;}
        .pw-toggle .icon{display:none;}
        .pw-toggle[data-state="hidden"] .icon-eyeoff{display:block;}
        .pw-toggle[data-state="shown"] .icon-eye{display:block;}
        form > button[type="submit"]{margin-top:18px;width:100%;padding:14px 12px;border:0;border-radius:12px;background:var(--green);color:#fff;font-size:16px;font-weight:600;cursor:pointer;}
        form > button[type="submit"]:disabled{opacity:0.65;cursor:not-allowed;}
        .msg{margin-top:12px;font-size:13px;white-space:pre-wrap;line-height:1.35;}
        .err{color:#b00020;}
        .ok{color:#1b5e20;}
      </style>
    </head>
    <body>
      <div class="main">
        <h1>Reset Password</h1>
        <p class="desc">Enter a new password to complete the reset.</p>

        <form id="f">
        <label for="pw">New password</label>
        <div class="pw-wrap">
          <input id="pw" type="password" minlength="6" required />
          <button id="pwToggle" class="pw-toggle" data-state="hidden" type="button" aria-label="Show password" title="Show password">
            <svg class="icon icon-eye" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg class="icon icon-eyeoff" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M10.6 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a18.3 18.3 0 0 1-4.1 5.1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M6.2 6.2C3.4 8.3 2 12 2 12s3.5 7 10 7c1.3 0 2.6-.3 3.7-.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M14.1 14.1a3 3 0 0 1-4.2-4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M1 1l22 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <label for="pw2">Confirm password</label>
        <div class="pw-wrap">
          <input id="pw2" type="password" minlength="6" required />
          <button id="pw2Toggle" class="pw-toggle" data-state="hidden" type="button" aria-label="Show password" title="Show password">
            <svg class="icon icon-eye" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg class="icon icon-eyeoff" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M10.6 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a18.3 18.3 0 0 1-4.1 5.1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M6.2 6.2C3.4 8.3 2 12 2 12s3.5 7 10 7c1.3 0 2.6-.3 3.7-.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M14.1 14.1a3 3 0 0 1-4.2-4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M1 1l22 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <button type="submit">Update Password</button>
        </form>

        <div id="msg" class="msg"></div>
      </div>

      <script>
        const token = ${JSON.stringify(token)};
        const msg = document.getElementById('msg');
        const form = document.getElementById('f');

        function attachPasswordToggle(inputId, buttonId) {
          const input = document.getElementById(inputId);
          const btn = document.getElementById(buttonId);
          if (!input || !btn) return;

          function render() {
            const isHidden = input.type === 'password';
            btn.dataset.state = isHidden ? 'hidden' : 'shown';
            btn.setAttribute('aria-label', isHidden ? 'Show password' : 'Hide password');
            btn.setAttribute('title', isHidden ? 'Show password' : 'Hide password');
          }

          btn.addEventListener('click', () => {
            input.type = input.type === 'password' ? 'text' : 'password';
            render();
          });

          render();
        }

        attachPasswordToggle('pw', 'pwToggle');
        attachPasswordToggle('pw2', 'pw2Toggle');

        if (!token) {
          msg.textContent = 'Missing reset token.';
          msg.className = 'msg err';
        }

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!token) return;
          msg.textContent = '';
          msg.className = 'msg';

          const pw = document.getElementById('pw').value;
          const pw2 = document.getElementById('pw2').value;
          if (pw !== pw2) {
            msg.textContent = 'Passwords do not match.';
            msg.className = 'msg err';
            return;
          }

          try {
            const res = await fetch('/api/user/reset-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, newPassword: pw }),
            });

            const data = await res.json().catch(() => ({}));
            if (res.ok) {
              msg.textContent = data.message || 'Password updated successfully.';
              msg.className = 'msg ok';
              form.querySelector('button').disabled = true;
            } else {
              msg.textContent = data.message || ('Failed (HTTP ' + res.status + ')');
              msg.className = 'msg err';
            }
          } catch (err) {
            msg.textContent = 'Network error. Please try again.';
            msg.className = 'msg err';
          }
        });
      </script>
    </body>
  </html>`);
});

// Connect DB and start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

(async () => {
  await connectDB();
  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
})();
