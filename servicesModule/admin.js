const express = require('express');
const router = express.Router();
const prisma = require("../config/prisma");
const { notifyListingActivated } = require('../userModule/user/services/notificationService');

const adminCheck = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
};

// Helper to map PostgreSQL Prisma service to match frontend _id expectations
const mapService = (item) => {
  if (!item) return null;
  return {
    ...item,
    _id: String(item.id),
  };
};

// GET ALL (supports pagination: ?page=1&limit=20)
router.get('/', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /services/admin/ called at ${new Date().toISOString()}`);
  try {
    const { status } = req.query;
    const where = {};
    if (status) {
      where.status = { equals: status, mode: 'insensitive' };
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    console.log(`📋 [PAGINATION] page=${page}, limit=${limit}, skip=${skip}`);
    console.log(`🔍 [DB QUERY] Counting Service documents with filter:`, JSON.stringify(where));
    
    const countStart = Date.now();
    const totalCount = await prisma.service.count({ where });
    console.log(`✅ [DB RESULT] Count returned ${totalCount} documents in ${Date.now() - countStart}ms`);
    
    console.log(`🔍 [DB QUERY] Fetching paginated Service items - limit=${limit}, skip=${skip}`);
    const findStart = Date.now();
    const data = await prisma.service.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });
    console.log(`✅ [DB RESULT] findMany returned ${(data || []).length} documents in ${Date.now() - findStart}ms`);

    const mapped = data.map(mapService);
    console.log(`📤 [RESPONSE] Sending 200 with ${mapped.length} items after ${Date.now() - start}ms`);
    res.json({ data: mapped, count: mapped.length, totalCount: totalCount || 0, page, limit });
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
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    console.log(`🔍 [DB QUERY] Fetching Service by ID: ${numericId}`);
    const queryStart = Date.now();
    const doc = await prisma.service.findUnique({
      where: { id: numericId }
    });
    console.log(`✅ [DB RESULT] findUnique completed in ${Date.now() - queryStart}ms - ${doc ? 'found' : 'not found'}`);
    
    if (!doc) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }
    console.log(`📤 [RESPONSE] Sending 200 after ${Date.now() - start}ms`);
    res.json(mapService(doc));
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

    console.log(`🔍 [DB QUERY] Creating and saving new Service`);
    const saveStart = Date.now();
    const doc = await prisma.service.create({
      data: {
        title: req.body.title || serviceName,
        providerName,
        category: req.body.category || "Services",
        description: req.body.description || null,
        location: req.body.location || city,
        latitude: req.body.latitude ? parseFloat(req.body.latitude) : null,
        longitude: req.body.longitude ? parseFloat(req.body.longitude) : null,
        address: req.body.address || null,
        phone: req.body.phone || contactPhone,
        whatsapp: req.body.whatsapp || null,
        email: req.body.email || "services@germanbharatham.com",
        website: req.body.website || null,
        images: Array.isArray(req.body.images) ? req.body.images : [],
        amenities: amenities,
        rating: req.body.rating ? parseFloat(req.body.rating) : 0,
        ratingCount: req.body.ratingCount ? parseInt(req.body.ratingCount, 10) : 0,
        averageRating: req.body.averageRating ? parseFloat(req.body.averageRating) : 0,
        totalRatings: req.body.totalRatings ? parseInt(req.body.totalRatings, 10) : 0,
        ratingDistribution: req.body.ratingDistribution || {},
        lastRatedAt: req.body.lastRatedAt ? new Date(req.body.lastRatedAt) : null,
        priceRange: req.body.priceRange || null,
        isActive: req.body.isActive !== false,
        serviceName,
        serviceType: req.body.serviceType || null,
        provider: req.body.provider || null,
        city,
        area: req.body.area || null,
        postalCode: req.body.postalCode || null,
        contactPhone,
        status: 'pending',
        featured: req.body.featured === true,
        verified: req.body.verified === true,
        createdById: req.user ? parseInt(req.user.id, 10) : null,
        creatorType: req.body.creatorType || "admin",
      }
    });
    console.log(`✅ [DB RESULT] Service saved with ID ${doc.id} in ${Date.now() - saveStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(mapService(doc));
  } catch (e) {
    console.error(`❌ [ERROR] POST /services/admin/ failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// UPDATE (full)
router.put('/:id', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PUT /services/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    const hasAmenitiesUpdate = Object.prototype.hasOwnProperty.call(req.body, 'amenities') ||
      Object.prototype.hasOwnProperty.call(req.body, 'amenitiesText');

    const updateData = {
      ...req.body
    };

    // Remove client side MongoDB _id if present to prevent validation issues
    delete updateData._id;
    delete updateData.id;

    if (hasAmenitiesUpdate) {
      const rawAmenities = req.body.amenities ?? req.body.amenitiesText ?? '';
      const amenities = Array.isArray(rawAmenities)
        ? rawAmenities.map((s) => (s ?? '').toString().trim()).filter(Boolean)
        : rawAmenities.toString().split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

      if (amenities.length === 0) {
        return res.status(400).json({ message: 'Services Offered is required' });
      }

      updateData.amenities = amenities;
      delete updateData.amenitiesText;
    }

    if (req.body.rating) updateData.rating = parseFloat(req.body.rating);
    if (req.body.ratingCount) updateData.ratingCount = parseInt(req.body.ratingCount, 10);
    if (req.body.averageRating) updateData.averageRating = parseFloat(req.body.averageRating);
    if (req.body.totalRatings) updateData.totalRatings = parseInt(req.body.totalRatings, 10);

    console.log(`🔍 [DB QUERY] Updating Service with ID: ${numericId}`);
    const updateStart = Date.now();
    const doc = await prisma.service.update({
      where: { id: numericId },
      data: updateData
    });
    console.log(`✅ [DB RESULT] Update completed in ${Date.now() - updateStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(mapService(doc));
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
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    const { status } = req.body;
    const normalised = status === 'inactive' ? 'disabled' : status;
    console.log(`📝 [VALIDATION] Status change requested: ${status} -> ${normalised}`);
    
    if (!['active', 'disabled', 'pending'].includes(normalised)) return res.status(400).json({ message: 'Invalid status' });

    console.log(`🔍 [DB QUERY] Fetching Service before update: ${numericId}`);
    const fetchStart = Date.now();
    const before = await prisma.service.findUnique({
      where: { id: numericId }
    });
    console.log(`✅ [DB RESULT] Before-state fetched in ${Date.now() - fetchStart}ms`);
    
    if (!before) return res.status(404).json({ message: 'Not found' });

    console.log(`🔍 [DB QUERY] Updating Service status: ${numericId} -> ${normalised}`);
    const updateStart = Date.now();
    const doc = await prisma.service.update({
      where: { id: numericId },
      data: { status: normalised, isActive: normalised === 'active' }
    });
    console.log(`✅ [DB RESULT] Status update completed in ${Date.now() - updateStart}ms`);

    const wasActive = String(before.status || '').toLowerCase() === 'active';
    const isActive = normalised === 'active';
    if (!wasActive && isActive) {
      console.log(`🔔 [NOTIFICATION] Notifying activation for listing: ${doc.id}`);
      notifyListingActivated({
        module: 'services',
        entityId: String(doc.id),
        listingTitle: doc.title || doc.serviceName,
      }).catch(() => {});
    }

    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(mapService(doc));
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
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    console.log(`🔍 [DB QUERY] Deleting Service with ID: ${numericId}`);
    const deleteStart = Date.now();
    await prisma.service.delete({
      where: { id: numericId }
    });
    console.log(`✅ [DB RESULT] Delete completed in ${Date.now() - deleteStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error(`❌ [ERROR] DELETE /services/admin/:id failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
