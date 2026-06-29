const express = require("express");
const router = express.Router();
const prisma = require("../config/prisma");

// Helper to map PostgreSQL Prisma accommodation to match frontend _id expectations
const mapAccommodation = (item) => {
  if (!item) return null;
  return {
    ...item,
    _id: String(item.id),
  };
};

// GET ALL
router.get("/", async (req, res) => {
  try {
    const data = await prisma.accommodation.findMany({
      where: {
        status: { equals: 'Active', mode: 'insensitive' },
        title: { not: "" },
        city: { not: "" }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(data.map(mapAccommodation));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET SINGLE
router.get("/:id", async (req, res) => {
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    const data = await prisma.accommodation.findUnique({
      where: { id: numericId }
    });
    if (!data)
      return res.status(404).json({ message: "Accommodation not found" });
    res.status(200).json(mapAccommodation(data));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;