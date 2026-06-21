const express = require("express");
const router = express.Router();
const Accommodation = require("../accommodationModule/admin/model/Accommodation");
const FoodGrocery = require("../foodGroceryModule/admin/model/FoodGrocery");
const Job = require("../jobsModule/admin/model/Job");
const Service = require("../servicesModule/admin/model/Service");

const MODELS = {
  Accommodation: Accommodation,
  Food: FoodGrocery,
  Jobs: Job,
  Services: Service,
};

// GET all listings submitted by the current user
router.get("/", async (req, res) => {
  try {
    const userId = req.user._id;

    const [accommodations, foods, jobs, services] = await Promise.all([
      Accommodation.find({ createdBy: userId }).lean(),
      FoodGrocery.find({ createdBy: userId }).lean(),
      Job.find({ createdBy: userId }).lean(),
      Service.find({ createdBy: userId }).lean(),
    ]);

    res.json({
      Accommodation: accommodations,
      Food: foods,
      Jobs: jobs,
      Services: services,
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
    if (!category || !MODELS[category]) {
      return res.status(400).json({ message: "Invalid or missing category" });
    }

    const Model = MODELS[category];

    // Force safety fields
    const payload = {
      ...data,
      status: "Pending",
      createdBy: req.user._id,
      creatorType: "user",
    };

    // Clean ratings fields
    delete payload.averageRating;
    delete payload.totalRatings;
    delete payload.ratingDistribution;
    delete payload.lastRatedAt;

    const doc = new Model(payload);
    await doc.save();

    res.status(201).json({ message: "Listing submitted successfully", data: doc });
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

    if (!category || !MODELS[category]) {
      return res.status(400).json({ message: "Invalid category" });
    }

    const Model = MODELS[category];
    const doc = await Model.findById(id);

    if (!doc) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Check ownership
    if (doc.createdBy?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to edit this listing" });
    }

    // Check status
    const statusLower = String(doc.status || "").toLowerCase();
    if (statusLower !== "pending") {
      return res.status(400).json({ message: "Only pending listings can be edited" });
    }

    // Update with allowed fields (no rating changes, keep status pending)
    const payload = {
      ...data,
      status: "Pending",
      createdBy: req.user._id,
      creatorType: "user",
    };

    delete payload.averageRating;
    delete payload.totalRatings;
    delete payload.ratingDistribution;
    delete payload.lastRatedAt;

    const updatedDoc = await Model.findByIdAndUpdate(id, payload, { new: true, runValidators: true });

    res.json({ message: "Listing updated successfully", data: updatedDoc });
  } catch (error) {
    console.error("❌ PUT user listing error:", error.message);
    res.status(400).json({ message: error.message });
  }
});

// DELETE a listing (only allowed if pending or rejected)
router.delete("/:category/:id", async (req, res) => {
  try {
    const { category, id } = req.params;

    if (!category || !MODELS[category]) {
      return res.status(400).json({ message: "Invalid category" });
    }

    const Model = MODELS[category];
    const doc = await Model.findById(id);

    if (!doc) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Check ownership
    if (doc.createdBy?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this listing" });
    }

    // Check status: must not be active/approved
    const statusLower = String(doc.status || "").toLowerCase();
    if (statusLower === "active") {
      return res.status(400).json({ message: "Approved/Active listings cannot be deleted by users" });
    }

    await Model.findByIdAndDelete(id);

    res.json({ message: "Listing deleted successfully" });
  } catch (error) {
    console.error("❌ DELETE user listing error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
