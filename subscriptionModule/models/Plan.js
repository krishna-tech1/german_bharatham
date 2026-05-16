const mongoose = require("mongoose");

const planSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true }, // e.g. 1m, 3m, 6m, 1y
    label: { type: String, required: true },
    currency: { type: String, default: "INR" },
    priceInr: { type: Number, default: 0 },
    durationDays: { type: Number, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SubscriptionPlan", planSchema);
