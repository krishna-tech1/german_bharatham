const express = require("express");
const router = express.Router();
const prisma = require("../config/prisma");

const mapItem = (item) => {
  if (!item) return null;
  return {
    ...item,
    _id: String(item.id),
    createdBy: String(item.createdById)
  };
};

// GET all listings submitted by the current user
router.get("/", async (req, res) => {
  try {
    const numericUserId = parseInt(req.user.id);
    if (isNaN(numericUserId)) return res.status(401).json({ message: "Invalid session" });

    const [accommodations, foods, jobs, services] = await Promise.all([
      prisma.accommodation.findMany({ where: { createdById: numericUserId } }),
      prisma.foodGrocery.findMany({ where: { createdById: numericUserId } }),
      prisma.jobListing.findMany({ where: { createdById: numericUserId } }),
      prisma.service.findMany({ where: { createdById: numericUserId } }),
    ]);

    res.json({
      Accommodation: accommodations.map(mapItem),
      Food: foods.map(mapItem),
      Jobs: jobs.map(mapItem),
      Services: services.map(mapItem),
    });
  } catch (error) {
    console.error("❌ GET user listings error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

// POST submit a new listing
router.post("/", async (req, res) => {
  try {
    const { category, data } = req.body;
    const numericUserId = parseInt(req.user.id);
    if (isNaN(numericUserId)) return res.status(401).json({ message: "Invalid session" });

    const allowed = ["Accommodation", "Food", "Jobs", "Services"];
    if (!category || !allowed.includes(category)) {
      return res.status(400).json({ message: "Invalid or missing category" });
    }

    const payload = {
      ...data,
      status: "Pending",
      createdById: numericUserId,
      creatorType: "user",
    };

    // Clean ratings fields
    delete payload.averageRating;
    delete payload.totalRatings;
    delete payload.ratingDistribution;
    delete payload.lastRatedAt;
    delete payload._id;
    delete payload.id;

    let doc = null;
    if (category === "Accommodation") {
      doc = await prisma.accommodation.create({ data: payload });
    } else if (category === "Food") {
      doc = await prisma.foodGrocery.create({
        data: {
          ...payload,
          category: "Food"
        }
      });
    } else if (category === "Jobs") {
      doc = await prisma.jobListing.create({ data: payload });
    } else if (category === "Services") {
      doc = await prisma.service.create({ data: payload });
    }

    res.status(201).json({ message: "Listing submitted successfully", data: mapItem(doc) });
  } catch (error) {
    console.error("❌ POST user listing error:", error.message);
    res.status(400).json({ message: error.message });
  }
});

// PUT update a pending listing
router.put("/:category/:id", async (req, res) => {
  try {
    const { category, id } = req.params;
    const { data } = req.body;
    const numericId = parseInt(id);
    const numericUserId = parseInt(req.user.id);

    if (isNaN(numericId) || isNaN(numericUserId)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const allowed = ["Accommodation", "Food", "Jobs", "Services"];
    if (!category || !allowed.includes(category)) {
      return res.status(400).json({ message: "Invalid category" });
    }

    let existing = null;
    if (category === "Accommodation") {
      existing = await prisma.accommodation.findUnique({ where: { id: numericId } });
    } else if (category === "Food") {
      existing = await prisma.foodGrocery.findUnique({ where: { id: numericId } });
    } else if (category === "Jobs") {
      existing = await prisma.jobListing.findUnique({ where: { id: numericId } });
    } else if (category === "Services") {
      existing = await prisma.service.findUnique({ where: { id: numericId } });
    }

    if (!existing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Check ownership
    if (existing.createdById !== numericUserId) {
      return res.status(403).json({ message: "Not authorized to edit this listing" });
    }

    // Check status
    const statusLower = String(existing.status || "").toLowerCase();
    if (statusLower !== "pending") {
      return res.status(400).json({ message: "Only pending listings can be edited" });
    }

    const payload = {
      ...data,
      status: "Pending",
      createdById: numericUserId,
      creatorType: "user",
    };

    delete payload.averageRating;
    delete payload.totalRatings;
    delete payload.ratingDistribution;
    delete payload.lastRatedAt;
    delete payload._id;
    delete payload.id;

    let updatedDoc = null;
    if (category === "Accommodation") {
      updatedDoc = await prisma.accommodation.update({ where: { id: numericId }, data: payload });
    } else if (category === "Food") {
      updatedDoc = await prisma.foodGrocery.update({ where: { id: numericId }, data: payload });
    } else if (category === "Jobs") {
      updatedDoc = await prisma.jobListing.update({ where: { id: numericId }, data: payload });
    } else if (category === "Services") {
      updatedDoc = await prisma.service.update({ where: { id: numericId }, data: payload });
    }

    res.json({ message: "Listing updated successfully", data: mapItem(updatedDoc) });
  } catch (error) {
    console.error("❌ PUT user listing error:", error.message);
    res.status(400).json({ message: error.message });
  }
});

// DELETE a listing (only allowed if pending or rejected)
router.delete("/:category/:id", async (req, res) => {
  try {
    const { category, id } = req.params;
    const numericId = parseInt(id);
    const numericUserId = parseInt(req.user.id);

    if (isNaN(numericId) || isNaN(numericUserId)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const allowed = ["Accommodation", "Food", "Jobs", "Services"];
    if (!category || !allowed.includes(category)) {
      return res.status(400).json({ message: "Invalid category" });
    }

    let existing = null;
    if (category === "Accommodation") {
      existing = await prisma.accommodation.findUnique({ where: { id: numericId } });
    } else if (category === "Food") {
      existing = await prisma.foodGrocery.findUnique({ where: { id: numericId } });
    } else if (category === "Jobs") {
      existing = await prisma.jobListing.findUnique({ where: { id: numericId } });
    } else if (category === "Services") {
      existing = await prisma.service.findUnique({ where: { id: numericId } });
    }

    if (!existing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Check ownership
    if (existing.createdById !== numericUserId) {
      return res.status(403).json({ message: "Not authorized to delete this listing" });
    }

    // Check status
    const statusLower = String(existing.status || "").toLowerCase();
    if (statusLower === "active") {
      return res.status(400).json({ message: "Approved/Active listings cannot be deleted by users" });
    }

    if (category === "Accommodation") {
      await prisma.accommodation.delete({ where: { id: numericId } });
    } else if (category === "Food") {
      await prisma.foodGrocery.delete({ where: { id: numericId } });
    } else if (category === "Jobs") {
      await prisma.jobListing.delete({ where: { id: numericId } });
    } else if (category === "Services") {
      await prisma.service.delete({ where: { id: numericId } });
    }

    res.json({ message: "Listing deleted successfully" });
  } catch (error) {
    console.error("❌ DELETE user listing error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
