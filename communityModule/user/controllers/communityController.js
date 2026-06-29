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
  console.log(`🚀 [START] getAllGuides called at ${new Date().toISOString()}`);
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    console.log(`📋 [PAGINATION] page=${page}, limit=${limit}, skip=${skip}`);

    console.log(`🔍 [DB QUERY] Counting Guide documents`);
    const countStart = Date.now();
    const total = await prisma.guide.count({});
    console.log(`✅ [DB RESULT] Count returned ${total} documents in ${Date.now() - countStart}ms`);
    
    console.log(`🔍 [DB QUERY] Fetching paginated Guide items - limit=${limit}, skip=${skip}`);
    const findStart = Date.now();
    const guides = await prisma.guide.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });
    console.log(`✅ [DB RESULT] findMany returned ${guides.length} documents in ${Date.now() - findStart}ms`);
    
    const mapped = guides.map(mapGuide);
    const totalPages = Math.ceil(total / limit);
    console.log(`📤 [RESPONSE] Sending 200 with ${mapped.length} items after ${Date.now() - start}ms`);
    res.json({ data: mapped, count: total, page, limit, totalPages });
  } catch (error) {
    console.error(`❌ [ERROR] getAllGuides failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
};

exports.getGuideById = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getGuideById called with id=${req.params.id} at ${new Date().toISOString()}`);
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
  } catch (error) {
    console.error(`❌ [ERROR] getGuideById failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
};

exports.createGuide = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] createGuide called at ${new Date().toISOString()}`);
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
  } catch (error) {
    console.error(`❌ [ERROR] createGuide failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: error.message });
  }
};

exports.updateGuide = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] updateGuide called with id=${req.params.id} at ${new Date().toISOString()}`);
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
  } catch (error) {
    console.error(`❌ [ERROR] updateGuide failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: error.message });
  }
};

exports.deleteGuide = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] deleteGuide called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    await prisma.guide.delete({
      where: { id: numericId }
    });
    res.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error(`❌ [ERROR] deleteGuide failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
};