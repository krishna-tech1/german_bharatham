const Subscription = require("./models/Subscription");
const User = require("../userModule/user/models/User");
const Plan = require("./models/Plan");

const axios = require("axios");
const crypto = require("crypto");

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const getFallbackPriceForPlan = (planId) => {
  const id = String(planId || "").trim();
  if (!id) return 0;
  const map = {
    "1m": toNumber(process.env.SUBSCRIPTIONS_MONTHLY_PRICE_INR),
    "3m": toNumber(process.env.SUBSCRIPTIONS_3MONTH_PRICE_INR),
    "6m": toNumber(process.env.SUBSCRIPTIONS_6MONTH_PRICE_INR),
    "1y": toNumber(process.env.SUBSCRIPTIONS_YEARLY_PRICE_INR),
    free: 0,
  };
  return map[id] || 0;
};

const getDefaultCurrency = () => {
  return String(process.env.SUBSCRIPTIONS_CURRENCY || "INR").trim() || "INR";
};

const ensureDefaultPlans = async () => {
  const currency = getDefaultCurrency();

  // Map legacy env names to new plan ids.
  const price1m = toNumber(process.env.SUBSCRIPTIONS_MONTHLY_PRICE_INR);
  const price1y = toNumber(process.env.SUBSCRIPTIONS_YEARLY_PRICE_INR);
  const price3m = toNumber(process.env.SUBSCRIPTIONS_3MONTH_PRICE_INR);
  const price6m = toNumber(process.env.SUBSCRIPTIONS_6MONTH_PRICE_INR);

  const defaults = [
    { id: "free", label: "Free (7 days)", durationDays: 7, priceInr: 0, currency, active: true },
    { id: "1m", label: "1 Month", durationDays: 30, priceInr: price1m || 0, currency },
    { id: "3m", label: "3 Months", durationDays: 90, priceInr: price3m || 0, currency },
    { id: "6m", label: "6 Months", durationDays: 180, priceInr: price6m || 0, currency },
    { id: "1y", label: "1 Year", durationDays: 365, priceInr: price1y || 0, currency },
  ];

  const existing = await Plan.find({ id: { $in: defaults.map((d) => d.id) } })
    .select("id")
    .lean();
  const existingIds = new Set(existing.map((e) => e.id));
  const toCreate = defaults.filter((d) => !existingIds.has(d.id));
  if (toCreate.length > 0) {
    await Plan.insertMany(toCreate.map((p) => ({ ...p, active: true })), { ordered: false });
  }
};

const listActivePlans = async () => {
  await ensureDefaultPlans();
  return Plan.find({ active: true }).sort({ durationDays: 1 }).lean();
};

const getPlanById = async (planId) => {
  await ensureDefaultPlans();
  const raw = String(planId || "").trim();
  if (!raw) return null;
  // Try by app-level id first
  let plan = await Plan.findOne({ id: raw }).lean();
  if (plan) return plan;
  // Fallback: maybe client sent Mongo _id
  try {
    if (/^[0-9a-fA-F]{24}$/.test(raw)) {
      plan = await Plan.findById(raw).lean();
      if (plan) return plan;
    }
  } catch (e) {
    // ignore
  }
  return null;
};

const normalizePhoneDigits = (phone) => {
  if (!phone) return "";
  try {
    return String(phone).replace(/\D/g, "");
  } catch (_) {
    return "";
  }
};

const getRazorpayKeys = () => {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keyId || !keySecret) {
    const err = new Error("Missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET");
    err.statusCode = 500;
    throw err;
  }
  return { keyId, keySecret };
};

const razorpayApi = () => {
  const { keyId, keySecret } = getRazorpayKeys();
  return axios.create({
    baseURL: "https://api.razorpay.com/v1",
    auth: { username: keyId, password: keySecret },
    timeout: 20000,
  });
};

const getBaseUrl = (req) => {
  const configured = String(process.env.BACKEND_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"]
    ? String(req.headers["x-forwarded-proto"]).split(",")[0].trim()
    : req.protocol;
  return `${proto}://${req.get("host")}`;
};

exports.getPlans = async (_req, res) => {
  const items = await listActivePlans();
  return res.status(200).json({
    plans: items.map((p) => ({
      id: p.id,
      label: p.label,
      currency: p.currency || "INR",
      price: p.priceInr,
      durationDays: p.durationDays,
    })),
  });
};

exports.getMySubscription = async (req, res) => {
  const sub = await Subscription.findOne({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
  let user = await User.findById(req.user.id).select(
    "subscriptionStatus subscriptionPlan subscriptionExpiresAt firstLoginAt lastLoginAt"
  ).lean();

  // If user is new and has no subscription, ensure correct defaults
  if (user && !user.subscriptionPlan && (!user.subscriptionStatus || user.subscriptionStatus === 'none')) {
    user.subscriptionPlan = null;
    user.subscriptionStatus = 'none';
    user.subscriptionExpiresAt = null;
  }


  // Determine if free trial is completed or not eligible (phone reused)
  let freeTrialCompleted = false;
  if (user) {
    // Check if this phone number is unique (first user with this phone)
    const userDoc = await User.findById(req.user.id).select("phone createdAt");
    if (userDoc && userDoc.phone) {
      const phoneDigits = normalizePhoneDigits(userDoc.phone);
      const firstUserWithPhone = await User.find({
        $or: [
          { phone: String(userDoc.phone) },
          { phone: phoneDigits },
          { phone: `+${phoneDigits}` },
          { phone: new RegExp(`${phoneDigits}$`) },
        ],
      })
        .sort({ createdAt: 1 })
        .limit(1);
      if (!firstUserWithPhone.length || String(firstUserWithPhone[0]._id) !== String(req.user.id)) {
        // Not the first signup with this phone, so free trial is completed/blocked
        freeTrialCompleted = true;
      }
    }
    // Also, if user already used or expired their free trial, mark as completed
    if (user.subscriptionPlan === "free") {
      if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date()) {
        freeTrialCompleted = true;
      }
    } else if (user.subscriptionPlan) {
      freeTrialCompleted = true;
    }
  }

  // If the stored subscription period has already passed, reflect that in
  // the returned user object so clients show the correct UI. Do not throw
  // here if DB is out-of-date; just adjust the in-memory response.
  if (user && user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date()) {
    if (user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trial') {
      user.subscriptionStatus = 'none';
      // Clear active plan so UI no longer treats it as current
      user.subscriptionPlan = null;
    }
  }

  return res.status(200).json({
    user: user ? { ...user, freeTrialCompleted } : null,
    subscription: sub || null,
    serverTime: new Date().toISOString(),
  });
};

// Return the authenticated user's payment/subscription history.
exports.getPaymentHistory = async (req, res) => {
  const items = await Subscription.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .lean();

  // Load plan metadata to include price/label where available
  const planIds = Array.from(new Set(items.map((it) => it.planId).filter(Boolean)));
  const plansMap = {};
  if (planIds.length > 0) {
    const planDocs = await Plan.find({ id: { $in: planIds } }).lean();
    planDocs.forEach((p) => (plansMap[p.id] = p));
  }

  const out = items.map((it) => {
    const plan = it.planId ? plansMap[it.planId] : null;
    return {
      date: it.createdAt ? it.createdAt.toISOString() : null,
      plan: plan ? (plan.label || plan.id) : (it.planId || null),
      amount: plan ? plan.priceInr : null,
      status: it.status || null,
    };
  });

  return res.status(200).json(out);
};

exports.createCheckoutSession = async (req, res) => {
  // Kept for backward compatibility with existing mobile/web clients.
  // Under the hood this now creates a Razorpay Payment Link and returns its short_url.
  try {
    const { planId } = req.body || {};
    const plan = await getPlanById(planId);

    if (!plan || plan.active === false) return res.status(400).json({ message: "Invalid planId" });

    const effectivePrice = Number(plan.priceInr) || getFallbackPriceForPlan(plan.id);

    // Handle free plan (price 0) directly
    if (Number(effectivePrice) === 0) {
        // Only allow free trial for first user with this phone number (robust matching)
        const user = await User.findById(req.user.id).select("phone");
        if (!user || !user.phone) {
          return res.status(400).json({ message: "Phone number required for free trial" });
        }
        const phoneDigits = normalizePhoneDigits(user.phone);
        const firstUserWithPhone = await User.find({
          $or: [
            { phone: String(user.phone) },
            { phone: phoneDigits },
            { phone: `+${phoneDigits}` },
            { phone: new RegExp(`${phoneDigits}$`) },
          ],
        })
          .sort({ createdAt: 1 })
          .limit(1);
        if (!firstUserWithPhone.length || String(firstUserWithPhone[0]._id) !== String(req.user.id)) {
          // Not the first signup with this phone
          return res.status(403).json({ message: "Free trial already used for this phone number" });
        }

      // Activate free plan for user
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (plan.durationDays || 7) * 24 * 60 * 60 * 1000);
      const currentPeriodStart = now;
      const currentPeriodEnd = expiresAt;

      // Upsert a Subscription document so admin and history have a record
      try {
        await Subscription.findOneAndUpdate(
          { userId: req.user.id, provider: "razorpay", razorpayPaymentLinkId: null },
          {
            $set: {
              userId: req.user.id,
              provider: "razorpay",
              planId: plan.id,
              status: "active",
              currentPeriodStart,
              currentPeriodEnd,
              metadata: { createdBy: "free_activation" },
            },
          },
          { upsert: true, new: true }
        );
      } catch (e) {
        // non-fatal
        console.warn('Failed to upsert free Subscription', e && e.message ? e.message : e);
      }

      await User.findByIdAndUpdate(req.user.id, {
        subscriptionStatus: "trial",
        subscriptionPlan: plan.id,
        subscriptionExpiresAt: expiresAt,
        subscriptionStartedAt: currentPeriodStart,
      });
      return res.status(200).json({ message: "Free plan activated", free: true });
    }

    if (!effectivePrice || Number(effectivePrice) <= 0) {
      console.error("[createCheckoutSession] plan price not configured", { planId: plan.id, dbPrice: plan.priceInr, envFallback: getFallbackPriceForPlan(plan.id) });
      return res.status(400).json({ message: "Plan price not configured", plan: { id: plan.id, priceInr: plan.priceInr, fallback: getFallbackPriceForPlan(plan.id) } });
    }

    const user = await User.findById(req.user.id).select("name email phone");
    if (!user) return res.status(404).json({ message: "User not found" });

    const api = razorpayApi();
    const appBase = getBaseUrl(req);

    const description = `German Bharatham - ${plan.label || plan.id} subscription`;

    const payload = {
      amount: Math.round(Number(effectivePrice) * 100),
      currency: plan.currency || "INR",
      accept_partial: false,
      description,
      customer: {
        name: String(user.name || "").trim() || undefined,
        email: String(user.email || "").trim() || undefined,
        contact: String(user.phone || "").trim() || undefined,
      },
      notes: {
        userId: String(req.user.id),
        planId: String(plan.id),
      },
      callback_url: `${appBase}/api/subscriptions/razorpay/callback`,
      callback_method: "get",
    };

    const resp = await api.post("/payment_links", payload);
    const link = resp && resp.data ? resp.data : null;
    const url = link && (link.short_url || link.shortUrl || link.shorturl) ? (link.short_url || link.shortUrl || link.shorturl) : "";
    const paymentLinkId = link && link.id ? String(link.id) : null;
    if (!url || !paymentLinkId) {
      return res.status(500).json({ message: "Failed to create Razorpay payment link" });
    }

    await Subscription.findOneAndUpdate(
      { userId: req.user.id, razorpayPaymentLinkId: paymentLinkId },
      {
        $setOnInsert: {
          userId: req.user.id,
          provider: "razorpay",
          status: "pending",
          razorpayPaymentLinkId: paymentLinkId,
          metadata: { createdBy: "payment_link" },
        },
        $set: {
          planId: plan.id,
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({ url });
  } catch (error) {
    const status = error && error.response && error.response.status ? Number(error.response.status) : (error && error.statusCode ? Number(error.statusCode) : 500);
    const details = error && error.response && error.response.data ? JSON.stringify(error.response.data) : null;
    return res.status(status).json({
      message: error.message || "Failed to initialize payment",
      details,
    });
  }
};

// Create a Razorpay Order for client-side checkout (used by native/mobile SDKs)
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { planId } = req.body || {};
    const plan = await getPlanById(planId);
    if (!plan || plan.active === false) return res.status(400).json({ message: "Invalid planId" });

    const effectivePrice = Number(plan.priceInr) || getFallbackPriceForPlan(plan.id);

    // Handle free plan (price 0) directly — activate trial without creating an order
    if (Number(effectivePrice) === 0) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (plan.durationDays || 7) * 24 * 60 * 60 * 1000);
      const currentPeriodStart = now;
      const currentPeriodEnd = expiresAt;

      try {
        await Subscription.findOneAndUpdate(
          { userId: req.user.id, provider: "razorpay", razorpayPaymentLinkId: null },
          {
            $set: {
              userId: req.user.id,
              provider: "razorpay",
              planId: plan.id,
              status: "active",
              currentPeriodStart,
              currentPeriodEnd,
              metadata: { createdBy: "free_activation" },
            },
          },
          { upsert: true, new: true }
        );
      } catch (e) {
        console.error('Failed to upsert free Subscription', e && e.message ? e.message : e);
      }

      await User.findByIdAndUpdate(req.user.id, {
        subscriptionStatus: "trial",
        subscriptionPlan: plan.id,
        subscriptionExpiresAt: expiresAt,
        subscriptionStartedAt: currentPeriodStart,
      });

      return res.status(200).json({ message: "Free plan activated", free: true });
    }

    if (!effectivePrice || Number(effectivePrice) <= 0) {
      console.error("[createRazorpayOrder] plan price not configured", { planId: plan.id, dbPrice: plan.priceInr, envFallback: getFallbackPriceForPlan(plan.id) });
      return res.status(400).json({ message: "Plan price not configured", plan: { id: plan.id, priceInr: plan.priceInr, fallback: getFallbackPriceForPlan(plan.id) } });
    }

    const user = await User.findById(req.user.id).select("name email phone");
    if (!user) return res.status(404).json({ message: "User not found" });

    const api = razorpayApi();
    const shortReceipt = `sub_${crypto.randomBytes(6).toString('hex')}`;
    const payload = {
      amount: Math.round(Number(effectivePrice) * 100),
      currency: plan.currency || getDefaultCurrency(),
      receipt: shortReceipt,
      notes: {
        userId: String(req.user.id),
        planId: String(plan.id),
      },
      payment_capture: 1,
    };

    const resp = await api.post("/orders", payload);
    const order = resp && resp.data ? resp.data : null;
    if (!order || !order.id) return res.status(500).json({ message: "Failed to create order" });

    // Record a pending subscription row so UI / admin can see pending payment
    try {
      await Subscription.findOneAndUpdate(
        { userId: req.user.id, provider: "razorpay", razorpayPaymentLinkId: null },
        {
          $setOnInsert: {
            userId: req.user.id,
            provider: "razorpay",
            status: "pending",
            metadata: { createdBy: "order" },
          },
          $set: { planId: plan.id, "metadata.razorpayOrderId": String(order.id) },
        },
        { upsert: true, new: true }
      );
    } catch (e) {
      // non-fatal
      console.error("Failed to upsert pending subscription", e.message || e);
    }

    const { keyId } = getRazorpayKeys();
    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
    });
  } catch (error) {
    const status = error && error.response && error.response.status ? Number(error.response.status) : 500;
    const details = error && error.response && error.response.data ? JSON.stringify(error.response.data) : null;
    return res.status(status).json({ message: error.message || "Failed to create order", details });
  }
};

// Verify payment (called by client after successful checkout) and activate subscription
exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, planId } = req.body || {};
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment verification parameters" });
    }

    // Verify signature (order_id|payment_id with secret) as per Razorpay docs
    const { keySecret } = getRazorpayKeys();
    const expected = crypto.createHmac("sha256", keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (String(expected) !== String(razorpay_signature)) {
      return res.status(400).json({ message: "Signature verification failed" });
    }

    // At this point payment is verified. Activate subscription for the user.
    const userId = String(req.user.id);
    const plan = await getPlanById(planId);
    if (!plan || plan.active === false) return res.status(400).json({ message: "Invalid planId" });

    // compute period
    const now = new Date();
    const currentPeriodStart = now;
    const currentPeriodEnd = new Date(now.getTime() + (Number(plan.durationDays || 30) * 24 * 60 * 60 * 1000));

    await Subscription.findOneAndUpdate(
      { userId, provider: "razorpay" },
      {
        $set: {
          userId,
          provider: "razorpay",
          planId: plan.id,
          status: "active",
          currentPeriodStart,
          currentPeriodEnd,
          razorpayPaymentId: String(razorpay_payment_id),
          metadata: { verifiedAt: new Date().toISOString(), via: "manual_verify" },
        },
      },
      { upsert: true, new: true }
    );

    // Read back the subscription we just upserted
    const subDoc = await Subscription.findOne({ userId, provider: "razorpay" }).sort({ createdAt: -1 }).lean();

    const userUpdate = {
      subscriptionStatus: "active",
      subscriptionPlan: plan.id,
      subscriptionExpiresAt: currentPeriodEnd,
      subscriptionStartedAt: currentPeriodStart,
    };

    await User.findByIdAndUpdate(userId, userUpdate);

    return res.status(200).json({ ok: true, message: "Subscription activated", subscription: subDoc, user: userUpdate });
  } catch (err) {
    const status = err && err.response && err.response.status ? Number(err.response.status) : 500;
    return res.status(status).json({ message: err.message || "Verification failed" });
  }
};

// (cancelSubscription removed)

exports.listAllSubscriptions = async (_req, res) => {
  const items = await Subscription.find()
    .populate("userId", "email")
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  const out = items.map((it) => {
    const user = it.userId || null;
    return {
      id: it._id,
      userId: user && user._id ? String(user._id) : null,
      userEmail: user && user.email ? String(user.email) : null,
      provider: it.provider || null,
      planId: it.planId || null,
      status: it.status || null,
      periodStart: it.currentPeriodStart ? new Date(it.currentPeriodStart).toISOString() : null,
      periodEnd: it.currentPeriodEnd ? new Date(it.currentPeriodEnd).toISOString() : null,
      razorpayPaymentLinkId: it.razorpayPaymentLinkId || null,
      razorpayPaymentId: it.razorpayPaymentId || null,
      createdAt: it.createdAt ? new Date(it.createdAt).toISOString() : null,
      updatedAt: it.updatedAt ? new Date(it.updatedAt).toISOString() : null,
    };
  });

  return res.status(200).json(out);
};


// List all plans (admin)
exports.listPlansAdmin = async (_req, res) => {
  await ensureDefaultPlans();
  const items = await Plan.find().sort({ durationDays: 1 }).lean();
  return res.status(200).json(
    items.map((p) => ({
      id: p.id,
      label: p.label,
      currency: p.currency || "INR",
      priceInr: p.priceInr,
      durationDays: p.durationDays,
      active: p.active !== false,
    }))
  );
};

// Bulk update plans (admin)
exports.upsertPlansAdmin = async (req, res) => {
  const payload = req.body && (req.body.plans || req.body);
  const arr = Array.isArray(payload) ? payload : [];
  if (arr.length === 0) return res.status(400).json({ message: "Missing plans" });

  await ensureDefaultPlans();

  const ops = [];
  for (const raw of arr) {
    if (!raw) continue;
    const id = String(raw.id || "").trim();
    if (!id) continue;

    const update = {
      label: raw.label !== undefined ? String(raw.label || "").trim() || id : undefined,
      currency: raw.currency !== undefined ? String(raw.currency || "INR").trim() || "INR" : undefined,
      priceInr: raw.priceInr !== undefined ? toNumber(raw.priceInr) : undefined,
      durationDays: raw.durationDays !== undefined ? Math.trunc(toNumber(raw.durationDays)) : undefined,
      active: raw.active !== undefined ? Boolean(raw.active) : undefined,
    };

    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);
    ops.push({
      updateOne: {
        filter: { id },
        update: { $set: update, $setOnInsert: { id } },
        upsert: true,
      },
    });
  }

  if (ops.length === 0) return res.status(400).json({ message: "No valid plans to update" });
  await Plan.bulkWrite(ops);

  const items = await Plan.find().sort({ durationDays: 1 }).lean();
  return res.status(200).json(
    items.map((p) => ({
      id: p.id,
      label: p.label,
      currency: p.currency || "INR",
      priceInr: p.priceInr,
      durationDays: p.durationDays,
      active: p.active !== false,
    }))
  );
};

// Add a new plan (admin)
exports.createPlanAdmin = async (req, res) => {
  const { id, label, priceInr, durationDays, currency, active } = req.body || {};
  if (!id || !label || !durationDays) {
    return res.status(400).json({ message: "Missing required fields (id, label, durationDays)" });
  }
  const exists = await Plan.findOne({ id: String(id).trim() });
  if (exists) return res.status(400).json({ message: "Plan with this id already exists" });
  const plan = await Plan.create({
    id: String(id).trim(),
    label: String(label).trim(),
    priceInr: toNumber(priceInr),
    durationDays: Math.trunc(toNumber(durationDays)),
    currency: String(currency || "INR").trim(),
    active: active !== false,
  });
  return res.status(201).json(plan);
};

// Delete a plan (admin)
exports.deletePlanAdmin = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: "Missing plan id" });
  const plan = await Plan.findOneAndDelete({ id: String(id).trim() });
  if (!plan) return res.status(404).json({ message: "Plan not found" });
  return res.status(200).json({ message: "Plan deleted" });
};
// (removed temporary force-activate helper)