const express = require("express");
const router = express.Router();
const ctrl = require("../controller/communityController");
const { protect, adminOnly } = require("../../../middleware/auth");

// anyone can read
router.get("/", ctrl.getAllGuides);
router.get("/:id", ctrl.getGuideById);

// only authenticated admins can create/update/delete
router.post("/", protect, adminOnly, ctrl.createGuide);
router.put("/:id", protect, adminOnly, ctrl.updateGuide);
router.delete("/:id", protect, adminOnly, ctrl.deleteGuide);

module.exports = router;