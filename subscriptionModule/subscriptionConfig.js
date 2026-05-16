const toBool = (v) => String(v || "").trim().toLowerCase() === "true";

const toInt = (v) => {
  const n = Number(String(v || "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

const moneyPaiseFromRupees = (rupees) => {
  const n = Number(String(rupees || "").trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
};

const plans = () => {
  // Razorpay configuration:
  // Provide amounts in INR (rupees). Backend converts to paise.
  // Example:
  //   SUBSCRIPTIONS_MONTHLY_PRICE_INR=199
  //   SUBSCRIPTIONS_YEARLY_PRICE_INR=1999
  // Optional duration days:
  //   SUBSCRIPTIONS_MONTHLY_DAYS=30
  //   SUBSCRIPTIONS_YEARLY_DAYS=365

  const currency = String(process.env.SUBSCRIPTIONS_CURRENCY || "INR").trim() || "INR";

  const monthlyPriceInr = String(process.env.SUBSCRIPTIONS_MONTHLY_PRICE_INR || "").trim();
  const yearlyPriceInr = String(process.env.SUBSCRIPTIONS_YEARLY_PRICE_INR || "").trim();

  const monthlyDays = toInt(process.env.SUBSCRIPTIONS_MONTHLY_DAYS || 30) || 30;
  const yearlyDays = toInt(process.env.SUBSCRIPTIONS_YEARLY_DAYS || 365) || 365;

  const list = [];
  if (monthlyPriceInr) {
    const amountPaise = moneyPaiseFromRupees(monthlyPriceInr);
    if (amountPaise > 0) {
      list.push({
        id: "monthly",
        label: "Monthly",
        price: Number(monthlyPriceInr),
        currency,
        durationDays: monthlyDays,
        amountPaise,
      });
    }
  }
  if (yearlyPriceInr) {
    const amountPaise = moneyPaiseFromRupees(yearlyPriceInr);
    if (amountPaise > 0) {
      list.push({
        id: "yearly",
        label: "Yearly",
        price: Number(yearlyPriceInr),
        currency,
        durationDays: yearlyDays,
        amountPaise,
      });
    }
  }

  return list;
};

module.exports = {
  plans,
  allowMock: toBool(process.env.SUBSCRIPTIONS_ALLOW_MOCK),
  promptAfterDays: Number(process.env.SUBSCRIPTIONS_PROMPT_AFTER_DAYS || 7),
};