const mongoose = require("mongoose");

const MODEL_NAME = "JobListing";
const COLLECTION_NAME = "jobs";

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      default: "Job",
    },
    companyName: String,
    companyLogo: String,
    location: String,
    description: String,
    contact: String,
    salary: String,
    jobType: {
      type: String,
      enum: ["Full Time", "Part Time"],
      default: "Full Time",
    },
    requirements: String,
    benefits: String,
    applyUrl: String,
    status: {
      type: String,
      default: "Active",
    },
    amenities: [String],
  },
  { timestamps: true }
);

// Indexes to speed up admin listing queries
jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ companyName: 1 });

// Collection name: jobs
module.exports =
  mongoose.models[MODEL_NAME] ||
  mongoose.model(MODEL_NAME, jobSchema, COLLECTION_NAME);