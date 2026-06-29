const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
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

// Helper to map PostgreSQL Prisma job listing to match frontend _id expectations
const mapJob = (job) => {
  if (!job) return null;
  return {
    ...job,
    _id: String(job.id),
  };
};

// GET ALL (supports pagination: ?page=1&limit=20)
router.get('/', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /jobs/admin/ called at ${new Date().toISOString()}`);
  try {
    const { status } = req.query;
    const filter = status ? { status: normalizeStatus(status, String(status)) } : {};
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    console.log(`📋 [PAGINATION] page=${page}, limit=${limit}, skip=${skip}`);
    console.log(`🔍 [DB QUERY] Counting Job documents with filter:`, JSON.stringify(filter));
    
    const countStart = Date.now();
    const totalCount = await prisma.jobListing.count({ where: filter });
    console.log(`✅ [DB RESULT] Count returned ${totalCount} documents in ${Date.now() - countStart}ms`);
    
    console.log(`🔍 [DB QUERY] Fetching paginated Job items - limit=${limit}, skip=${skip}`);
    const findStart = Date.now();
    const data = await prisma.jobListing.findMany({
      where: filter,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });
    console.log(`✅ [DB RESULT] find() returned ${(data || []).length} documents in ${Date.now() - findStart}ms`);

    const mappedData = data.map(mapJob);
    console.log(`📤 [RESPONSE] Sending 200 with ${mappedData.length} items after ${Date.now() - start}ms`);
    res.json({ data: mappedData, count: mappedData.length, totalCount: totalCount || 0, page, limit });
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
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: 'Invalid ID format' });

    console.log(`🔍 [DB QUERY] Fetching Job by ID: ${numericId}`);
    const queryStart = Date.now();
    const doc = await prisma.jobListing.findUnique({
      where: { id: numericId }
    });
    console.log(`✅ [DB RESULT] findUnique completed in ${Date.now() - queryStart}ms - ${doc ? 'found' : 'not found'}`);
    
    if (!doc) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }
    console.log(`📤 [RESPONSE] Sending 200 after ${Date.now() - start}ms`);
    res.json(mapJob(doc));
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

    // Handle base64 logo upload to Cloudinary if present
    if (req.body.companyLogo && req.body.companyLogo.startsWith('data:')) {
      const { uploadBase64 } = require('../services/cloudinaryService');
      const uploadRes = await uploadBase64(req.body.companyLogo, "company-logos");
      req.body.companyLogo = uploadRes.secure_url;
    }

    req.body.status = 'Pending';

    console.log(`🔍 [DB QUERY] Creating and saving new Job in Prisma`);
    const saveStart = Date.now();
    
    const doc = await prisma.jobListing.create({
      data: {
        title: req.body.title,
        category: req.body.category || 'Job',
        companyName: req.body.companyName,
        companyLogo: req.body.companyLogo,
        location: req.body.location,
        description: req.body.description,
        contact: req.body.contact,
        salary: req.body.salary,
        jobType: req.body.jobType || 'Full Time',
        requirements: req.body.requirements,
        benefits: req.body.benefits,
        applyUrl: req.body.applyUrl,
        status: req.body.status,
        amenities: req.body.amenities || [],
        creatorType: req.body.creatorType || 'admin',
        createdById: req.user ? req.user.id : null,
      }
    });
    
    console.log(`✅ [DB RESULT] Job saved with ID ${doc.id} in ${Date.now() - saveStart}ms`);
    console.log(`📤 [RESPONSE] Sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(mapJob(doc));
  } catch (e) {
    console.error(`❌ [ERROR] POST /jobs/admin/ failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// UPDATE (full)
router.put('/:id', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PUT /jobs/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: 'Invalid ID format' });

    if (req.body && req.body.status != null) {
      req.body.status = normalizeStatus(req.body.status, req.body.status);
    }

    // Handle base64 logo upload to Cloudinary if present
    if (req.body.companyLogo && req.body.companyLogo.startsWith('data:')) {
      const { uploadBase64 } = require('../services/cloudinaryService');
      const uploadRes = await uploadBase64(req.body.companyLogo, "company-logos");
      req.body.companyLogo = uploadRes.secure_url;
    }

    console.log(`🔍 [DB QUERY] Updating Job with ID: ${numericId}`);
    const updateStart = Date.now();
    const doc = await prisma.jobListing.update({
      where: { id: numericId },
      data: {
        title: req.body.title,
        category: req.body.category,
        companyName: req.body.companyName,
        companyLogo: req.body.companyLogo,
        location: req.body.location,
        description: req.body.description,
        contact: req.body.contact,
        salary: req.body.salary,
        jobType: req.body.jobType,
        requirements: req.body.requirements,
        benefits: req.body.benefits,
        applyUrl: req.body.applyUrl,
        status: req.body.status,
        amenities: req.body.amenities,
        creatorType: req.body.creatorType,
      }
    });
    console.log(`✅ [DB RESULT] Update completed in ${Date.now() - updateStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(mapJob(doc));
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
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: 'Invalid ID format' });

    const { status } = req.body;
    const normalised = normalizeStatus(status, '');
    console.log(`📝 [VALIDATION] Status change requested: ${status} -> ${normalised}`);
    
    if (!['Active', 'Pending', 'Inactive'].includes(normalised)) return res.status(400).json({ message: 'Invalid status' });

    console.log(`🔍 [DB QUERY] Fetching Job before update: ${numericId}`);
    const fetchStart = Date.now();
    const before = await prisma.jobListing.findUnique({
      where: { id: numericId }
    });
    console.log(`✅ [DB RESULT] Before-state fetched in ${Date.now() - fetchStart}ms`);
    
    if (!before) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: 'Not found' });
    }

    console.log(`🔍 [DB QUERY] Updating Job status: ${numericId} -> ${normalised}`);
    const updateStart = Date.now();
    const doc = await prisma.jobListing.update({
      where: { id: numericId },
      data: { status: normalised }
    });
    console.log(`✅ [DB RESULT] Status update completed in ${Date.now() - updateStart}ms`);

    const wasActive = String(before.status || '').toLowerCase() === 'active';
    const isActive = normalised === 'Active';
    if (!wasActive && isActive) {
      console.log(`🔔 [NOTIFICATION] Notifying activation for listing: ${doc.id}`);
      notifyListingActivated({
        module: 'jobs',
        entityId: String(doc.id),
        listingTitle: doc.title,
      }).catch(() => {});
    }

    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(mapJob(doc));
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
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: 'Invalid ID format' });

    console.log(`🔍 [DB QUERY] Deleting Job with ID: ${numericId}`);
    const deleteStart = Date.now();
    await prisma.jobListing.delete({
      where: { id: numericId }
    });
    console.log(`✅ [DB RESULT] Delete completed in ${Date.now() - deleteStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error(`❌ [ERROR] DELETE /jobs/admin/:id failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
