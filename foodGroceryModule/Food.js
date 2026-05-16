const mongoose = require('mongoose');

const foodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    restaurantName: { type: String, default: null, trim: true },
    cuisine: { type: String, default: null, trim: true },
    description: { type: String, default: null, trim: true },
    city: { type: String, required: true, trim: true },
    area: { type: String, default: null, trim: true },
    address: { type: String, default: null, trim: true },
    postalCode: { type: String, default: null, trim: true },
    contactPhone: { type: String, required: true, trim: true },
    priceRange: { type: String, default: null, trim: true },
    openingHours: { type: String, default: null, trim: true },
    amenities: { type: [String], default: [] },
    media: {
      images: { type: [String], default: [] }
    },
    status: { type: String, enum: ['Active', 'Pending', 'Inactive', 'active', 'disabled', 'pending'], default: 'Pending' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Food', foodSchema);