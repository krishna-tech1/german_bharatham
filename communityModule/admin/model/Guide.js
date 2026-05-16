const mongoose = require("mongoose");

const guideSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    category: { type: String },
    readTime: { type: Number },
    description: String,
    keyPoints: { type: [String], default: [] },
    content: String,
    officialWebsites: String,
    communityDiscussions: String,
    author: {
      type: String,
      default: "German Bharatham Team",
    },
    date: {
      type: String,
      default: () => new Date().toDateString(),
    },
  },
  { 
    timestamps: true,
    collection: "community"   // 🔥 THIS LINE FORCES COLLECTION NAME
  }
);

module.exports =
  mongoose.models.Community ||
  mongoose.model("Community", guideSchema);