const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    // ── New canonical fields (as requested) ─────────────────────────────────
    title: { type: String, trim: true },
    providerName: { type: String, trim: true },
    category: { type: String, trim: true, default: "Services" },
    description: { type: String, trim: true },

    location: { type: String, trim: true },
    latitude: { type: Number },
    longitude: { type: Number },
    address: { type: String, trim: true },

    phone: { type: String, trim: true, required: true },
    whatsapp: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, required: true },
    website: { type: String, trim: true },

    images: { type: [String], default: [] },
    amenities: { type: [String], default: [] },

    // Back-compat rating fields used by some clients
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },

    // Universal rating aggregates (same shape as Food/Accommodation/Jobs)
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalRatings: { type: Number, default: 0, min: 0 },
    ratingDistribution: {
      1: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      5: { type: Number, default: 0 },
    },
    lastRatedAt: { type: Date, default: null },

    priceRange: { type: String, trim: true, default: null },
    isActive: { type: Boolean, default: true },

    // ── Legacy / compatibility fields still referenced by routes/controllers ─
    serviceName: { type: String, trim: true },
    serviceType: { type: String, trim: true },
    provider: { type: String, trim: true },
    city: { type: String, trim: true },
    area: { type: String, trim: true, default: null },
    postalCode: { type: String, trim: true, default: null },
    contactPhone: { type: String, trim: true },
    media: {
      images: { type: [String], default: [] },
    },
    status: {
      type: String,
      enum: [
        "Active",
        "Pending",
        "Inactive",
        "active",
        "disabled",
        "pending",
      ],
      default: "Active",
    },

    // Existing flags (kept for backward compatibility)
    featured: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: "services",
  }
);

serviceSchema.pre("validate", function syncServiceFields() {
  // Title/name
  if (!this.title && this.serviceName) this.title = this.serviceName;
  if (!this.serviceName && this.title) this.serviceName = this.title;

  // Provider
  if (!this.providerName && this.provider) this.providerName = this.provider;
  if (!this.provider && this.providerName) this.provider = this.providerName;

  // Category/type
  if (!this.category && this.serviceType) this.category = this.serviceType;
  if (!this.serviceType && this.category) this.serviceType = this.category;

  // Location/city
  if (!this.location && this.city) this.location = this.city;
  if (!this.city && this.location) this.city = this.location;

  // Phone/contactPhone
  if (!this.phone && this.contactPhone) this.phone = this.contactPhone;
  if (!this.contactPhone && this.phone) this.contactPhone = this.phone;

  // Images/media.images
  if (Array.isArray(this.images) && this.images.length === 0 && this.media?.images?.length) {
    this.images = this.media.images;
  }
  if (this.media && Array.isArray(this.media.images) && this.media.images.length === 0 && this.images?.length) {
    this.media.images = this.images;
  }

  // Keep rating fields in sync (so older UI that reads rating/ratingCount still works)
  if ((this.averageRating ?? 0) > 0 && (this.rating ?? 0) === 0) {
    this.rating = this.averageRating;
  }
  if ((this.totalRatings ?? 0) > 0 && (this.ratingCount ?? 0) === 0) {
    this.ratingCount = this.totalRatings;
  }
  if ((this.rating ?? 0) > 0 && (this.averageRating ?? 0) === 0) {
    this.averageRating = this.rating;
  }
  if ((this.ratingCount ?? 0) > 0 && (this.totalRatings ?? 0) === 0) {
    this.totalRatings = this.ratingCount;
  }

  // Active/status
  if (this.isActive === undefined || this.isActive === null) {
    const s = String(this.status || "").toLowerCase();
    this.isActive = s === "active";
  }
  if (!this.status) {
    this.status = this.isActive ? "Active" : "Inactive";
  }

});

// Indexes for faster admin queries
serviceSchema.index({ status: 1, createdAt: -1 });
serviceSchema.index({ providerName: 1, city: 1 });

module.exports = mongoose.models.Service || mongoose.model("Service", serviceSchema);
