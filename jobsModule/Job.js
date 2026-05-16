const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    jobTitle: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    description: { type: String, default: null, trim: true },
    city: { type: String, required: true, trim: true },
    area: { type: String, default: null, trim: true },
    address: { type: String, default: null, trim: true },
    contactPhone: { type: String, required: true, trim: true },
    salary: { type: String, default: null, trim: true },
    jobType: {
      type: String,
      enum: ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'],
      default: 'Full-time'
    },
    skills: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'disabled', 'pending'], default: 'active' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Job', jobSchema);
