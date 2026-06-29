const express = require("express");
const router = express.Router();
const prisma = require("../config/prisma");
const { protect, adminOnly } = require("../middleware/auth");

router.post("/", protect, async (req, res) => {
  try {
    const subject = String(req.body?.subject || "").trim();
    const description = String(req.body?.description || "").trim();
    const numericUserId = parseInt(req.user.id);

    if (isNaN(numericUserId)) {
      return res.status(401).json({ success: false, message: "Invalid session" });
    }

    if (!subject || !description) {
      return res.status(400).json({
        success: false,
        message: "Subject and description are required",
      });
    }

    const report = await prisma.problemReport.create({
      data: {
        subject,
        description,
        userId: numericUserId,
        userName: req.user.name || "User",
        userEmail: req.user.email || "",
      },
    });

    // Match old payload expectations
    const mappedReport = {
      ...report,
      _id: String(report.id),
      user: {
        id: String(numericUserId),
        name: report.userName,
        email: report.userEmail
      }
    };

    return res.status(201).json({
      success: true,
      message: "Report submitted successfully",
      data: mappedReport,
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
    const reports = await prisma.problemReport.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const mapped = reports.map(r => ({
      ...r,
      _id: String(r.id),
      user: {
        id: String(r.userId),
        name: r.userName,
        email: r.userEmail
      }
    }));

    return res.status(200).json({
      success: true,
      count: mapped.length,
      data: mapped,
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