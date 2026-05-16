const express = require("express");
const router = express.Router();
const RatingService = require("../services/ratingService");

// Middleware to handle guest users
const protectOrGuest = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      // No token = treat as guest
      const guestId = req.headers['x-guest-id'] || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      req.user = {
        id: guestId,
        name: req.headers['x-user-name'] || 'Guest User',
        isGuest: true
      };
      return next();
    }

    // Check if it's a guest token
    if (token.startsWith('guest_token_')) {
      const guestId = token.replace('guest_token_', '');
      req.user = {
        id: `guest_${guestId}`,
        name: 'Guest User',
        isGuest: true
      };
      return next();
    }

    // For regular tokens, verify JWT
    const jwt = require("jsonwebtoken");
    const User = require("../userModule/user/models/User");
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    // If JWT fails, treat as guest
    const guestId = req.headers['x-guest-id'] || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    req.user = {
      id: guestId,
      name: 'Guest User',
      isGuest: true
    };
    next();
  }
};

// @route   POST /api/ratings/submit
// @desc    Submit a rating for any entity
// @access  Public (Guest or Authenticated)
// @body    { entityId, entityType, rating, review }
router.post("/submit", protectOrGuest, async (req, res) => {
  try {
    const { entityId, entityType, rating, review } = req.body;

    // Validation
    if (!entityId || !entityType || !rating) {
      return res.status(400).json({ 
        success: false,
        message: "entityId, entityType, and rating are required" 
      });
    }

    // Get user info
    const userId = req.user.id || req.user._id?.toString();
    const userName = req.user.name || req.user.username || "Anonymous User";
    const userType = req.user.isGuest ? "guest" : "registered";

    // Device info from headers
    const deviceInfo = {
      platform: req.headers['x-platform'] || 'unknown',
      version: req.headers['x-app-version'] || 'unknown'
    };

    // Submit rating
    const result = await RatingService.submitRating({
      userId,
      userName,
      userType,
      entityId,
      entityType,
      rating: parseInt(rating),
      review,
      deviceInfo
    });

    res.status(201).json(result);

  } catch (error) {
    console.error("Error submitting rating:", error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// @route   GET /api/ratings/:entityType/:entityId
// @desc    Get all ratings for an entity with pagination
// @access  Public
// @query   page, limit, sortBy, sortOrder
router.get("/:entityType/:entityId", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { page, limit, sortBy, sortOrder } = req.query;

    const result = await RatingService.getEntityRatings(
      entityId,
      entityType,
      {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        sortBy: sortBy || 'createdAt',
        sortOrder: sortOrder === 'asc' ? 1 : -1
      }
    );

    res.json(result);

  } catch (error) {
    console.error("Error fetching ratings:", error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// @route   GET /api/ratings/:entityType/:entityId/stats
// @desc    Get rating statistics for an entity
// @access  Public
router.get("/:entityType/:entityId/stats", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    const stats = await RatingService.getEntityRatingStats(entityId, entityType);

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error("Error fetching rating stats:", error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// @route   GET /api/ratings/:entityType/:entityId/user
// @desc    Get current user's rating for an entity
// @access  Public (Guest or Authenticated)
router.get("/:entityType/:entityId/user", protectOrGuest, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const userId = req.user.id || req.user._id?.toString();

    const userRating = await RatingService.getUserRating(userId, entityId, entityType);

    res.json({
      success: true,
      hasRated: !!userRating,
      rating: userRating
    });

  } catch (error) {
    console.error("Error fetching user rating:", error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// @route   DELETE /api/ratings/:ratingId
// @desc    Delete a rating (admin only)
// @access  Admin
router.delete("/:ratingId", async (req, res) => {
  try {
    // TODO: Add admin authentication middleware
    const { ratingId } = req.params;

    const result = await RatingService.deleteRating(ratingId);

    res.json(result);

  } catch (error) {
    console.error("Error deleting rating:", error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

module.exports = router;
