const express = require("express");
const router = express.Router();
const Accommodation = require("./accomodation");

// GET ALL
router.get("/", async (req, res) => {
  try {
    const data = await Accommodation.find({
      status: { $regex: /^active$/i },
      title: { $exists: true, $nin: [null, ""] },
      city: { $exists: true, $nin: [null, ""] }
    }).sort({ createdAt: -1 });
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET SINGLE
router.get("/:id", async (req, res) => {
  try {
    const data = await Accommodation.findById(req.params.id);
    if (!data)
      return res.status(404).json({ message: "Accommodation not found" });
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;