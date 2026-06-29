const express = require("express");
const router = express.Router();
const prisma = require("../config/prisma");
const { notifyListingActivated } = require('../userModule/user/services/notificationService');

// Helper to map PostgreSQL Prisma accommodation to match frontend expectations
const mapAccommodation = (item) => {
  if (!item) return null;
  return {
    ...item,
    _id: String(item.id),
  };
};

const adminCheck = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// GET ALL (with stats) with optional pagination: ?page=1&limit=20
router.get("/", adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /accommodation/admin/ called at ${new Date().toISOString()}`);
  try {
    // Pagination params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    console.log(`📋 [PAGINATION] page=${page}, limit=${limit}, skip=${skip}`);

    // Get total counts
    console.log(`🔍 [DB QUERY] Fetching Accommodation count (all documents)`);
    const countStart = Date.now();
    const totalCount = await prisma.accommodation.count();
    console.log(`✅ [DB RESULT] Accommodation count returned ${totalCount} total documents in ${Date.now() - countStart}ms`);

    console.log(`🔍 [DB QUERY] Fetching Accommodation count (active documents with title and city)`);
    const activeStart = Date.now();
    const activeCount = await prisma.accommodation.count({
      where: {
        title: { not: "" },
        city: { not: "" },
        status: { equals: 'active', mode: 'insensitive' }
      }
    });
    console.log(`✅ [DB RESULT] Accommodation active count returned ${activeCount} documents in ${Date.now() - activeStart}ms`);

    // Fetch paginated data
    console.log(`🔍 [DB QUERY] Fetching paginated Accommodation data - limit=${limit}, skip=${skip}`);
    const findStart = Date.now();
    const accommodations = await prisma.accommodation.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });
    console.log(`✅ [DB RESULT] findMany returned ${(accommodations || []).length} documents in ${Date.now() - findStart}ms`);

    const mappedData = accommodations.map(mapAccommodation);
    console.log(`📤 [RESPONSE] Sending 200 response with ${mappedData.length} items after ${Date.now() - start}ms`);
    
    res.status(200).json({
      data: mappedData,
      count: mappedData.length,
      totalCount: totalCount || 0,
      page,
      limit,
      activeCount: activeCount || 0
    });
  } catch (error) {
    console.error(`❌ [ERROR] GET /accommodation/admin/ failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
});

// GET ONE
router.get("/:id", adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /accommodation/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    console.log(`🔍 [DB QUERY] Fetching Accommodation by ID: ${numericId}`);
    const queryStart = Date.now();
    const accommodation = await prisma.accommodation.findUnique({
      where: { id: numericId }
    });
    console.log(`✅ [DB RESULT] findUnique ${accommodation ? 'found' : 'not found'} in ${Date.now() - queryStart}ms`);
    
    if (!accommodation) {
      console.log(`📤 [RESPONSE] Sending 404 response after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Not found" });
    }

    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.status(200).json(mapAccommodation(accommodation));
  } catch (error) {
    console.error(`❌ [ERROR] GET /accommodation/admin/:id failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
});

// CREATE
router.post("/", adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] POST /accommodation/admin/ called at ${new Date().toISOString()}`);
  try {
    const title = (req.body.title || '').trim();
    const city = (req.body.city || '').trim();
    const contactPhone = (req.body.contactPhone || '').trim();

    if (!title || !city) {
      return res.status(400).json({ message: 'Title and City are required' });
    }
    if (!contactPhone) {
      return res.status(400).json({ message: 'Contact Phone is required so users can call or WhatsApp the owner' });
    }

    console.log(`📝 [VALIDATION] Creating accommodation with title="${title}", city="${city}"`);

    // Extract flat helper fields for SQL search/sort performance
    const rentVal = req.body.rentDetails?.coldRent ? parseFloat(req.body.rentDetails.coldRent) : null;
    const depositVal = req.body.rentDetails?.deposit ? parseFloat(req.body.rentDetails.deposit) : null;
    const bedroomsVal = req.body.propertyDetails?.bedrooms ? parseInt(req.body.propertyDetails.bedrooms, 10) : null;
    const bathroomsVal = req.body.propertyDetails?.bathrooms ? parseInt(req.body.propertyDetails.bathrooms, 10) : null;
    const sizeVal = req.body.propertyDetails?.sizeSqm ? parseFloat(req.body.propertyDetails.sizeSqm) : null;
    const isFurnished = req.body.amenities?.furnished === true;
    const isPetsAllowed = req.body.amenities?.petsAllowed === true;
    const isParking = req.body.amenities?.parking === true;
    const firstImg = Array.isArray(req.body.media?.images) && req.body.media.images.length > 0 ? req.body.media.images[0] : null;

    console.log(`🔍 [DB QUERY] Creating new Accommodation document in Prisma`);
    const saveStart = Date.now();
    const newAccommodation = await prisma.accommodation.create({
      data: {
        title,
        category: req.body.category || "Accommodation",
        type: req.body.propertyType ? String(req.body.propertyType).trim() : null,
        address: req.body.address ? String(req.body.address).trim() : null,
        city,
        state: req.body.state ? String(req.body.state).trim() : null,
        zipCode: req.body.zipCode ? String(req.body.zipCode).trim() : null,
        phone: contactPhone,
        email: req.body.email ? String(req.body.email).trim() : null,
        website: req.body.website ? String(req.body.website).trim() : null,
        description: req.body.description ? String(req.body.description).trim() : null,
        rent: rentVal,
        deposit: depositVal,
        bedrooms: bedroomsVal,
        bathrooms: bathroomsVal,
        area: sizeVal,
        furnished: isFurnished,
        petsAllowed: isPetsAllowed,
        parkingAvailable: isParking,
        utilities: req.body.utilities ? String(req.body.utilities).trim() : null,
        availableFrom: req.body.availableFrom ? new Date(req.body.availableFrom) : null,
        image: firstImg,
        latitude: req.body.latitude ? parseFloat(req.body.latitude) : null,
        longitude: req.body.longitude ? parseFloat(req.body.longitude) : null,
        averageRating: 0,
        totalRatings: 0,
        ratingDistribution: req.body.ratingDistribution || {},
        lastRatedAt: null,
        status: 'pending',
        createdById: req.user ? parseInt(req.user.id, 10) : null,
        creatorType: req.body.creatorType || "admin",
        
        // JSON configurations
        rentDetails: req.body.rentDetails || {},
        propertyDetails: req.body.propertyDetails || {},
        amenities: req.body.amenities || {},
        locationHighlights: req.body.locationHighlights || {},
        media: req.body.media || {},
        adminControls: req.body.adminControls || {},
        contactPhone,
      }
    });

    console.log(`✅ [DB RESULT] Accommodation document saved with ID ${newAccommodation.id} in ${Date.now() - saveStart}ms`);
    console.log(`📤 [RESPONSE] Sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(mapAccommodation(newAccommodation));
  } catch (error) {
    console.error(`❌ [ERROR] POST /accommodation/admin/ failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
});

// PATCH status
router.patch('/:id/status', adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PATCH /accommodation/admin/:id/status called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    const { status } = req.body;
    const normalised = status === 'inactive' ? 'disabled' : status;
    console.log(`📝 [VALIDATION] Status change requested: ${status} -> ${normalised}`);
    
    if (!['active', 'disabled', 'pending'].includes(normalised)) return res.status(400).json({ message: 'Invalid status' });
    const isActive = normalised === 'active';

    console.log(`🔍 [DB QUERY] Fetching Accommodation before update: ${numericId}`);
    const fetchStart = Date.now();
    const before = await prisma.accommodation.findUnique({
      where: { id: numericId }
    });
    console.log(`✅ [DB RESULT] Before-state fetched in ${Date.now() - fetchStart}ms`);
    
    if (!before) return res.status(404).json({ message: 'Not found' });

    // Update nested adminControls object safely
    const existingAdminControls = before.adminControls || {};
    const updatedAdminControls = {
      ...existingAdminControls,
      isActive
    };

    console.log(`🔍 [DB QUERY] Updating Accommodation status: ${numericId} -> ${normalised}`);
    const updateStart = Date.now();
    const doc = await prisma.accommodation.update({
      where: { id: numericId },
      data: {
        status: normalised,
        adminControls: updatedAdminControls
      }
    });
    console.log(`✅ [DB RESULT] Accommodation updated in ${Date.now() - updateStart}ms`);

    const wasActive = String(before.status || '').toLowerCase() === 'active';
    if (!wasActive && isActive) {
      console.log(`🔔 [NOTIFICATION] Notifying activation for listing: ${doc.id}`);
      notifyListingActivated({
        module: 'accommodation',
        entityId: String(doc.id),
        listingTitle: doc.title,
      }).catch(() => {});
    }

    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(mapAccommodation(doc));
  } catch (e) {
    console.error(`❌ [ERROR] PATCH /accommodation/admin/:id/status failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// UPDATE
router.put("/:id", adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PUT /accommodation/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    console.log(`🔍 [DB QUERY] Updating Accommodation with ID: ${numericId}`);
    
    // Extract flat helper fields for SQL search/sort performance if they are present in req.body
    const updateData = {
      ...req.body
    };

    // Remove client side MongoDB _id if present to prevent prisma schema validation error
    delete updateData._id;
    delete updateData.id;

    if (req.body.rentDetails) {
      updateData.rent = req.body.rentDetails.coldRent ? parseFloat(req.body.rentDetails.coldRent) : null;
      updateData.deposit = req.body.rentDetails.deposit ? parseFloat(req.body.rentDetails.deposit) : null;
    }
    if (req.body.propertyDetails) {
      updateData.bedrooms = req.body.propertyDetails.bedrooms ? parseInt(req.body.propertyDetails.bedrooms, 10) : null;
      updateData.bathrooms = req.body.propertyDetails.bathrooms ? parseInt(req.body.propertyDetails.bathrooms, 10) : null;
      updateData.area = req.body.propertyDetails.sizeSqm ? parseFloat(req.body.propertyDetails.sizeSqm) : null;
    }
    if (req.body.amenities) {
      updateData.furnished = req.body.amenities.furnished === true;
      updateData.petsAllowed = req.body.amenities.petsAllowed === true;
      updateData.parkingAvailable = req.body.amenities.parking === true;
    }
    if (req.body.media && Array.isArray(req.body.media.images)) {
      updateData.image = req.body.media.images.length > 0 ? req.body.media.images[0] : null;
    }
    if (req.body.contactPhone) {
      updateData.phone = String(req.body.contactPhone).trim();
    }
    if (req.body.latitude) updateData.latitude = parseFloat(req.body.latitude);
    if (req.body.longitude) updateData.longitude = parseFloat(req.body.longitude);

    const updateStart = Date.now();
    const updated = await prisma.accommodation.update({
      where: { id: numericId },
      data: updateData
    });
    console.log(`✅ [DB RESULT] Accommodation update completed in ${Date.now() - updateStart}ms`);

    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.status(200).json(mapAccommodation(updated));
  } catch (error) {
    console.error(`❌ [ERROR] PUT /accommodation/admin/:id failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
});

// DELETE
router.delete("/:id", adminCheck, async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] DELETE /accommodation/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    console.log(`🔍 [DB QUERY] Deleting Accommodation with ID: ${numericId}`);
    const deleteStart = Date.now();
    await prisma.accommodation.delete({
      where: { id: numericId }
    });
    console.log(`✅ [DB RESULT] Accommodation delete completed in ${Date.now() - deleteStart}ms`);

    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.status(200).json({ message: "Deleted successfully" });
  } catch (error) {
    console.error(`❌ [ERROR] DELETE /accommodation/admin/:id failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;