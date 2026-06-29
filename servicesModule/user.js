const express = require("express");
const router = express.Router();
const prisma = require("../config/prisma");

// Helper to map PostgreSQL Prisma service to match frontend _id expectations
const mapService = (item) => {
  if (!item) return null;
  return {
    ...item,
    _id: String(item.id),
  };
};

// GET ALL ACTIVE SERVICES (No auth required for users)
router.get("/", async (req, res) => {
  try {
    const { city, serviceType, provider } = req.query;
    
    const where = {
      status: { in: ["Active", "active"] }
    };
    
    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }
    if (serviceType) {
      where.serviceType = { contains: serviceType, mode: 'insensitive' };
    }
    if (provider) {
      where.provider = { contains: provider, mode: 'insensitive' };
    }
    
    const data = await prisma.service.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    
    const mapped = data.map(mapService);
    res.json({ data: mapped, count: mapped.length });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET ONE SERVICE BY ID
router.get("/:id", async (req, res) => {
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: 'Invalid ID format' });

    const doc = await prisma.service.findUnique({
      where: { id: numericId }
    });
    if (!doc) return res.status(404).json({ message: 'Service not found' });
    res.json(mapService(doc));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
