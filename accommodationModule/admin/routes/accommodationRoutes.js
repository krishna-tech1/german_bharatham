const express = require("express");
const router = express.Router();
const ctrl = require("../controller/accommodationController");
const { protect, adminOnly } = require("../../../middleware/auth");

// Anyone can read
router.get("/", ctrl.getAllAccommodations);
router.get("/:id", ctrl.getAccommodationById);

// Only authenticated admins can create/update/delete
router.post("/", protect, adminOnly, ctrl.createAccommodation);
router.put("/:id", protect, adminOnly, ctrl.updateAccommodation);
router.delete("/:id", protect, adminOnly, ctrl.deleteAccommodation);

module.exports = router;
