const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    category: { type: String, default: "Job" },
    company: { type: String, required: true },
    jobType: { type: String, required: true }, // e.g., "Full-time", "Part-time", "Contract", "Internship"
    location: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String },
    remote: { type: Boolean, default: false },
    salary: { type: String }, // e.g., "$50,000 - $70,000"
    email: { type: String },
    website: { type: String },
    phone: { type: String },
    description: { type: String },
    requirements: { type: [String], default: [] },
    responsibilities: { type: [String], default: [] },
    benefits: { type: [String], default: [] },
    experience: { type: String }, // e.g., "2-5 years"
    education: { type: String },
    applyUrl: { type: String, required: true },
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
    status: {
      type: String,
      enum: ['Active', 'Pending', 'Inactive', 'active', 'pending', 'inactive', 'disabled'],
      default: 'Pending',
    },
    featured: { type: Boolean, default: false },
    expiresAt: { type: Date },
  },
  { 
    timestamps: true,
    collection: "jobs"
  }
);

jobSchema.pre('validate', function() {
  if (this.status != null) {
    const raw = String(this.status).trim().toLowerCase();
    if (raw === 'active') this.status = 'Active';
    else if (raw === 'pending') this.status = 'Pending';
    else if (raw === 'inactive' || raw === 'disabled') this.status = 'Inactive';
  }
});

module.exports =
  mongoose.models.Job ||
  mongoose.model("Job", jobSchema);
