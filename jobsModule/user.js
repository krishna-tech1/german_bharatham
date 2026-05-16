const express = require("express");
const router = express.Router();
// Use the same model as the admin so schema stays consistent
const Job = require("./models/jobModel");

// GET ALL VISIBLE JOBS (No auth required for users)
// Returns all jobs that are not explicitly Inactive
router.get("/", async (req, res) => {
  try {
    const { city, jobType, company, companyName } = req.query;

    // Only show jobs with active status (case-insensitive)
    const filter = { status: { $regex: /^active$/i } };

    if (city) filter.location = { $regex: city, $options: 'i' };
    if (jobType) filter.jobType = { $regex: jobType, $options: 'i' };
    if (company || companyName) {
      const q = company || companyName;
      filter['$or'] = [
        { company: { $regex: q, $options: 'i' } },
        { companyName: { $regex: q, $options: 'i' } },
      ];
    }

    const data = await Job.find(filter).sort({ createdAt: -1 }).lean();

    // Normalize field names so Flutter always gets `company` and `companyLogo`
    const normalized = data.map(j => ({
      ...j,
      company: j.company || j.companyName || '',
      city: j.city || j.location || '',
      requirements: Array.isArray(j.requirements)
        ? j.requirements
        : (j.requirements ? j.requirements.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : []),
      benefits: Array.isArray(j.benefits)
        ? j.benefits
        : (j.benefits ? j.benefits.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : []),
    }));

    res.json({ data: normalized, count: normalized.length });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET ONE JOB BY ID
router.get("/:id", async (req, res) => {
  try {
    const doc = await Job.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Job not found' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
