const express = require("express");
const router = express.Router();
const prisma = require("../config/prisma");

// GET ALL VISIBLE JOBS (No auth required for users)
router.get("/", async (req, res) => {
  try {
    const { city, jobType, company, companyName } = req.query;

    const where = {
      status: { equals: 'Active', mode: 'insensitive' }
    };

    if (city) {
      where.location = { contains: city, mode: 'insensitive' };
    }
    if (jobType) {
      where.jobType = { contains: jobType, mode: 'insensitive' };
    }
    if (company || companyName) {
      const q = company || companyName;
      where.OR = [
        { companyName: { contains: q, mode: 'insensitive' } }
      ];
    }

    const data = await prisma.jobListing.findMany({
      where: where,
      orderBy: { createdAt: 'desc' }
    });

    // Normalize field names so Flutter always gets `company` and `companyLogo`
    const normalized = data.map(j => ({
      ...j,
      _id: String(j.id), // Add _id for mobile/frontend compatibility
      company: j.companyName || '',
      city: j.location || '',
      requirements: Array.isArray(j.requirements)
        ? j.requirements
        : (j.requirements ? j.requirements.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : []),
      benefits: Array.isArray(j.benefits)
        ? j.benefits
        : (j.benefits ? j.benefits.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : []),
    }));

    res.json({ data: normalized, count: normalized.length });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET ONE JOB BY ID
router.get("/:id", async (req, res) => {
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: 'Invalid ID format' });

    const doc = await prisma.jobListing.findUnique({
      where: { id: numericId }
    });
    if (!doc) return res.status(404).json({ message: 'Job not found' });
    res.json({
      ...doc,
      _id: String(doc.id) // Add _id for mobile/frontend compatibility
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
