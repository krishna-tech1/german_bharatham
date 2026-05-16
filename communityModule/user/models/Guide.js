const mongoose = require("mongoose");

const guideSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    category: { type: String, default: "Guide" },
    readTime: { type: Number, default: 5 },
    description: String,
    keyPoints: { type: [String], default: [] },
    officialWebsites: String,
    communityDiscussions: String,
    author: {
      type: String,
      default: "German Bharatham Team"
    },
    date: {
      type: String,
      default: () => new Date().toDateString()
    }
  },
  { 
    timestamps: true,
    collection: "community"   // 🔥 THIS LINE FORCES COLLECTION NAME
  }
);

module.exports = mongoose.model("Community", guideSchema);