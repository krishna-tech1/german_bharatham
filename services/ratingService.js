const UniversalRating = require("../models/Rating");
const FoodGrocery = require("../foodGroceryModule/admin/model/FoodGrocery");
const Accommodation = require("../accommodationModule/admin/model/Accommodation");
const Job = require("../jobsModule/admin/model/Job");
const Service = require("../servicesModule/admin/model/Service");

class RatingService {
  
  /**
   * Get the correct model based on entity type
   */
  static getEntityModel(entityType) {
    const models = {
      'foodgrocery': FoodGrocery,
      'accommodation': Accommodation,
      'job': Job,
      'service': Service,
    };
    
    const model = models[entityType];
    if (!model) {
      throw new Error(`Invalid entity type: ${entityType}`);
    }
    return model;
  }

  /**
   * Submit a new rating
   */
  static async submitRating({ userId, userName, userType, entityId, entityType, rating, review, deviceInfo }) {
    try {
      // Validate rating value
      if (rating < 1 || rating > 5) {
        throw new Error("Rating must be between 1 and 5");
      }

      // Validate entity exists
      const EntityModel = this.getEntityModel(entityType);
      const entity = await EntityModel.findById(entityId);
      if (!entity) {
        throw new Error(`${entityType} not found`);
      }

      // Create new rating
      const newRating = await UniversalRating.create({
        userId,
        userName: userName || "Anonymous User",
        userType: userType || "guest",
        entityId,
        entityType,
        rating,
        review: review || "",
        deviceInfo: deviceInfo || {},
        status: "active"
      });

      // Recalculate and update entity rating
      await this.updateEntityRating(entityId, entityType);

      return {
        success: true,
        rating: newRating,
        message: "Rating submitted successfully"
      };

    } catch (error) {
      console.error("Error submitting rating:", error);
      throw error;
    }
  }

  /**
   * Update entity's average rating (CRITICAL FUNCTION)
   */
  static async updateEntityRating(entityId, entityType) {
    try {
      // Calculate new average using the Rating model's static method
      const stats = await UniversalRating.calculateAverage(entityId, entityType);

      // Update the entity with new rating data
      const EntityModel = this.getEntityModel(entityType);
      await EntityModel.findByIdAndUpdate(
        entityId,
        {
          averageRating: stats.averageRating,
          totalRatings: stats.totalRatings,
          ratingDistribution: stats.distribution,
          lastRatedAt: new Date()
        },
        { new: true }
      );

      return stats;

    } catch (error) {
      console.error("Error updating entity rating:", error);
      throw error;
    }
  }

  /**
   * Get all ratings for an entity
   */
  static async getEntityRatings(entityId, entityType, options = {}) {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = -1 } = options;

      const query = {
        entityId,
        entityType,
        status: "active"
      };

      const ratings = await UniversalRating.find(query)
        .sort({ [sortBy]: sortOrder })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean();

      const total = await UniversalRating.countDocuments(query);

      return {
        ratings,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      console.error("Error fetching ratings:", error);
      throw error;
    }
  }

  /**
   * Get user's rating for a specific entity
   */
  static async getUserRating(userId, entityId, entityType) {
    try {
      const rating = await UniversalRating.getUserRating(userId, entityId, entityType);
      return rating;
    } catch (error) {
      console.error("Error fetching user rating:", error);
      throw error;
    }
  }

  /**
   * Check if user has rated an entity
   */
  static async hasUserRated(userId, entityId, entityType) {
    try {
      const hasRated = await UniversalRating.hasUserRated(userId, entityId, entityType);
      return hasRated;
    } catch (error) {
      console.error("Error checking user rating:", error);
      throw error;
    }
  }

  /**
   * Get rating statistics for an entity
   */
  static async getEntityRatingStats(entityId, entityType) {
    try {
      const EntityModel = this.getEntityModel(entityType);
      const entity = await EntityModel.findById(entityId)
        .select('averageRating totalRatings ratingDistribution')
        .lean();

      if (!entity) {
        return {
          averageRating: 0,
          totalRatings: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        };
      }

      return {
        averageRating: entity.averageRating || 0,
        totalRatings: entity.totalRatings || 0,
        distribution: entity.ratingDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      };

    } catch (error) {
      console.error("Error fetching rating stats:", error);
      throw error;
    }
  }

  /**
   * Delete a rating (admin only)
   */
  static async deleteRating(ratingId) {
    try {
      const rating = await UniversalRating.findById(ratingId);
      if (!rating) {
        throw new Error("Rating not found");
      }

      // Delete the rating
      await UniversalRating.findByIdAndDelete(ratingId);

      // Recalculate entity rating
      await this.updateEntityRating(rating.entityId, rating.entityType);

      return {
        success: true,
        message: "Rating deleted successfully"
      };

    } catch (error) {
      console.error("Error deleting rating:", error);
      throw error;
    }
  }
}

module.exports = RatingService;
