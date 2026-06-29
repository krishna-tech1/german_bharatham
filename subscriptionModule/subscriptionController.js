const prisma = require("../config/prisma");
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
    { id: "1m", label: "1 Month", durationDays: 30, priceInr: price1m || 0, currency, active: true },
    { id: "3m", label: "3 Months", durationDays: 90, priceInr: price3m || 0, currency, active: true },
    { id: "6m", label: "6 Months", durationDays: 180, priceInr: price6m || 0, currency, active: true },
    { id: "1y", label: "1 Year", durationDays: 365, priceInr: price1y || 0, currency, active: true },
  ];

  for (const plan of defaults) {
    await prisma.subscriptionPlan.upsert({
      where: { id: plan.id },
      update: {},
      create: plan
    });
  }
};

const listActivePlans = async () => {
  await ensureDefaultPlans();
  return prisma.subscriptionPlan.findMany({
    where: { active: true },
    orderBy: { durationDays: 'asc' }
  });
};

const getPlanById = async (planId) => {
  await ensureDefaultPlans();
  const raw = String(planId || "").trim();
  if (!raw) return null;
  
  return prisma.subscriptionPlan.findUnique({
    where: { id: raw }
  });
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
  const numericUserId = parseInt(req.user.id);
  if (isNaN(numericUserId)) return res.status(401).json({ message: "Invalid user session" });

  const sub = await prisma.subscription.findFirst({
    where: { userId: numericUserId },
    orderBy: { createdAt: 'desc' }
  });

  const user = await prisma.user.findUnique({
    where: { id: numericUserId },
    select: {
      id: true,
      phone: true,
      subscriptionStatus: true,
      subscriptionPlan: true,
      subscriptionExpiresAt: true,
      firstLoginAt: true,
      lastLoginAt: true,
      createdAt: true
    }
  });

  // Re-inject mapped _id for frontend compatibility
  const mappedUser = user ? { ...user, _id: String(user.id) } : null;

  // Determine if free trial is completed or not eligible (phone reused)
  let freeTrialCompleted = false;
  if (mappedUser && mappedUser.phone) {
    const phoneDigits = normalizePhoneDigits(mappedUser.phone);
    const firstUserWithPhone = await prisma.user.findMany({
      where: {
        OR: [
          { phone: { equals: String(mappedUser.phone) } },
          { phone: { equals: phoneDigits } },
          { phone: { endsWith: phoneDigits } }
        ]
      },
      orderBy: { createdAt: 'asc' },
      take: 1
    });

    if (firstUserWithPhone.length > 0 && firstUserWithPhone[0].id !== numericUserId) {
      freeTrialCompleted = true;
    }
  }

  if (mappedUser) {
    if (mappedUser.subscriptionPlan === "free") {
      if (mappedUser.subscriptionExpiresAt && new Date(mappedUser.subscriptionExpiresAt) < new Date()) {
        freeTrialCompleted = true;
      }
    } else if (mappedUser.subscriptionPlan) {
      freeTrialCompleted = true;
    }
  }

  // Adjust in-memory status if expired
  if (mappedUser && mappedUser.subscriptionExpiresAt && new Date(mappedUser.subscriptionExpiresAt) < new Date()) {
    if (mappedUser.subscriptionStatus === 'active' || mappedUser.subscriptionStatus === 'trial') {
      mappedUser.subscriptionStatus = 'none';
      mappedUser.subscriptionPlan = null;
    }
  }

  return res.status(200).json({
    user: mappedUser ? { ...mappedUser, freeTrialCompleted } : null,
    subscription: sub ? { ...sub, _id: String(sub.id) } : null,
    serverTime: new Date().toISOString(),
  });
};

// Return the authenticated user's payment/subscription history.
exports.getPaymentHistory = async (req, res) => {
  const numericUserId = parseInt(req.user.id);
  if (isNaN(numericUserId)) return res.status(401).json({ message: "Invalid user session" });

  const items = await prisma.subscription.findMany({
    where: { userId: numericUserId },
    orderBy: { createdAt: 'desc' }
  });

  const planIds = Array.from(new Set(items.map((it) => it.planId).filter(Boolean)));
  const plansMap = {};
  if (planIds.length > 0) {
    const planDocs = await prisma.subscriptionPlan.findMany({
      where: { id: { in: planIds } }
    });
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
  try {
    const { planId } = req.body || {};
    const plan = await getPlanById(planId);
    const numericUserId = parseInt(req.user.id);

    if (isNaN(numericUserId)) return res.status(401).json({ message: "Invalid user session" });
    if (!plan || plan.active === false) return res.status(400).json({ message: "Invalid planId" });

    const effectivePrice = Number(plan.priceInr) || getFallbackPriceForPlan(plan.id);

    // Handle free plan (price 0) directly
    if (Number(effectivePrice) === 0) {
      const user = await prisma.user.findUnique({
        where: { id: numericUserId },
        select: { id: true, phone: true }
      });
      if (!user || !user.phone) {
        return res.status(400).json({ message: "Phone number required for free trial" });
      }
      const phoneDigits = normalizePhoneDigits(user.phone);
      const firstUserWithPhone = await prisma.user.findMany({
        where: {
          OR: [
            { phone: { equals: String(user.phone) } },
            { phone: { equals: phoneDigits } },
            { phone: { endsWith: phoneDigits } }
          ]
        },
        orderBy: { createdAt: 'asc' },
        take: 1
      });

      if (firstUserWithPhone.length > 0 && firstUserWithPhone[0].id !== numericUserId) {
        return res.status(403).json({ message: "Free trial already used for this phone number" });
      }

      // Activate free plan for user
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (plan.durationDays || 7) * 24 * 60 * 60 * 1000);
      const currentPeriodStart = now;
      const currentPeriodEnd = expiresAt;

      // Upsert a Subscription document using last subscription lookup
      try {
        const lastSub = await prisma.subscription.findFirst({
          where: { userId: numericUserId, provider: "razorpay", razorpayPaymentLinkId: null },
          orderBy: { createdAt: 'desc' }
        });

        const subPayload = {
          userId: numericUserId,
          provider: "razorpay",
          planId: plan.id,
          status: "active",
          currentPeriodStart,
          currentPeriodEnd,
          metadata: { createdBy: "free_activation" }
        };

        if (lastSub) {
          await prisma.subscription.update({
            where: { id: lastSub.id },
            data: subPayload
          });
        } else {
          await prisma.subscription.create({
            data: subPayload
          });
        }
      } catch (e) {
        console.warn('Failed to record free Subscription', e && e.message ? e.message : e);
      }

      await prisma.user.update({
        where: { id: numericUserId },
        data: {
          subscriptionStatus: "trial",
          subscriptionPlan: plan.id,
          subscriptionExpiresAt: expiresAt,
          subscriptionStartedAt: currentPeriodStart,
        }
      });
      return res.status(200).json({ message: "Free plan activated", free: true });
    }

    if (!effectivePrice || Number(effectivePrice) <= 0) {
      return res.status(400).json({ message: "Plan price not configured" });
    }

    const user = await prisma.user.findUnique({
      where: { id: numericUserId },
      select: { name: true, email: true, phone: true }
    });
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
        userId: String(numericUserId),
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

    // Upsert subscription
    const existingSub = await prisma.subscription.findFirst({
      where: { userId: numericUserId, razorpayPaymentLinkId: paymentLinkId },
      orderBy: { createdAt: 'desc' }
    });

    if (existingSub) {
      await prisma.subscription.update({
        where: { id: existingSub.id },
        data: { planId: plan.id }
      });
    } else {
      await prisma.subscription.create({
        data: {
          userId: numericUserId,
          provider: "razorpay",
          status: "pending",
          razorpayPaymentLinkId: paymentLinkId,
          planId: plan.id,
          metadata: { createdBy: "payment_link" }
        }
      });
    }

    return res.status(200).json({ url });
  } catch (error) {
    const status = error && error.response && error.response.status ? Number(error.response.status) : 500;
    const details = error && error.response && error.response.data ? JSON.stringify(error.response.data) : null;
    return res.status(status).json({
      message: error.message || "Failed to initialize payment",
      details,
    });
  }
};

exports.createRazorpayOrder = async (req, res) => {
  try {
    const { planId } = req.body || {};
    const plan = await getPlanById(planId);
    const numericUserId = parseInt(req.user.id);

    if (isNaN(numericUserId)) return res.status(401).json({ message: "Invalid user session" });
    if (!plan || plan.active === false) return res.status(400).json({ message: "Invalid planId" });

    const effectivePrice = Number(plan.priceInr) || getFallbackPriceForPlan(plan.id);

    // Handle free plan (price 0) directly
    if (Number(effectivePrice) === 0) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (plan.durationDays || 7) * 24 * 60 * 60 * 1000);
      const currentPeriodStart = now;
      const currentPeriodEnd = expiresAt;

      try {
        const lastSub = await prisma.subscription.findFirst({
          where: { userId: numericUserId, provider: "razorpay", razorpayPaymentLinkId: null },
          orderBy: { createdAt: 'desc' }
        });

        const subPayload = {
          userId: numericUserId,
          provider: "razorpay",
          planId: plan.id,
          status: "active",
          currentPeriodStart,
          currentPeriodEnd,
          metadata: { createdBy: "free_activation" }
        };

        if (lastSub) {
          await prisma.subscription.update({
            where: { id: lastSub.id },
            data: subPayload
          });
        } else {
          await prisma.subscription.create({
            data: subPayload
          });
        }
      } catch (e) {
        console.error('Failed to upsert free Subscription', e && e.message ? e.message : e);
      }

      await prisma.user.update({
        where: { id: numericUserId },
        data: {
          subscriptionStatus: "trial",
          subscriptionPlan: plan.id,
          subscriptionExpiresAt: expiresAt,
          subscriptionStartedAt: currentPeriodStart,
        }
      });

      return res.status(200).json({ message: "Free plan activated", free: true });
    }

    if (!effectivePrice || Number(effectivePrice) <= 0) {
      return res.status(400).json({ message: "Plan price not configured" });
    }

    const user = await prisma.user.findUnique({
      where: { id: numericUserId },
      select: { name: true, email: true, phone: true }
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    const api = razorpayApi();
    const shortReceipt = `sub_${crypto.randomBytes(6).toString('hex')}`;
    const payload = {
      amount: Math.round(Number(effectivePrice) * 100),
      currency: plan.currency || getDefaultCurrency(),
      receipt: shortReceipt,
      notes: {
        userId: String(numericUserId),
        planId: String(plan.id),
      },
      payment_capture: 1,
    };

    const resp = await api.post("/orders", payload);
    const order = resp && resp.data ? resp.data : null;
    if (!order || !order.id) return res.status(500).json({ message: "Failed to create order" });

    // Record a pending subscription row
    try {
      const lastSub = await prisma.subscription.findFirst({
        where: { userId: numericUserId, provider: "razorpay", razorpayPaymentLinkId: null },
        orderBy: { createdAt: 'desc' }
      });

      const subPayload = {
        userId: numericUserId,
        provider: "razorpay",
        status: "pending",
        planId: plan.id,
        metadata: { createdBy: "order", razorpayOrderId: String(order.id) }
      };

      if (lastSub) {
        await prisma.subscription.update({
          where: { id: lastSub.id },
          data: subPayload
        });
      } else {
        await prisma.subscription.create({
          data: subPayload
        });
      }
    } catch (e) {
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

exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, planId } = req.body || {};
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment verification parameters" });
    }

    const { keySecret } = getRazorpayKeys();
    const expected = crypto.createHmac("sha256", keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (String(expected) !== String(razorpay_signature)) {
      return res.status(400).json({ message: "Signature verification failed" });
    }

    const numericUserId = parseInt(req.user.id);
    if (isNaN(numericUserId)) return res.status(401).json({ message: "Invalid user session" });

    const plan = await getPlanById(planId);
    if (!plan || plan.active === false) return res.status(400).json({ message: "Invalid planId" });

    const now = new Date();
    const currentPeriodStart = now;
    const currentPeriodEnd = new Date(now.getTime() + (Number(plan.durationDays || 30) * 24 * 60 * 60 * 1000));

    // Update subscription
    const existingSub = await prisma.subscription.findFirst({
      where: { userId: numericUserId, provider: "razorpay" },
      orderBy: { createdAt: 'desc' }
    });

    const subPayload = {
      userId: numericUserId,
      provider: "razorpay",
      planId: plan.id,
      status: "active",
      currentPeriodStart,
      currentPeriodEnd,
      razorpayPaymentId: String(razorpay_payment_id),
      metadata: { verifiedAt: new Date().toISOString(), via: "manual_verify" }
    };

    if (existingSub) {
      await prisma.subscription.update({
        where: { id: existingSub.id },
        data: subPayload
      });
    } else {
      await prisma.subscription.create({
        data: subPayload
      });
    }

    const subDoc = await prisma.subscription.findFirst({
      where: { userId: numericUserId, provider: "razorpay" },
      orderBy: { createdAt: 'desc' }
    });

    const userUpdate = {
      subscriptionStatus: "active",
      subscriptionPlan: plan.id,
      subscriptionExpiresAt: currentPeriodEnd,
      subscriptionStartedAt: currentPeriodStart,
    };

    await prisma.user.update({
      where: { id: numericUserId },
      data: userUpdate
    });

    return res.status(200).json({ ok: true, message: "Subscription activated", subscription: subDoc, user: userUpdate });
  } catch (err) {
    const status = err && err.response && err.response.status ? Number(err.response.status) : 500;
    return res.status(status).json({ message: err.message || "Verification failed" });
  }
};

exports.listAllSubscriptions = async (_req, res) => {
  const items = await prisma.subscription.findMany({
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 500
  });

  const out = items.map((it) => {
    const user = it.user || null;
    return {
      id: String(it.id),
      userId: user ? String(user.id) : null,
      userEmail: user ? String(user.email) : null,
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
  const items = await prisma.subscriptionPlan.findMany({
    orderBy: { durationDays: 'asc' }
  });
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

  for (const raw of arr) {
    if (!raw) continue;
    const id = String(raw.id || "").trim();
    if (!id) continue;

    const update = {};
    if (raw.label !== undefined) update.label = String(raw.label || "").trim() || id;
    if (raw.currency !== undefined) update.currency = String(raw.currency || "INR").trim() || "INR";
    if (raw.priceInr !== undefined) update.priceInr = toNumber(raw.priceInr);
    if (raw.durationDays !== undefined) update.durationDays = Math.trunc(toNumber(raw.durationDays));
    if (raw.active !== undefined) update.active = Boolean(raw.active);

    await prisma.subscriptionPlan.upsert({
      where: { id },
      update: update,
      create: {
        id,
        label: update.label || id,
        currency: update.currency || "INR",
        priceInr: update.priceInr || 0,
        durationDays: update.durationDays || 30,
        active: update.active !== false
      }
    });
  }

  const items = await prisma.subscriptionPlan.findMany({
    orderBy: { durationDays: 'asc' }
  });
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
  const exists = await prisma.subscriptionPlan.findUnique({
    where: { id: String(id).trim() }
  });
  if (exists) return res.status(400).json({ message: "Plan with this id already exists" });

  const plan = await prisma.subscriptionPlan.create({
    data: {
      id: String(id).trim(),
      label: String(label).trim(),
      priceInr: toNumber(priceInr),
      durationDays: Math.trunc(toNumber(durationDays)),
      currency: String(currency || "INR").trim(),
      active: active !== false,
    }
  });
  return res.status(201).json(plan);
};

// Delete a plan (admin)
exports.deletePlanAdmin = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: "Missing plan id" });
  try {
    await prisma.subscriptionPlan.delete({
      where: { id: String(id).trim() }
    });
    return res.status(200).json({ message: "Plan deleted" });
  } catch (e) {
    return res.status(404).json({ message: "Plan not found" });
  }
};