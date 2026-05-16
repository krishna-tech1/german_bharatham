module.exports = async function razorpayCallback(req, res) {
  // Razorpay redirects here after payment attempt when callback_url is set.
  // We intentionally keep it unprotected so the browser can load it.
  const status = String(req.query.razorpay_payment_link_status || req.query.status || "").toLowerCase();
  const success = status === "paid" || status === "captured";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${success ? "Payment successful" : "Payment status"}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;padding:24px;}
      h1{font-size:20px;margin:0 0 8px;}
      p{color:#555;margin:0;line-height:1.4;}
      .muted{margin-top:10px;color:#777;font-size:12px;}
    </style>
  </head>
  <body>
    <h1>${success ? "Payment successful" : "Payment submitted"}</h1>
    <p>${success ? "Thanks! Your subscription will be activated shortly." : "If you completed the payment, your subscription will be activated shortly."}</p>
    <p class="muted">You can return to the app now.</p>
  </body>
</html>`);
};
