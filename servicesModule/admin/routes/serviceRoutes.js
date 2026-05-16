const express = require("express");
const router = express.Router();
const ctrl = require("../controller/serviceController");
const { protect, adminOnly } = require("../../../middleware/auth");

// Anyone can read
router.get("/", ctrl.getAllServices);
router.get("/:id", ctrl.getServiceById);

// Only authenticated admins can create/update/delete
router.post("/", protect, adminOnly, ctrl.createService);
router.put("/:id", protect, adminOnly, ctrl.updateService);
router.delete("/:id", protect, adminOnly, ctrl.deleteService);

module.exports = router;
