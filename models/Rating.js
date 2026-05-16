const mongoose = require("mongoose");

const universalRatingSchema = new mongoose.Schema(
  {
    // USER INFORMATION
    userId: { 
      type: String, 
      required: true,
      index: true
    },
    userName: { 
      type: String,
      default: "Anonymous User"
    },
    userType: {
      type: String,
      enum: ["guest", "registered"],
      default: "guest"
    },
    
    // ENTITY INFORMATION (Universal Design)
    entityId: { 
      type: mongoose.Schema.Types.ObjectId, 
      required: true,
      index: true
    },
    entityType: { 
      type: String, 
      required: true,
      enum: ["foodgrocery", "accommodation", "job", "service"],
      index: true
    },
    
    // RATING DATA
    rating: { 
      type: Number, 
      required: true, 
      min: 1, 
      max: 5 
    },
    review: { 
      type: String,
      maxlength: 500,
      default: ""
    },
    
    // METADATA
    deviceInfo: {
      platform: String, // "android", "ios", "web"
      version: String
    },
    
    // STATUS
    status: {
      type: String,
      enum: ["active", "hidden", "reported"],
      default: "active"
    }
  },
  { 
    timestamps: true,
    collection: "universal_ratings"
  }
);

// COMPOUND INDEXES FOR PERFORMANCE
universalRatingSchema.index({ entityId: 1, entityType: 1, createdAt: -1 });
universalRatingSchema.index({ userId: 1, entityId: 1, entityType: 1 });
universalRatingSchema.index({ entityType: 1, rating: -1 });

// STATIC METHOD: Calculate average rating for any entity
universalRatingSchema.statics.calculateAverage = async function(entityId, entityType) {
  const result = await this.aggregate([
    {
      $match: {
        entityId: new mongoose.Types.ObjectId(entityId),
        entityType: entityType,
        status: "active"
      }
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating" },
        totalRatings: { $sum: 1 },
        ratingDistribution: {
          $push: "$rating"
        }
      }
    }
  ]);

  if (result.length === 0) {
    return {
      averageRating: 0,
      totalRatings: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };
  }

  // Calculate distribution
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  result[0].ratingDistribution.forEach(rating => {
    distribution[rating] = (distribution[rating] || 0) + 1;
  });

  return {
    averageRating: Math.round(result[0].averageRating * 10) / 10, // Round to 1 decimal
    totalRatings: result[0].totalRatings,
    distribution: distribution
  };
};

// INSTANCE METHOD: Check if user already rated
universalRatingSchema.statics.hasUserRated = async function(userId, entityId, entityType) {
  const rating = await this.findOne({ userId, entityId, entityType });
  return !!rating;
};

// INSTANCE METHOD: Get user's rating for entity
universalRatingSchema.statics.getUserRating = async function(userId, entityId, entityType) {
  return await this.findOne({ userId, entityId, entityType });
};

module.exports = mongoose.models.UniversalRating || 
  mongoose.model("UniversalRating", universalRatingSchema);
