const express = require('express');
const router = express.Router();
const Service = require('./Service');
const { notifyListingActivated } = require('../userModule/user/services/notificationService');

const adminCheck = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
};

// GET ALL (supports pagination: ?page=1&limit=20)
router.get('/', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /services/admin/ called at ${new Date().toISOString()}`);
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 1);
    const skip = (page - 1) * limit;

    console.log(`📋 [PAGINATION] page=${page}, limit=${limit}, skip=${skip}`);
    console.log(`🔍 [DB QUERY] Counting Service documents with filter:`, JSON.stringify(filter));
    
    const countStart = Date.now();
    const totalCount = await Service.countDocuments(filter);
    console.log(`✅ [DB RESULT] Count returned ${totalCount} documents in ${Date.now() - countStart}ms`);
    
    console.log(`🔍 [DB QUERY] Fetching paginated Service items - limit=${limit}, skip=${skip}`);
    const findStart = Date.now();
    const data = await Service.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    console.log(`✅ [DB RESULT] find() returned ${(data || []).length} documents in ${Date.now() - findStart}ms`);

    console.log(`📤 [RESPONSE] Sending 200 with ${(data || []).length} items after ${Date.now() - start}ms`);
    res.json({ data, count: (data || []).length, totalCount: totalCount || 0, page, limit });
  } catch (e) {
    console.error(`❌ [ERROR] GET /services/admin/ failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// GET ONE
router.get('/:id', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /services/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Fetching Service by ID: ${req.params.id}`);
    const queryStart = Date.now();
    const doc = await Service.findById(req.params.id);
    console.log(`✅ [DB RESULT] findById completed in ${Date.now() - queryStart}ms - ${doc ? 'found' : 'not found'}`);
    
    if (!doc) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }
    console.log(`📤 [RESPONSE] Sending 200 after ${Date.now() - start}ms`);
    res.json(doc);
  } catch (e) {
    console.error(`❌ [ERROR] GET /services/admin/:id failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// CREATE
router.post('/', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] POST /services/admin/ called at ${new Date().toISOString()}`);
  try {
    const { serviceName, providerName, city, contactPhone } = req.body;
    if (!serviceName || !providerName || !city || !contactPhone) return res.status(400).json({ message: 'Service Name, Provider, City and Contact Phone are required' });

    console.log(`📝 [VALIDATION] Creating Service with name="${serviceName}", provider="${providerName}", city="${city}"`);

    // New listings must be reviewed before going live.
    req.body.status = 'pending';

    const rawAmenities = req.body.amenities ?? req.body.amenitiesText ?? '';
    const amenities = Array.isArray(rawAmenities)
      ? rawAmenities
          .map((s) => (s ?? '').toString().trim())
          .filter(Boolean)
      : rawAmenities
          .toString()
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean);

    if (amenities.length === 0) {
      return res.status(400).json({ message: 'Services Offered is required' });
    }

    // Ensure canonical field is stored.
    req.body.amenities = amenities;

    console.log(`🔍 [DB QUERY] Creating and saving new Service`);
    const saveStart = Date.now();
    const doc = new Service(req.body);
    await doc.save();
    console.log(`✅ [DB RESULT] Service saved with ID ${doc._id} in ${Date.now() - saveStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(doc);
  } catch (e) {
    console.error(`❌ [ERROR] POST /services/admin/ failed: ${e.message} after ${Date.now() - start}ms`);
    if (e.name === 'ValidationError') return res.status(400).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
});

// UPDATE (full)
router.put('/:id', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PUT /services/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const hasAmenitiesUpdate = Object.prototype.hasOwnProperty.call(req.body, 'amenities') ||
      Object.prototype.hasOwnProperty.call(req.body, 'amenitiesText');

    if (hasAmenitiesUpdate) {
      const rawAmenities = req.body.amenities ?? req.body.amenitiesText ?? '';
      const amenities = Array.isArray(rawAmenities)
        ? rawAmenities.map((s) => (s ?? '').toString().trim()).filter(Boolean)
        : rawAmenities.toString().split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

      if (amenities.length === 0) {
        return res.status(400).json({ message: 'Services Offered is required' });
      }

      req.body.amenities = amenities;
      delete req.body.amenitiesText;
    }

    console.log(`🔍 [DB QUERY] Updating Service with ID: ${req.params.id}`);
    const updateStart = Date.now();
    const doc = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    console.log(`✅ [DB RESULT] Update completed in ${Date.now() - updateStart}ms`);
    
    if (!doc) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(doc);
  } catch (e) {
    console.error(`❌ [ERROR] PUT /services/admin/:id failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// PATCH status
router.patch('/:id/status', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PATCH /services/admin/:id/status called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const { status } = req.body;
    const normalised = status === 'inactive' ? 'disabled' : status;
    console.log(`📝 [VALIDATION] Status change requested: ${status} -> ${normalised}`);
    
    if (!['active', 'disabled', 'pending'].includes(normalised)) return res.status(400).json({ message: 'Invalid status' });

    console.log(`🔍 [DB QUERY] Fetching Service before update: ${req.params.id}`);
    const fetchStart = Date.now();
    const before = await Service.findById(req.params.id).lean();
    console.log(`✅ [DB RESULT] Before-state fetched in ${Date.now() - fetchStart}ms`);
    
    if (!before) return res.status(404).json({ message: 'Not found' });

    console.log(`🔍 [DB QUERY] Updating Service status: ${req.params.id} -> ${normalised}`);
    const updateStart = Date.now();
    const doc = await Service.findByIdAndUpdate(req.params.id, { status: normalised }, { new: true });
    console.log(`✅ [DB RESULT] Status update completed in ${Date.now() - updateStart}ms`);
    
    if (!doc) return res.status(404).json({ message: 'Not found' });

    const wasActive = String(before.status || '').toLowerCase() === 'active';
    const isActive = normalised === 'active';
    if (!wasActive && isActive) {
      console.log(`🔔 [NOTIFICATION] Notifying activation for listing: ${doc._id}`);
      notifyListingActivated({
        module: 'services',
        entityId: doc._id,
        listingTitle: doc.title || doc.serviceName,
      }).catch(() => {});
    }

    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(doc);
  } catch (e) {
    console.error(`❌ [ERROR] PATCH /services/admin/:id/status failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// DELETE
router.delete('/:id', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] DELETE /services/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Deleting Service with ID: ${req.params.id}`);
    const deleteStart = Date.now();
    const doc = await Service.findByIdAndDelete(req.params.id);
    console.log(`✅ [DB RESULT] Delete completed in ${Date.now() - deleteStart}ms`);
    
    if (!doc) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error(`❌ [ERROR] DELETE /services/admin/:id failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
