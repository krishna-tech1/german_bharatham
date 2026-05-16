const express = require("express");
const router = express.Router();
const upload = require("../../middleware/upload");

const {
  createJob,
  getAllJobs,
  updateJob,
  deleteJob,
  uploadLogo
} = require("./jobAdminController");

// Upload Logo (separate endpoint)
router.post("/upload-logo", upload.single("logo"), uploadLogo);

// Create Job (with optional file upload)
router.post("/", upload.single("logo"), createJob);

// Get All Jobs
router.get("/", getAllJobs);

// Update Job (with optional file upload)
router.put("/:id", upload.single("logo"), updateJob);

// Delete Job
router.delete("/:id", deleteJob);

module.exports = router;