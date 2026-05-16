const mongoose = require("mongoose");

const foodGrocerySchema = new mongoose.Schema(
  {
    title: { type: String, required: true }, // Changed from 'name' to 'title' for consistency
    category: { type: String, default: "Food" }, // Main category
    subCategory: { type: String, required: true }, // e.g., "Restaurant", "Grocery Store", "Bakery", etc.
    type: { type: String }, // e.g., "Indian", "Italian", "Organic", etc.
    location: { type: String, required: true }, // Combined address for display
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String },
    zipCode: { type: String },
    phone: { type: String },
    email: { type: String },
    website: { type: String },
    description: { type: String },
    openingHours: { type: String },
    priceRange: { type: String }, // e.g., "$", "$$", "$$$"
    rating: { type: Number, default: 0 },
    cuisine: { type: [String], default: [] }, // For restaurants
    specialties: { type: [String], default: [] },
    deliveryAvailable: { type: Boolean, default: false },
    takeoutAvailable: { type: Boolean, default: false },
    dineInAvailable: { type: Boolean, default: false },
    cateringAvailable: { type: Boolean, default: false },
    image: { type: String },
    latitude:  { type: Number },
    longitude: { type: Number },
    averageRating: { type: Number, default: 0, min: 0, max: 5 }, // Calculated from all ratings
    totalRatings: { type: Number, default: 0, min: 0 }, // Count of ratings
    ratingDistribution: {
      1: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      5: { type: Number, default: 0 }
    },
    lastRatedAt: { type: Date },
    status: { type: String, enum: ['Active', 'Pending', 'Inactive'], default: 'Pending' },
    featured: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
  },
  { 
    timestamps: true,
    collection: "foodgrocery"
  }
);

foodGrocerySchema.pre('validate', function() {
  if (this.status != null) {
    const raw = String(this.status).trim().toLowerCase();
    if (raw === 'active') this.status = 'Active';
    else if (raw === 'pending') this.status = 'Pending';
    else if (raw === 'inactive' || raw === 'disabled') this.status = 'Inactive';
  }
});

// Indexes for faster admin queries
foodGrocerySchema.index({ status: 1, createdAt: -1 });
foodGrocerySchema.index({ city: 1 });

module.exports =
  mongoose.models.FoodGrocery ||
  mongoose.model("FoodGrocery", foodGrocerySchema);