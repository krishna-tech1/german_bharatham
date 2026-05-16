const express = require("express");
const router = express.Router();
const ProblemReport = require("../models/ProblemReport");
const { protect, adminOnly } = require("../middleware/auth");

router.post("/", protect, async (req, res) => {
  try {
    const subject = String(req.body?.subject || "").trim();
    const description = String(req.body?.description || "").trim();

    if (!subject || !description) {
      return res.status(400).json({
        success: false,
        message: "Subject and description are required",
      });
    }

    const report = await ProblemReport.create({
      subject,
      description,
      user: {
        id: req.user._id,
        name: req.user.name || "User",
        email: req.user.email || "",
      },
    });

    return res.status(201).json({
      success: true,
      message: "Report submitted successfully",
      data: report,
    });
  } catch (error) {
    console.error("Problem report submit error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit report",
    });
  }
});

router.get("/admin", protect, adminOnly, async (_req, res) => {
  try {
    const reports = await ProblemReport.find({})
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (error) {
    console.error("Problem report fetch error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      data: [],
    });
  }
});

module.exports = router;