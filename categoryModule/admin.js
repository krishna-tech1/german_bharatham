const express = require('express');
const router  = express.Router();
const Category       = require('./Category');
const GenericListing = require('./GenericListing');

const adminCheck = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
};

// ── CATEGORIES ──────────────────────────────────────────────────────────────

// GET all custom categories
router.get('/', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /categories called at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] finding all categories`);
    const queryStart = Date.now();
    const cats = await Category.find().sort({ createdAt: -1 });
    console.log(`✅ [DB RESULT] found ${cats.length} categories in ${Date.now() - queryStart}ms`);
    console.log(`📤 [RESPONSE] sending 200 response after ${Date.now() - start}ms`);
    res.json(cats);
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
      console.warn(`⚠️ [RESERVED] category name is built-in: ${cleanName}`);
      return res.status(400).json({ message: `Category '${cleanName}' is a built-in category and cannot be duplicated` });
    }

    console.log(`🔍 [DB QUERY] checking for existing category: ${cleanName}`);
    const existing = await Category.findOne({ 
      name: { $regex: new RegExp(`^${cleanName}$`, "i") } 
    });
    
    if (existing) {
      console.warn(`⚠️ [DUPLICATE] category already exists: ${cleanName}`);
      return res.status(400).json({ message: `Category '${cleanName}' already exists` });
    }

    console.log(`🔍 [DB QUERY] creating new category: ${cleanName}`);
    const createStart = Date.now();
    const cat = await Category.create({ name: cleanName, description: description || '', icon: icon || '📋', status: status || 'active' });
    console.log(`✅ [DB RESULT] category created in ${Date.now() - createStart}ms`);
    console.log(`📤 [RESPONSE] sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(cat);
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
    console.log(`🔍 [DB QUERY] updating category with id: ${req.params.id}`);
    const updateStart = Date.now();
    const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    console.log(`✅ [DB RESULT] update completed in ${Date.now() - updateStart}ms`);
    if (!cat) return res.status(404).json({ message: 'Category not found' });
    console.log(`📤 [RESPONSE] sending 200 response after ${Date.now() - start}ms`);
    res.json(cat);
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
    console.log(`🔍 [DB QUERY] deleting category with id: ${req.params.id}`);
    const deleteStart = Date.now();
    const cat = await Category.findByIdAndDelete(req.params.id);
    console.log(`✅ [DB RESULT] category deleted in ${Date.now() - deleteStart}ms`);
    if (!cat) return res.status(404).json({ message: 'Category not found' });
    console.log(`🔍 [DB QUERY] deleting all listings for category: ${req.params.id}`);
    const deleteListingsStart = Date.now();
    await GenericListing.deleteMany({ categoryId: req.params.id });
    console.log(`✅ [DB RESULT] listings deleted in ${Date.now() - deleteListingsStart}ms`);
    console.log(`📤 [RESPONSE] sending 200 response after ${Date.now() - start}ms`);
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
    const filter = { categoryId: req.params.id };
    if (req.query.status) filter.status = req.query.status;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 1);
    const skip = (page - 1) * limit;

    console.log(`🔍 [DB QUERY] counting and finding listings with filter and pagination (page=${page}, limit=${limit})`);
    const queryStart = Date.now();
    const totalCount = await GenericListing.countDocuments(filter);
    const listings = await GenericListing.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    console.log(`✅ [DB RESULT] fetched ${listings.length} of ${totalCount} listings in ${Date.now() - queryStart}ms`);

    console.log(`📤 [RESPONSE] sending 200 response with ${listings.length} listings after ${Date.now() - start}ms`);
    res.json({ data: listings, count: (listings || []).length, totalCount: totalCount || 0, page, limit });
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
    console.log(`🔍 [DB QUERY] finding category with id: ${req.params.id}`);
    const catStart = Date.now();
    const cat = await Category.findById(req.params.id);
    console.log(`✅ [DB RESULT] category found in ${Date.now() - catStart}ms`);
    if (!cat) return res.status(404).json({ message: 'Category not found' });
    const { title } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: 'Title is required' });
    console.log(`🔍 [DB QUERY] creating new listing in category: ${cat.name}`);
    const createStart = Date.now();
    const listing = await GenericListing.create({
      ...req.body,
      title: title.trim(),
      categoryId:   req.params.id,
      categoryName: cat.name,
    });
    console.log(`✅ [DB RESULT] listing created in ${Date.now() - createStart}ms`);
    console.log(`📤 [RESPONSE] sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(listing);
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
    console.log(`🔍 [DB QUERY] updating listing with categoryId=${req.params.id}, listingId=${req.params.lid}`);
    const updateStart = Date.now();
    const listing = await GenericListing.findOneAndUpdate(
      { _id: req.params.lid, categoryId: req.params.id },
      req.body,
      { new: true }
    );
    console.log(`✅ [DB RESULT] update completed in ${Date.now() - updateStart}ms`);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    console.log(`📤 [RESPONSE] sending 200 response after ${Date.now() - start}ms`);
    res.json(listing);
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
    let { status } = req.body;
    if (status === 'inactive') status = 'disabled';
    if (!['active', 'disabled', 'pending'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
    console.log(`🔍 [DB QUERY] updating listing status to: ${status}`);
    const updateStart = Date.now();
    const listing = await GenericListing.findOneAndUpdate(
      { _id: req.params.lid, categoryId: req.params.id },
      { status },
      { new: true }
    );
    console.log(`✅ [DB RESULT] status update completed in ${Date.now() - updateStart}ms`);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    console.log(`📤 [RESPONSE] sending 200 response after ${Date.now() - start}ms`);
    res.json(listing);
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
    console.log(`🔍 [DB QUERY] deleting listing with categoryId=${req.params.id}, listingId=${req.params.lid}`);
    const deleteStart = Date.now();
    const listing = await GenericListing.findOneAndDelete({ _id: req.params.lid, categoryId: req.params.id });
    console.log(`✅ [DB RESULT] delete completed in ${Date.now() - deleteStart}ms`);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    console.log(`📤 [RESPONSE] sending 200 response after ${Date.now() - start}ms`);
    res.json({ message: 'Deleted' });
  } catch (e) { 
    console.error(`❌ [ERROR] DELETE /categories/:id/listings/:lid failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message }); 
  }
});

module.exports = router;
