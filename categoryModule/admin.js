const express = require('express');
const router  = express.Router();
const prisma  = require('../config/prisma');

const adminCheck = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
};

const mapCategory = (c) => {
  if (!c) return null;
  return {
    ...c,
    _id: String(c.id)
  };
};

const mapListing = (l) => {
  if (!l) return null;
  return {
    ...l,
    _id: String(l.id),
    categoryId: String(l.categoryId)
  };
};

// ── CATEGORIES ──────────────────────────────────────────────────────────────

// GET all custom categories
router.get('/', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /categories called at ${new Date().toISOString()}`);
  try {
    const cats = await prisma.category.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(cats.map(mapCategory));
  } catch (e) { 
    console.error(`❌ [ERROR] GET /categories failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message }); 
  }
});

// POST create a new category
router.post('/', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] POST /categories called at ${new Date().toISOString()}`);
  try {
    const { name, description, icon, status } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Category name is required' });

    const cleanName = name.trim();
    const BUILT_IN = ['Accommodation', 'Food', 'Services', 'Jobs', 'Community', 'Help Center'];
    
    if (BUILT_IN.some(c => c.toLowerCase() === cleanName.toLowerCase())) {
      return res.status(400).json({ message: `Category '${cleanName}' is a built-in category and cannot be duplicated` });
    }

    const existing = await prisma.category.findFirst({
      where: { name: { equals: cleanName, mode: 'insensitive' } }
    });
    
    if (existing) {
      return res.status(400).json({ message: `Category '${cleanName}' already exists` });
    }

    const cat = await prisma.category.create({
      data: {
        name: cleanName,
        description: description || '',
        icon: icon || '📋',
        status: status || 'active'
      }
    });
    res.status(201).json(mapCategory(cat));
  } catch (e) { 
    console.error(`❌ [ERROR] POST /categories failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message }); 
  }
});

// PUT update a category
router.put('/:id', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PUT /categories/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.id;

    const cat = await prisma.category.update({
      where: { id: numericId },
      data: updateData
    });
    res.json(mapCategory(cat));
  } catch (e) { 
    console.error(`❌ [ERROR] PUT /categories/:id failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message }); 
  }
});

// DELETE a category + all its listings
router.delete('/:id', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] DELETE /categories/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    await prisma.category.delete({
      where: { id: numericId }
    });
    res.json({ message: 'Category and its listings deleted' });
  } catch (e) { 
    console.error(`❌ [ERROR] DELETE /categories/:id failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message }); 
  }
});

// ── LISTINGS within a category ───────────────────────────────────────────────

// GET all listings for a category (supports pagination: ?page=1&limit=20)
router.get('/:id/listings', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /categories/:id/listings called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    const where = { categoryId: numericId };
    if (req.query.status) where.status = req.query.status;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const totalCount = await prisma.genericListing.count({ where });
    const listings = await prisma.genericListing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });

    const mapped = listings.map(mapListing);
    res.json({ data: mapped, count: mapped.length, totalCount: totalCount || 0, page, limit });
  } catch (e) { 
    console.error(`❌ [ERROR] GET /categories/:id/listings failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message }); 
  }
});

// POST create listing in a category
router.post('/:id/listings', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] POST /categories/:id/listings called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    const cat = await prisma.category.findUnique({
      where: { id: numericId }
    });
    if (!cat) return res.status(404).json({ message: 'Category not found' });

    const { title } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: 'Title is required' });

    const listing = await prisma.genericListing.create({
      data: {
        title: title.trim(),
        description: req.body.description || "",
        contactPhone: req.body.contactPhone || "",
        city: req.body.city || "",
        area: req.body.area || "",
        images: Array.isArray(req.body.images) ? req.body.images.map(img => String(img)) : [],
        status: req.body.status || "active",
        categoryId: numericId,
        categoryName: cat.name,
      }
    });

    res.status(201).json(mapListing(listing));
  } catch (e) { 
    console.error(`❌ [ERROR] POST /categories/:id/listings failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message }); 
  }
});

// PUT update a listing
router.put('/:id/listings/:lid', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PUT /categories/:id/listings/:lid called with id=${req.params.id}, lid=${req.params.lid} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    const numericLid = parseInt(req.params.lid);
    if (isNaN(numericId) || isNaN(numericLid)) return res.status(400).json({ message: "Invalid ID format" });

    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.id;
    delete updateData.categoryId;

    const listing = await prisma.genericListing.update({
      where: { id: numericLid },
      data: updateData
    });
    res.json(mapListing(listing));
  } catch (e) { 
    console.error(`❌ [ERROR] PUT /categories/:id/listings/:lid failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message }); 
  }
});

// PATCH status
router.patch('/:id/listings/:lid/status', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PATCH /categories/:id/listings/:lid/status called with id=${req.params.id}, lid=${req.params.lid} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    const numericLid = parseInt(req.params.lid);
    if (isNaN(numericId) || isNaN(numericLid)) return res.status(400).json({ message: "Invalid ID format" });

    let { status } = req.body;
    if (status === 'inactive') status = 'disabled';
    if (!['active', 'disabled', 'pending'].includes(status)) return res.status(400).json({ message: 'Invalid status' });

    const listing = await prisma.genericListing.update({
      where: { id: numericLid },
      data: { status }
    });
    res.json(mapListing(listing));
  } catch (e) { 
    console.error(`❌ [ERROR] PATCH /categories/:id/listings/:lid/status failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message }); 
  }
});

// DELETE a listing
router.delete('/:id/listings/:lid', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] DELETE /categories/:id/listings/:lid called with id=${req.params.id}, lid=${req.params.lid} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    const numericLid = parseInt(req.params.lid);
    if (isNaN(numericId) || isNaN(numericLid)) return res.status(400).json({ message: "Invalid ID format" });

    await prisma.genericListing.delete({
      where: { id: numericLid }
    });
    res.json({ message: 'Deleted' });
  } catch (e) { 
    console.error(`❌ [ERROR] DELETE /categories/:id/listings/:lid failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message }); 
  }
});

module.exports = router;
