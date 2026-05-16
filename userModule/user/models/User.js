const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    // Password is optional for social-login users.
    password: { type: String, required: false, default: null },

    authProvider: {
      type: String,
      enum: ["local", "google", "facebook", "apple"],
      default: "local",
    },
    googleId: { type: String, default: null, index: true, sparse: true },
    facebookId: { type: String, default: null, index: true, sparse: true },
    appleSub: { type: String, default: null, index: true, sparse: true },
    role: {
      type: String,
      enum: ["user", "admin"],  // Only 'user' or 'admin' allowed
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    photo: { type: String, default: null },

    // Extended profile fields
    dob:           { type: String, default: '' },
    gender:        { type: String, default: '' },
    location:      { type: String, default: '' },
    preferredCity: { type: String, default: '' },
    education:     { type: String, default: '' },
    profession:    { type: String, default: '' },
    germanLevel:   { type: String, default: '' },
    passport:      { type: String, default: '' },

    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // Subscription / billing
    subscriptionStatus: {
      type: String,
      enum: ["none", "trial", "active", "past_due", "canceled"],
      default: "none",
    },
    subscriptionPlan: { type: String, default: null },
    subscriptionExpiresAt: { type: Date, default: null },
    subscriptionStartedAt: { type: Date, default: null },

    // Login tracking (used for 7-day subscription prompt)
    firstLoginAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema, "user");