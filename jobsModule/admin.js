const express = require('express');
const router = express.Router();
const Job = require('./models/jobModel');
const { notifyListingActivated } = require('../userModule/user/services/notificationService');

const adminCheck = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
};

const normalizeStatus = (value, fallback = 'Pending') => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'active') return 'Active';
  if (raw === 'pending') return 'Pending';
  if (raw === 'inactive' || raw === 'disabled') return 'Inactive';
  return fallback;
};

// GET ALL (supports pagination: ?page=1&limit=20)
router.get('/', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /jobs/admin/ called at ${new Date().toISOString()}`);
  try {
    const { status } = req.query;
    const filter = status ? { status: normalizeStatus(status, String(status)) } : {};
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 1);
    const skip = (page - 1) * limit;

    console.log(`📋 [PAGINATION] page=${page}, limit=${limit}, skip=${skip}`);
    console.log(`🔍 [DB QUERY] Counting Job documents with filter:`, JSON.stringify(filter));
    
    const countStart = Date.now();
    const totalCount = await Job.countDocuments(filter);
    console.log(`✅ [DB RESULT] Count returned ${totalCount} documents in ${Date.now() - countStart}ms`);
    
    console.log(`🔍 [DB QUERY] Fetching paginated Job items - limit=${limit}, skip=${skip}`);
    const findStart = Date.now();
    const data = await Job.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    console.log(`✅ [DB RESULT] find() returned ${(data || []).length} documents in ${Date.now() - findStart}ms`);

    console.log(`📤 [RESPONSE] Sending 200 with ${(data || []).length} items after ${Date.now() - start}ms`);
    res.json({ data, count: (data || []).length, totalCount: totalCount || 0, page, limit });
  } catch (e) {
    console.error(`❌ [ERROR] GET /jobs/admin/ failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// GET ONE
router.get('/:id', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /jobs/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Fetching Job by ID: ${req.params.id}`);
    const queryStart = Date.now();
    const doc = await Job.findById(req.params.id);
    console.log(`✅ [DB RESULT] findById completed in ${Date.now() - queryStart}ms - ${doc ? 'found' : 'not found'}`);
    
    if (!doc) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }
    console.log(`📤 [RESPONSE] Sending 200 after ${Date.now() - start}ms`);
    res.json(doc);
  } catch (e) {
    console.error(`❌ [ERROR] GET /jobs/admin/:id failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// CREATE
router.post('/', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] POST /jobs/admin/ called at ${new Date().toISOString()}`);
  try {
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ message: 'Job Title is required' });

    console.log(`📝 [VALIDATION] Creating Job with title="${title}"`);

    // New listings must be reviewed before going live.
    req.body.status = 'Pending';

    console.log(`🔍 [DB QUERY] Creating and saving new Job`);
    const saveStart = Date.now();
    const doc = new Job(req.body);
    await doc.save();
    console.log(`✅ [DB RESULT] Job saved with ID ${doc._id} in ${Date.now() - saveStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(doc);
  } catch (e) {
    console.error(`❌ [ERROR] POST /jobs/admin/ failed: ${e.message} after ${Date.now() - start}ms`);
    if (e.name === 'ValidationError') return res.status(400).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
});

// UPDATE (full)
router.put('/:id', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PUT /jobs/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    if (req.body && req.body.status != null) {
      req.body.status = normalizeStatus(req.body.status, req.body.status);
    }
    console.log(`🔍 [DB QUERY] Updating Job with ID: ${req.params.id}`);
    const updateStart = Date.now();
    const doc = await Job.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    console.log(`✅ [DB RESULT] Update completed in ${Date.now() - updateStart}ms`);
    
    if (!doc) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(doc);
  } catch (e) {
    console.error(`❌ [ERROR] PUT /jobs/admin/:id failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// PATCH status
router.patch('/:id/status', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PATCH /jobs/admin/:id/status called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const { status } = req.body;
    const normalised = normalizeStatus(status, '');
    console.log(`📝 [VALIDATION] Status change requested: ${status} -> ${normalised}`);
    
    if (!['Active', 'Pending', 'Inactive'].includes(normalised)) return res.status(400).json({ message: 'Invalid status' });

    console.log(`🔍 [DB QUERY] Fetching Job before update: ${req.params.id}`);
    const fetchStart = Date.now();
    const before = await Job.findById(req.params.id).lean();
    console.log(`✅ [DB RESULT] Before-state fetched in ${Date.now() - fetchStart}ms`);
    
    if (!before) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }

    console.log(`🔍 [DB QUERY] Updating Job status: ${req.params.id} -> ${normalised}`);
    const updateStart = Date.now();
    const doc = await Job.findByIdAndUpdate(req.params.id, { status: normalised }, { new: true });
    console.log(`✅ [DB RESULT] Status update completed in ${Date.now() - updateStart}ms`);
    
    if (!doc) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }

    const wasActive = String(before.status || '').toLowerCase() === 'active';
    const isActive = normalised === 'Active';
    if (!wasActive && isActive) {
      console.log(`🔔 [NOTIFICATION] Notifying activation for listing: ${doc._id}`);
      notifyListingActivated({
        module: 'jobs',
        entityId: doc._id,
        listingTitle: doc.title,
      }).catch(() => {});
    }

    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(doc);
  } catch (e) {
    console.error(`❌ [ERROR] PATCH /jobs/admin/:id/status failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// DELETE
router.delete('/:id', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] DELETE /jobs/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Deleting Job with ID: ${req.params.id}`);
    const deleteStart = Date.now();
    const doc = await Job.findByIdAndDelete(req.params.id);
    console.log(`✅ [DB RESULT] Delete completed in ${Date.now() - deleteStart}ms`);
    
    if (!doc) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error(`❌ [ERROR] DELETE /jobs/admin/:id failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
