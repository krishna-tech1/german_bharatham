const express = require("express");
const router = express.Router();
const FoodGrocery = require("./admin/model/FoodGrocery");
const Rating = require("./admin/model/Rating");
const { protect } = require("../middleware/auth");

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
    const User = require("../userModule/user/models/User");
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token failed" });
  }
};

// @route   GET /api/user/foodgrocery
// @desc    Get all active food & grocery listings for users
// @access  Public
router.get("/", async (req, res) => {
  try {
    const { search, subCategory, city } = req.query;
    
    // Build query - only show Active items to users
    let query = { status: { $regex: /^active$/i } };
    
    // Add search filter
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Add subCategory filter
    if (subCategory) {
      query.subCategory = subCategory;
    }
    
    // Add city filter
    if (city) {
      query.city = { $regex: city, $options: 'i' };
    }
    
    const listings = await FoodGrocery.find(query)
      .sort({ createdAt: -1 })
      .lean();
    
    res.json(listings);
  } catch (error) {
    console.error('Error fetching food grocery listings:', error);
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/user/foodgrocery/:id
// @desc    Get single food & grocery listing by ID
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const listing = await FoodGrocery.findById(req.params.id).lean();
    
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }
    
    // Only return Active listings to users
    if (!listing.status || listing.status.toLowerCase() !== 'active') {
      return res.status(404).json({ message: 'Listing not available' });
    }
    
    res.json(listing);
  } catch (error) {
    console.error('Error fetching food grocery details:', error);
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/user/foodgrocery/:id/rating
// @desc    Submit a rating for a restaurant
// @access  Private (requires authentication or guest token)
router.post("/:id/rating", protectOrGuest, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const foodGroceryId = req.params.id;
    const userId = req.user.id;
    const userName = req.user.name || req.user.email;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    // Check if listing exists and is active
    const listing = await FoodGrocery.findById(foodGroceryId);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }
    if (!listing.status || listing.status.toLowerCase() !== 'active') {
      return res.status(400).json({ message: 'Cannot rate inactive listing' });
    }

    // Create new rating (users can rate multiple times)
    const newRating = new Rating({
      foodGroceryId,
      userId,
      userName,
      rating: Number(rating),
      comment: comment || ""
    });

    await newRating.save();

    // Recalculate average rating
    const allRatings = await Rating.find({ foodGroceryId });
    const totalRatings = allRatings.length;
    const sumRatings = allRatings.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalRatings > 0 ? (sumRatings / totalRatings).toFixed(1) : 0;

    // Update the FoodGrocery document
    listing.averageRating = Number(averageRating);
    listing.totalRatings = totalRatings;
    await listing.save();

    res.status(201).json({ 
      message: 'Rating submitted successfully',
      rating: newRating,
      averageRating: listing.averageRating,
      totalRatings: listing.totalRatings
    });
  } catch (error) {
    console.error('Error submitting rating:', error);
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/user/foodgrocery/:id/ratings
// @desc    Get all ratings for a restaurant
// @access  Public
router.get("/:id/ratings", async (req, res) => {
  try {
    const foodGroceryId = req.params.id;
    
    const ratings = await Rating.find({ foodGroceryId })
      .sort({ createdAt: -1 })
      .lean();
    
    res.json(ratings);
  } catch (error) {
    console.error('Error fetching ratings:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
