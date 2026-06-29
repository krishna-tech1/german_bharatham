const crypto = require("crypto");
const prisma = require("../config/prisma");

const safeJson = (value) => {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return "{}";
  }
};

const verifyWebhookSignature = ({ rawBody, signature, secret }) => {
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

  for (const plan of defaults) {
    await prisma.subscriptionPlan.upsert({
      where: { id: plan.id },
      update: {},
      create: { ...plan, active: true }
    });
  }
};

const activate = async ({ userId, planId, providerIds, eventType }) => {
  await ensureDefaultPlans();
  const numericUserId = parseInt(userId);
  if (isNaN(numericUserId)) return { ok: false, reason: "Invalid userId" };

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: String(planId || "").trim() }
  });
  if (!plan || plan.active === false) {
    return { ok: false, reason: "Unknown planId" };
  }

  const now = new Date();
  const currentPeriodStart = now;
  const currentPeriodEnd = addDays(now, plan.durationDays || 30);

  const updatePayload = {
    userId: numericUserId,
    provider: "razorpay",
    planId: plan.id,
    status: "active",
    currentPeriodStart,
    currentPeriodEnd,
    metadata: { lastEvent: eventType },
  };

  if (providerIds && providerIds.razorpayPaymentLinkId) {
    updatePayload.razorpayPaymentLinkId = String(providerIds.razorpayPaymentLinkId);
  }
  if (providerIds && providerIds.razorpayPaymentId) {
    updatePayload.razorpayPaymentId = String(providerIds.razorpayPaymentId);
  }

  // Find last subscription or create new
  const lastSub = await prisma.subscription.findFirst({
    where: {
      userId: numericUserId,
      provider: "razorpay",
      ...(providerIds && providerIds.razorpayPaymentLinkId
        ? { razorpayPaymentLinkId: String(providerIds.razorpayPaymentLinkId) }
        : {}),
    },
    orderBy: { createdAt: 'desc' }
  });

  if (lastSub) {
    await prisma.subscription.update({
      where: { id: lastSub.id },
      data: updatePayload
    });
  } else {
    await prisma.subscription.create({
      data: updatePayload
    });
  }

  await prisma.user.update({
    where: { id: numericUserId },
    data: {
      subscriptionStatus: "active",
      subscriptionPlan: plan.id,
      subscriptionExpiresAt: currentPeriodEnd,
      subscriptionStartedAt: currentPeriodStart,
    }
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
