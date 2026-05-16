const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    provider: {
      type: String,
      enum: ["razorpay"],
      default: "razorpay",
      index: true,
    },

    planId: { type: String, default: null }, // e.g. monthly/yearly (app-level id)

    status: {
      type: String,
      enum: ["none", "pending", "active", "past_due", "canceled"],
      default: "none",
      index: true,
    },

    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },

    razorpayPaymentLinkId: { type: String, default: null, index: true, sparse: true },
    razorpayPaymentId: { type: String, default: null, index: true, sparse: true },

    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

subscriptionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Subscription", subscriptionSchema);