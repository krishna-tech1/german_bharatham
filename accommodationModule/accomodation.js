const mongoose = require("mongoose");

// ── Sub-schemas (no _id, no null defaults) ───────────────────────────────────

const rentDetailsSchema = new mongoose.Schema(
  {
    coldRent:           { type: Number },
    warmRent:           { type: Number },
    additionalCosts:    { type: Number },
    deposit:            { type: Number },
    electricityIncluded:{ type: Boolean },
    heatingIncluded:    { type: Boolean },
    internetIncluded:   { type: Boolean }
  },
  { _id: false }
);

const propertyDetailsSchema = new mongoose.Schema(
  {
    sizeSqm:    { type: Number },
    bedrooms:   { type: Number },
    bathrooms:  { type: Number },
    totalFloors:{ type: Number }
  },
  { _id: false }
);

const amenitiesSchema = new mongoose.Schema(
  {
    balcony:    { type: Boolean },
    terrace:    { type: Boolean },
    garden:     { type: Boolean },
    lift:       { type: Boolean },
    parking:    { type: Boolean },
    garage:     { type: Boolean },
    cellar:     { type: Boolean },
    kitchen:    { type: Boolean }
  },
  { _id: false }
);

const locationHighlightsSchema = new mongoose.Schema(
  {
    nearUniversity:    { type: Boolean },
    nearSupermarket:   { type: Boolean },
    nearHospital:      { type: Boolean },
    nearPublicTransport:{ type: Boolean }
  },
  { _id: false }
);

const mediaSchema = new mongoose.Schema(
  {
    images: { type: [String], default: [] }
  },
  { _id: false }
);

const adminControlsSchema = new mongoose.Schema(
  {
    isActive: { type: Boolean, default: true }
  },
  { _id: false }
);

// ── Main schema ──────────────────────────────────────────────────────────────

const accommodationSchema = new mongoose.Schema(
  {
    title:        { type: String, trim: true },
    description:  { type: String, trim: true },
    propertyType: { type: String, trim: true },

    city: { type: String, trim: true },

    rentDetails:       { type: rentDetailsSchema,       default: () => ({}) },
    propertyDetails:   { type: propertyDetailsSchema,   default: () => ({}) },
    amenities:         { type: amenitiesSchema,         default: () => ({}) },
    locationHighlights:{ type: locationHighlightsSchema,default: () => ({}) },
    media:             { type: mediaSchema,             default: () => ({}) },
    adminControls:     { type: adminControlsSchema,     default: () => ({}) },

    contactPhone: { type: String, trim: true },
    status: { type: String, enum: ['Active', 'Pending', 'Inactive', 'active', 'disabled', 'pending'], default: 'Pending' },

    // Geocoded coordinates (auto-populated from city on save)
    latitude:  { type: Number },
    longitude: { type: Number },
    
    // RATING FIELDS (Universal Rating System)
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
  },
  { timestamps: true, versionKey: false }
);

// Strip undefined/null fields from API responses
function stripNulls(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  // Preserve BSON types (ObjectId), Date, Buffer — convert to their primitive form
  if (obj._bsontype) return obj.toString();
  if (obj instanceof Date) return obj;
  if (Buffer.isBuffer(obj)) return obj.toString('hex');
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, typeof v === 'object' ? stripNulls(v) : v])
  );
}

accommodationSchema.set('toJSON', {
  transform: (doc, ret) => stripNulls(ret)
});

// Indexes to speed up admin listing queries and pending counts
accommodationSchema.index({ status: 1, createdAt: -1 });
accommodationSchema.index({ 'adminControls.isActive': 1, createdAt: -1 });

module.exports = mongoose.model("Accommodation", accommodationSchema);
