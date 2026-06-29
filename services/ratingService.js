const prisma = require("../config/prisma");

class RatingService {
  
  /**
   * Helper to map entities and perform update on correct Prisma model
   */
  static async updateEntityRatingFields(entityId, entityType, updateFields) {
    const numericId = parseInt(entityId);
    if (isNaN(numericId)) throw new Error("Invalid entity ID format");

    const type = String(entityType).toLowerCase();
    if (type === "foodgrocery") {
      return prisma.foodGrocery.update({
        where: { id: numericId },
        data: updateFields
      });
    } else if (type === "accommodation") {
      return prisma.accommodation.update({
        where: { id: numericId },
        data: updateFields
      });
    } else if (type === "job") {
      return prisma.jobListing.update({
        where: { id: numericId },
        data: updateFields
      });
    } else if (type === "service") {
      return prisma.service.update({
        where: { id: numericId },
        data: updateFields
      });
    } else {
      throw new Error(`Invalid entity type: ${entityType}`);
    }
  }

  /**
   * Helper to verify if entity exists
   */
  static async verifyEntityExists(entityId, entityType) {
    const numericId = parseInt(entityId);
    if (isNaN(numericId)) return false;

    const type = String(entityType).toLowerCase();
    let entity = null;
    if (type === "foodgrocery") {
      entity = await prisma.foodGrocery.findUnique({ where: { id: numericId } });
    } else if (type === "accommodation") {
      entity = await prisma.accommodation.findUnique({ where: { id: numericId } });
    } else if (type === "job") {
      entity = await prisma.jobListing.findUnique({ where: { id: numericId } });
    } else if (type === "service") {
      entity = await prisma.service.findUnique({ where: { id: numericId } });
    }

    return !!entity;
  }

  /**
   * Submit a new rating
   */
  static async submitRating({ userId, userName, userType, entityId, entityType, rating, review, deviceInfo }) {
    try {
      if (rating < 1 || rating > 5) {
        throw new Error("Rating must be between 1 and 5");
      }

      const numericEntityId = parseInt(entityId);
      if (isNaN(numericEntityId)) throw new Error("Invalid entity ID format");

      // Validate entity exists
      const exists = await this.verifyEntityExists(numericEntityId, entityType);
      if (!exists) {
        throw new Error(`${entityType} not found`);
      }

      // Create new rating
      const newRating = await prisma.universalRating.create({
        data: {
          userId: String(userId),
          userName: userName || "Anonymous User",
          userType: userType || "guest",
          entityId: numericEntityId,
          entityType: String(entityType).toLowerCase(),
          rating: parseInt(rating),
          review: review || "",
          deviceInfo: deviceInfo || {},
          status: "active"
        }
      });

      // Recalculate and update entity rating
      await this.updateEntityRating(numericEntityId, entityType);

      return {
        success: true,
        rating: {
          ...newRating,
          _id: String(newRating.id)
        },
        message: "Rating submitted successfully"
      };

    } catch (error) {
      console.error("Error submitting rating:", error);
      throw error;
    }
  }

  /**
   * Update entity's average rating
   */
  static async updateEntityRating(entityId, entityType) {
    try {
      const numericEntityId = parseInt(entityId);
      if (isNaN(numericEntityId)) throw new Error("Invalid entity ID");

      const type = String(entityType).toLowerCase();

      // Find all active ratings
      const ratings = await prisma.universalRating.findMany({
        where: {
          entityId: numericEntityId,
          entityType: type,
          status: "active"
        }
      });

      const totalRatings = ratings.length;
      const sumRatings = ratings.reduce((sum, r) => sum + r.rating, 0);
      const averageRating = totalRatings > 0 ? parseFloat((sumRatings / totalRatings).toFixed(1)) : 0;

      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      ratings.forEach(r => {
        if (r.rating >= 1 && r.rating <= 5) {
          distribution[r.rating]++;
        }
      });

      const updateFields = {
        averageRating,
        totalRatings,
        ratingDistribution: distribution,
        lastRatedAt: new Date()
      };

      if (type === "service") {
        updateFields.rating = averageRating;
        updateFields.ratingCount = totalRatings;
      }

      await this.updateEntityRatingFields(numericEntityId, type, updateFields);

      return {
        averageRating,
        totalRatings,
        distribution
      };

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
      const numericEntityId = parseInt(entityId);
      if (isNaN(numericEntityId)) throw new Error("Invalid entity ID");

      const where = {
        entityId: numericEntityId,
        entityType: String(entityType).toLowerCase(),
        status: "active"
      };

      const total = await prisma.universalRating.count({ where });

      const ratings = await prisma.universalRating.findMany({
        where,
        orderBy: { [sortBy]: sortOrder === 1 ? 'asc' : 'desc' },
        skip: (page - 1) * limit,
        take: limit
      });

      const mapped = ratings.map(r => ({
        ...r,
        _id: String(r.id)
      }));

      return {
        ratings: mapped,
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
      const numericEntityId = parseInt(entityId);
      if (isNaN(numericEntityId)) return null;

      const rating = await prisma.universalRating.findFirst({
        where: {
          userId: String(userId),
          entityId: numericEntityId,
          entityType: String(entityType).toLowerCase(),
          status: "active"
        }
      });

      if (!rating) return null;
      return {
        ...rating,
        _id: String(rating.id)
      };
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
      const rating = await this.getUserRating(userId, entityId, entityType);
      return !!rating;
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
      const numericEntityId = parseInt(entityId);
      if (isNaN(numericEntityId)) {
        return {
          averageRating: 0,
          totalRatings: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        };
      }

      const type = String(entityType).toLowerCase();
      let entity = null;
      if (type === "foodgrocery") {
        entity = await prisma.foodGrocery.findUnique({ where: { id: numericEntityId } });
      } else if (type === "accommodation") {
        entity = await prisma.accommodation.findUnique({ where: { id: numericEntityId } });
      } else if (type === "job") {
        entity = await prisma.jobListing.findUnique({ where: { id: numericEntityId } });
      } else if (type === "service") {
        entity = await prisma.service.findUnique({ where: { id: numericEntityId } });
      }

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
      const numericRatingId = parseInt(ratingId);
      if (isNaN(numericRatingId)) throw new Error("Invalid rating ID");

      const rating = await prisma.universalRating.findUnique({
        where: { id: numericRatingId }
      });
      if (!rating) {
        throw new Error("Rating not found");
      }

      // Delete the rating
      await prisma.universalRating.delete({
        where: { id: numericRatingId }
      });

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
