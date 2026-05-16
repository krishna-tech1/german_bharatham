const express = require("express");
const router = express.Router();
const Service = require("./admin/model/Service");

// GET ALL ACTIVE SERVICES (No auth required for users)
router.get("/", async (req, res) => {
  try {
    const { city, serviceType, provider } = req.query;
    // Support both legacy and newer status values.
    // Admin UI can save as 'active' while older docs may store 'Active'.
    const filter = { status: { $in: ["Active", "active"] } };
    
    if (city) filter.city = { $regex: city, $options: 'i' };
    if (serviceType) filter.serviceType = { $regex: serviceType, $options: 'i' };
    if (provider) filter.provider = { $regex: provider, $options: 'i' };
    
    const data = await Service.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ data, count: data.length });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET ONE SERVICE BY ID
router.get("/:id", async (req, res) => {
  try {
    const doc = await Service.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Service not found' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
