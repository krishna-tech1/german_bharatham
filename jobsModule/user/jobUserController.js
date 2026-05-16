const Job = require("../models/jobModel");

// GET ALL JOBS (User)
exports.getJobs = async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET SINGLE JOB BY ID
exports.getJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }
    
    res.json(job);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// SEARCH JOBS (title or location)
exports.searchJobs = async (req, res) => {
  try {
    const { keyword } = req.query;

    const jobs = await Job.find({
      $or: [
        { title: { $regex: keyword, $options: "i" } },
        { location: { $regex: keyword, $options: "i" } }
      ]
    });

    res.json(jobs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};