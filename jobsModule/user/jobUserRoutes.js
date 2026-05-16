const express = require("express");
const router = express.Router();

const {
  getJobs,
  searchJobs,
  getJobById
} = require("./jobUserController");

// Get all jobs
router.get("/", getJobs);

// Search jobs
router.get("/search", searchJobs);

// Get single job by ID
router.get("/:id", getJobById);

module.exports = router;