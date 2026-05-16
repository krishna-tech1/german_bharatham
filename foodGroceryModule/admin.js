const express = require('express');
const router = express.Router();
const Food = require('./Food');
const { notifyListingActivated } = require('../userModule/user/services/notificationService');

const adminCheck = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
};

// GET ALL (supports pagination: ?page=1&limit=20)
router.get('/', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /food/admin/ called at ${new Date().toISOString()}`);
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 1);
    const skip = (page - 1) * limit;

    console.log(`📋 [PAGINATION] page=${page}, limit=${limit}, skip=${skip}`);
    console.log(`🔍 [DB QUERY] Counting Food documents with filter:`, JSON.stringify(filter));
    
    const countStart = Date.now();
    const totalCount = await Food.countDocuments(filter);
    console.log(`✅ [DB RESULT] Count returned ${totalCount} documents in ${Date.now() - countStart}ms`);
    
    console.log(`🔍 [DB QUERY] Fetching paginated Food items - limit=${limit}, skip=${skip}`);
    const findStart = Date.now();
    const data = await Food.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    console.log(`✅ [DB RESULT] find() returned ${(data || []).length} documents in ${Date.now() - findStart}ms`);

    console.log(`📤 [RESPONSE] Sending 200 with ${(data || []).length} items after ${Date.now() - start}ms`);
    res.json({ data, count: (data || []).length, totalCount: totalCount || 0, page, limit });
  } catch (e) {
    console.error(`❌ [ERROR] GET /food/admin/ failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// GET ONE
router.get('/:id', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /food/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Fetching Food by ID: ${req.params.id}`);
    const queryStart = Date.now();
    const doc = await Food.findById(req.params.id);
    console.log(`✅ [DB RESULT] findById completed in ${Date.now() - queryStart}ms - ${doc ? 'found' : 'not found'}`);
    
    if (!doc) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }
    console.log(`📤 [RESPONSE] Sending 200 after ${Date.now() - start}ms`);
    res.json(doc);
  } catch (e) {
    console.error(`❌ [ERROR] GET /food/admin/:id failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// CREATE
router.post('/', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] POST /food/admin/ called at ${new Date().toISOString()}`);
  try {
    const { name, city, contactPhone } = req.body;
    if (!name || !city || !contactPhone) {
      return res.status(400).json({ message: 'Name, City and Contact Phone are required' });
    }

    console.log(`📝 [VALIDATION] Creating Food with name="${name}", city="${city}"`);

    // New listings must be reviewed before going live.
    req.body.status = 'pending';

    console.log(`🔍 [DB QUERY] Creating and saving new Food`);
    const saveStart = Date.now();
    const doc = new Food(req.body);
    await doc.save();
    console.log(`✅ [DB RESULT] Food saved with ID ${doc._id} in ${Date.now() - saveStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(doc);
  } catch (e) {
    console.error(`❌ [ERROR] POST /food/admin/ failed: ${e.message} after ${Date.now() - start}ms`);
    if (e.name === 'ValidationError') return res.status(400).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
});

// UPDATE (full)
router.put('/:id', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PUT /food/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Updating Food with ID: ${req.params.id}`);
    const updateStart = Date.now();
    const doc = await Food.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    console.log(`✅ [DB RESULT] Update completed in ${Date.now() - updateStart}ms`);
    
    if (!doc) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(doc);
  } catch (e) {
    console.error(`❌ [ERROR] PUT /food/admin/:id failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// PATCH status
router.patch('/:id/status', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PATCH /food/admin/:id/status called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const { status } = req.body;
    const normalised = status === 'inactive' ? 'disabled' : status;
    console.log(`📝 [VALIDATION] Status change requested: ${status} -> ${normalised}`);
    
    if (!['active', 'disabled', 'pending'].includes(normalised)) return res.status(400).json({ message: 'Invalid status' });

    console.log(`🔍 [DB QUERY] Fetching Food before update: ${req.params.id}`);
    const fetchStart = Date.now();
    const before = await Food.findById(req.params.id).lean();
    console.log(`✅ [DB RESULT] Before-state fetched in ${Date.now() - fetchStart}ms`);
    
    if (!before) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }

    console.log(`🔍 [DB QUERY] Updating Food status: ${req.params.id} -> ${normalised}`);
    const updateStart = Date.now();
    const doc = await Food.findByIdAndUpdate(req.params.id, { status: normalised }, { new: true });
    console.log(`✅ [DB RESULT] Status update completed in ${Date.now() - updateStart}ms`);
    
    if (!doc) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }

    const wasActive = String(before.status || '').toLowerCase() === 'active';
    const isActive = normalised === 'active';
    if (!wasActive && isActive) {
      console.log(`🔔 [NOTIFICATION] Notifying activation for listing: ${doc._id}`);
      notifyListingActivated({
        module: 'foodgrocery',
        entityId: doc._id,
        listingTitle: doc.name || doc.restaurantName,
      }).catch(() => {});
    }

    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(doc);
  } catch (e) {
    console.error(`❌ [ERROR] PATCH /food/admin/:id/status failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// DELETE
router.delete('/:id', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] DELETE /food/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Deleting Food with ID: ${req.params.id}`);
    const deleteStart = Date.now();
    const doc = await Food.findByIdAndDelete(req.params.id);
    console.log(`✅ [DB RESULT] Delete completed in ${Date.now() - deleteStart}ms`);
    
    if (!doc) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error(`❌ [ERROR] DELETE /food/admin/:id failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;