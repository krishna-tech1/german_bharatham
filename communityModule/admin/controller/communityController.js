const prisma = require("../../../config/prisma");

const mapGuide = (g) => {
  if (!g) return null;
  return {
    ...g,
    _id: String(g.id)
  };
};

exports.getAllGuides = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getAllGuides (admin) called at ${new Date().toISOString()}`);
  try {
    const guides = await prisma.guide.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(guides.map(mapGuide));
  } catch (err) {
    console.error(`❌ [ERROR] getAllGuides failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};

exports.getGuideById = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getGuideById (admin) called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    const guide = await prisma.guide.findUnique({
      where: { id: numericId }
    });
    
    if (!guide) {
      return res.status(404).json({ message: "Not found" });
    }
    res.json(mapGuide(guide));
  } catch (err) {
    console.error(`❌ [ERROR] getGuideById failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};

exports.createGuide = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] createGuide (admin) called at ${new Date().toISOString()}`);
  try {
    const keyPoints = Array.isArray(req.body.keyPoints) ? req.body.keyPoints.map(k => String(k)) : [];
    const saved = await prisma.guide.create({
      data: {
        title: req.body.title,
        category: req.body.category || null,
        readTime: req.body.readTime ? parseInt(req.body.readTime, 10) : null,
        description: req.body.description || null,
        keyPoints,
        content: req.body.content || null,
        officialWebsites: req.body.officialWebsites || null,
        communityDiscussions: req.body.communityDiscussions || null,
        author: req.body.author || "German Bharatham Team",
        date: req.body.date || new Date().toDateString()
      }
    });
    res.status(201).json(mapGuide(saved));
  } catch (err) {
    console.error(`❌ [ERROR] createGuide failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: err.message });
  }
};

exports.updateGuide = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] updateGuide (admin) called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.id;

    if (req.body.keyPoints) {
      updateData.keyPoints = Array.isArray(req.body.keyPoints) ? req.body.keyPoints.map(k => String(k)) : [];
    }
    if (req.body.readTime) {
      updateData.readTime = parseInt(req.body.readTime, 10);
    }

    const updated = await prisma.guide.update({
      where: { id: numericId },
      data: updateData
    });
    res.json(mapGuide(updated));
  } catch (err) {
    console.error(`❌ [ERROR] updateGuide failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: err.message });
  }
};

exports.deleteGuide = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] deleteGuide (admin) called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    await prisma.guide.delete({
      where: { id: numericId }
    });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(`❌ [ERROR] deleteGuide failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};