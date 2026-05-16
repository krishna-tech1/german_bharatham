const express = require("express");
const router = express.Router();
const { adminLogin } = require("./adminController");
const { getCategoryStats, getDashboardStats } = require("./dashboardController");
const { protect, adminOnly } = require("../../middleware/auth");
const Accommodation = require("../../accommodationModule/admin/model/Accommodation");
const FoodGrocery = require("../../foodGroceryModule/admin/model/FoodGrocery");
const Job = require("../../jobsModule/admin/model/Job");
const Service = require("../../servicesModule/admin/model/Service");

// Login
router.post("/login", (req, res, next) => {
  console.log("🔵 /api/admin/login route hit!");
  console.log("Body:", req.body);
  next();
}, adminLogin);

// Dashboard
router.get("/dashboard", protect, adminOnly, getDashboardStats);
router.get("/category-stats", protect, adminOnly, getCategoryStats);

// All listings (for Listings page)
router.get("/all-listings", protect, adminOnly, async (req, res) => {
  try {
    const [accommodations, foods, jobs, services] = await Promise.all([
      Accommodation.find().select("title location city area status createdAt").limit(100).lean(),
      FoodGrocery.find().select("title location city area status createdAt").limit(100).lean(),
      Job.find().select("title location city area status createdAt").limit(100).lean(),
      Service.find().select("serviceName title location city area status createdAt").limit(100).lean(),
    ]);
    res.json({
      Accommodation: accommodations,
      Food: foods,
      Jobs: jobs,
      Services: services,
    });
  } catch (error) {
    console.error("❌ all-listings error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Pending listings (for Content Moderation page)
router.get("/pending-listings", protect, adminOnly, async (req, res) => {
  try {
    const [accommodations, foods, jobs, services] = await Promise.all([
      Accommodation.find({ status: { $regex: /^pending$/i } }).select("title location city area status createdAt contactPhone images media amenities description").limit(50).lean(),
      FoodGrocery.find({ status: { $regex: /^pending$/i } }).select("title location city area status createdAt phone images media amenities description").limit(50).lean(),
      Job.find({ status: { $regex: /^pending$/i } }).select("title location city area status createdAt companyLogo email description").limit(50).lean(),
      Service.find({ status: { $regex: /^pending$/i } }).select("serviceName title location city area status createdAt phone images media amenities description").limit(50).lean(),
    ]);
    res.json({
      Accommodation: accommodations,
      Food: foods,
      Jobs: jobs,
      Services: services,
    });
  } catch (error) {
    console.error("❌ pending-listings error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;