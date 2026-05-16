const mongoose = require("mongoose");

const accommodationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    category: { type: String, default: "Accommodation" },
    type: { type: String, required: true }, // e.g., "Apartment", "House", "Student Housing", "Shared Room"
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String },
    zipCode: { type: String },
    phone: { type: String },
    email: { type: String },
    website: { type: String },
    description: { type: String },
    rent: { type: Number }, // Monthly rent
    deposit: { type: Number },
    bedrooms: { type: Number },
    bathrooms: { type: Number },
    area: { type: Number }, // in square meters
    furnished: { type: Boolean, default: false },
    petsAllowed: { type: Boolean, default: false },
    parkingAvailable: { type: Boolean, default: false },
    utilities: { type: String }, // e.g., "Included", "Not Included"
    availableFrom: { type: Date },
    image: { type: String },
    latitude:  { type: Number },
    longitude: { type: Number },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalRatings: { type: Number, default: 0, min: 0 },
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
  },
  { 
    timestamps: true,
    collection: "accommodations"
  }
);

module.exports =
  mongoose.models.Accommodation ||
  mongoose.model("Accommodation", accommodationSchema);
