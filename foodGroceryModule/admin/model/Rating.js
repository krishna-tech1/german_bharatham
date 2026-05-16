const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema(
  {
    foodGroceryId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'FoodGrocery', 
      required: true 
    },
    userId: { 
      type: String, // Changed to String to support both guest and registered users
      required: true 
    },
    userName: { type: String }, // Cache user name for display
    rating: { 
      type: Number, 
      required: true, 
      min: 1, 
      max: 5 
    },
    comment: { 
      type: String, 
      default: "" 
    },
  },
  { 
    timestamps: true,
    collection: "ratings"
  }
);

// Index for faster queries
ratingSchema.index({ foodGroceryId: 1, createdAt: -1 });
ratingSchema.index({ userId: 1, foodGroceryId: 1 });

module.exports = mongoose.models.Rating || mongoose.model("Rating", ratingSchema);