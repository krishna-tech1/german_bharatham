const express = require("express");
const router = express.Router();
const prisma = require("../../config/prisma");
const { adminLogin } = require("./adminController");
const { getCategoryStats, getDashboardStats } = require("./dashboardController");
const { protect, adminOnly } = require("../../middleware/auth");

const mapItem = (item) => {
  if (!item) return null;
  const mapped = {
    ...item,
    _id: String(item.id),
  };
  if (mapped.createdBy) {
    mapped.createdBy = {
      ...mapped.createdBy,
      _id: String(mapped.createdBy.id)
    };
  }
  return mapped;
};

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
      prisma.accommodation.findMany({ include: { createdBy: true }, take: 100 }),
      prisma.foodGrocery.findMany({ include: { createdBy: true }, take: 100 }),
      prisma.jobListing.findMany({ include: { createdBy: true }, take: 100 }),
      prisma.service.findMany({ include: { createdBy: true }, take: 100 }),
    ]);
    res.json({
      Accommodation: accommodations.map(mapItem),
      Food: foods.map(mapItem),
      Jobs: jobs.map(mapItem),
      Services: services.map(mapItem),
    });
  } catch (error) {
    console.error("❌ all-listings error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Pending listings (for Content Moderation page)
router.get("/pending-listings", protect, adminOnly, async (req, res) => {
  try {
    const pendingFilter = { status: { equals: 'pending', mode: 'insensitive' } };
    const [accommodations, foods, jobs, services] = await Promise.all([
      prisma.accommodation.findMany({ where: pendingFilter, include: { createdBy: true }, take: 50 }),
      prisma.foodGrocery.findMany({ where: pendingFilter, include: { createdBy: true }, take: 50 }),
      prisma.jobListing.findMany({ where: pendingFilter, include: { createdBy: true }, take: 50 }),
      prisma.service.findMany({ where: pendingFilter, include: { createdBy: true }, take: 50 }),
    ]);
    res.json({
      Accommodation: accommodations.map(mapItem),
      Food: foods.map(mapItem),
      Jobs: jobs.map(mapItem),
      Services: services.map(mapItem),
    });
  } catch (error) {
    console.error("❌ pending-listings error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;