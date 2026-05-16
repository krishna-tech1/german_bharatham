const express = require("express");
const router = express.Router();
const ctrl = require("../controller/jobController");
const { protect, adminOnly } = require("../../../middleware/auth");

// Anyone can read
router.get("/", ctrl.getAllJobs);
router.get("/:id", ctrl.getJobById);

// Only authenticated admins can create/update/delete
router.post("/", protect, adminOnly, ctrl.createJob);
router.put("/:id", protect, adminOnly, ctrl.updateJob);
router.delete("/:id", protect, adminOnly, ctrl.deleteJob);

module.exports = router;
