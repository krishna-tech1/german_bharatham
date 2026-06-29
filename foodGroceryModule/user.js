const express = require("express");
const router = express.Router();
const prisma = require("../config/prisma");
const { protect } = require("../middleware/auth");

// Helper to map PostgreSQL Prisma FoodGrocery to match frontend _id expectations
const mapFoodGrocery = (item) => {
  if (!item) return null;
  return {
    ...item,
    _id: String(item.id),
  };
};

// Custom middleware to handle both authenticated and guest users
const protectOrGuest = async (req, res, next) => {
  try {
    let token;

    // Check Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    // Check if it's a guest token
    if (token.startsWith('guest_token_')) {
      // Extract guest info from token or create default
      const guestId = token.replace('guest_token_', '');
      req.user = {
        id: `guest_${guestId}`,
        name: 'Guest User',
        isGuest: true
      };
      return next();
    }

    // For regular tokens, use the normal protect middleware
    const jwt = require("jsonwebtoken");
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const numericId = parseInt(decoded.id);

    if (isNaN(numericId)) {
      return res.status(401).json({ message: "Invalid user token ID format" });
    }

    const user = await prisma.user.findUnique({
      where: { id: numericId }
    });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = {
      ...user,
      _id: String(user.id)
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token failed" });
  }
};

// @route   GET /api/user/foodgrocery
// @desc    Get all active food & grocery listings for users
router.get("/", async (req, res) => {
  try {
    const { search, subCategory, city } = req.query;
    
    // Build query - only show Active items to users
    const where = {
      status: { equals: 'Active', mode: 'insensitive' }
    };
    
    // Add subCategory filter
    if (subCategory) {
      where.subCategory = subCategory;
    }
    
    // Add city filter
    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }

    // If search is present, perform OR logic
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    const listings = await prisma.foodGrocery.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(listings.map(mapFoodGrocery));
  } catch (error) {
    console.error('Error fetching food grocery listings:', error);
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/user/foodgrocery/:id
// @desc    Get single food & grocery listing by ID
router.get("/:id", async (req, res) => {
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    const listing = await prisma.foodGrocery.findUnique({
      where: { id: numericId }
    });
    
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }
    
    // Only return Active listings to users
    if (!listing.status || listing.status.toLowerCase() !== 'active') {
      return res.status(404).json({ message: 'Listing not available' });
    }
    
    res.json(mapFoodGrocery(listing));
  } catch (error) {
    console.error('Error fetching food grocery details:', error);
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/user/foodgrocery/:id/rating
// @desc    Submit a rating for a restaurant
router.post("/:id/rating", protectOrGuest, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const foodGroceryId = req.params.id;
    const userId = req.user.id;
    const userName = req.user.name || req.user.email;

    const numericFoodId = parseInt(foodGroceryId);
    if (isNaN(numericFoodId)) return res.status(400).json({ message: "Invalid listing ID format" });

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    // Check if listing exists and is active
    const listing = await prisma.foodGrocery.findUnique({
      where: { id: numericFoodId }
    });

    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }
    if (!listing.status || listing.status.toLowerCase() !== 'active') {
      return res.status(400).json({ message: 'Cannot rate inactive listing' });
    }

    // Create new rating (users can rate multiple times)
    const newRating = await prisma.universalRating.create({
      data: {
        entityId: numericFoodId,
        entityType: "foodgrocery",
        userId: String(userId),
        userName,
        rating: Number(rating),
        review: comment || "",
        status: "active"
      }
    });

    // Recalculate average rating
    const allRatings = await prisma.universalRating.findMany({
      where: { entityId: numericFoodId, entityType: "foodgrocery" }
    });
    const totalRatings = allRatings.length;
    const sumRatings = allRatings.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalRatings > 0 ? (sumRatings / totalRatings).toFixed(1) : 0;

    // Update the FoodGrocery document
    const updatedListing = await prisma.foodGrocery.update({
      where: { id: numericFoodId },
      data: {
        averageRating: Number(averageRating),
        totalRatings: totalRatings
      }
    });

    res.status(201).json({ 
      message: 'Rating submitted successfully',
      rating: {
        ...newRating,
        _id: String(newRating.id),
        foodGroceryId: String(newRating.entityId),
        comment: newRating.review
      },
      averageRating: updatedListing.averageRating,
      totalRatings: updatedListing.totalRatings
    });
  } catch (error) {
    console.error('Error submitting rating:', error);
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/user/foodgrocery/:id/ratings
// @desc    Get all ratings for a restaurant
router.get("/:id/ratings", async (req, res) => {
  try {
    const foodGroceryId = req.params.id;
    const numericFoodId = parseInt(foodGroceryId);
    if (isNaN(numericFoodId)) return res.status(400).json({ message: "Invalid ID format" });
    
    const ratings = await prisma.universalRating.findMany({
      where: { entityId: numericFoodId, entityType: "foodgrocery" },
      orderBy: { createdAt: 'desc' }
    });
    
    // Map response keys to match old Rating mongoose schema expectation
    const mappedRatings = ratings.map(r => ({
      ...r,
      _id: String(r.id),
      foodGroceryId: String(r.entityId),
      comment: r.review
    }));

    res.json(mappedRatings);
  } catch (error) {
    console.error('Error fetching ratings:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
