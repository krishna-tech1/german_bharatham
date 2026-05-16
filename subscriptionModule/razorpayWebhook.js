const crypto = require("crypto");
const Subscription = require("./models/Subscription");
const User = require("../userModule/user/models/User");
const Plan = require("./models/Plan");

const safeJson = (value) => {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return "{}";
  }
};

const verifyWebhookSignature = ({ rawBody, signature, secret }) => {
  // Razorpay signs the payload using HMAC-SHA256 and encodes the signature in base64.
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody);
  const expected = hmac.digest("base64");

  try {
    const a = Buffer.from(String(expected), "base64");
    const b = Buffer.from(String(signature), "base64");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    return false;
  }
};

const addDays = (date, days) => {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + Number(days || 0));
  return d;
};

const ensureDefaultPlans = async () => {
  const currency = String(process.env.SUBSCRIPTIONS_CURRENCY || "INR").trim() || "INR";
  const toNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const defaults = [
    { id: "1m", label: "1 Month", durationDays: 30, priceInr: toNumber(process.env.SUBSCRIPTIONS_MONTHLY_PRICE_INR), currency },
    { id: "3m", label: "3 Months", durationDays: 90, priceInr: toNumber(process.env.SUBSCRIPTIONS_3MONTH_PRICE_INR), currency },
    { id: "6m", label: "6 Months", durationDays: 180, priceInr: toNumber(process.env.SUBSCRIPTIONS_6MONTH_PRICE_INR), currency },
    { id: "1y", label: "1 Year", durationDays: 365, priceInr: toNumber(process.env.SUBSCRIPTIONS_YEARLY_PRICE_INR), currency },
  ];

  const existing = await Plan.find({ id: { $in: defaults.map((d) => d.id) } }).select("id").lean();
  const existingIds = new Set(existing.map((e) => e.id));
  const toCreate = defaults.filter((d) => !existingIds.has(d.id));
  if (toCreate.length > 0) {
    await Plan.insertMany(toCreate.map((p) => ({ ...p, active: true })), { ordered: false });
  }
};

const activate = async ({ userId, planId, providerIds, eventType }) => {
  await ensureDefaultPlans();
  const plan = await Plan.findOne({ id: String(planId || "").trim() }).lean();
  if (!plan || plan.active === false) {
    return { ok: false, reason: "Unknown planId" };
  }

  const now = new Date();
  const currentPeriodStart = now;
  const currentPeriodEnd = addDays(now, plan.durationDays || 30);

  const update = {
    userId,
    provider: "razorpay",
    planId: plan.id,
    status: "active",
    currentPeriodStart,
    currentPeriodEnd,
    metadata: { lastEvent: eventType },
  };

  if (providerIds && providerIds.razorpayPaymentLinkId) {
    update.razorpayPaymentLinkId = String(providerIds.razorpayPaymentLinkId);
  }
  if (providerIds && providerIds.razorpayPaymentId) {
    update.razorpayPaymentId = String(providerIds.razorpayPaymentId);
  }

  await Subscription.findOneAndUpdate(
    {
      userId,
      provider: "razorpay",
      ...(providerIds && providerIds.razorpayPaymentLinkId
        ? { razorpayPaymentLinkId: String(providerIds.razorpayPaymentLinkId) }
        : {}),
    },
    { $set: update },
    { upsert: true, new: true }
  );

  await User.findByIdAndUpdate(userId, {
    subscriptionStatus: "active",
    subscriptionPlan: plan.id,
    subscriptionExpiresAt: currentPeriodEnd,
    subscriptionStartedAt: currentPeriodStart,
  });

  return { ok: true };
};

module.exports = async function razorpayWebhook(req, res) {
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    return res.status(500).json({ message: "Missing RAZORPAY_WEBHOOK_SECRET" });
  }

  const sig = req.headers["x-razorpay-signature"];
  if (!sig) {
    return res.status(400).json({ message: "Missing x-razorpay-signature header" });
  }

  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), "utf8");
  const ok = verifyWebhookSignature({ rawBody: raw, signature: sig, secret });
  if (!ok) {
    return res.status(400).json({ message: "Webhook signature verification failed" });
  }

  const event = req.body;

  try {
    const eventType = event && event.event ? String(event.event) : "";

    // We primarily rely on payment_link.paid because our flow uses Payment Links.
    if (eventType === "payment_link.paid" || eventType === "payment.captured") {
      const paymentLink = event?.payload?.payment_link?.entity;
      const payment = event?.payload?.payment?.entity;

      const notes = paymentLink?.notes || payment?.notes || {};
      const userId = notes.userId || notes.user_id || null;
      const planId = notes.planId || notes.plan_id || null;

      if (!userId || !planId) {
        return res.status(200).json({ received: true, ignored: true });
      }

      const providerIds = {
        razorpayPaymentLinkId: paymentLink?.id || null,
        razorpayPaymentId: payment?.id || null,
      };

      await activate({ userId: String(userId), planId: String(planId), providerIds, eventType });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[razorpayWebhook] error", err);
    return res.status(500).json({ message: "Webhook handler failed", details: err.message, raw: safeJson(event) });
  }
};
