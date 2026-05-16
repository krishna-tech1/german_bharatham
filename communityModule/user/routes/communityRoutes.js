const express = require("express");
const router = express.Router();
const controller = require("../controllers/communityController");
const { protect, adminOnly } = require("../../../middleware/auth");

// Public read access
router.get("/", controller.getAllGuides);
router.get("/:id", controller.getGuideById);

// Admin-only write operations
router.post("/", protect, adminOnly, controller.createGuide);
router.put("/:id", protect, adminOnly, controller.updateGuide);
router.delete("/:id", protect, adminOnly, controller.deleteGuide);

module.exports = router;