const express = require("express");
const router = express.Router();
const Accommodation = require("./accomodation");
const { notifyListingActivated } = require('../userModule/user/services/notificationService');

// GET ALL (with stats) with optional pagination: ?page=1&limit=20
router.get("/", async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /accommodation/admin/ called at ${new Date().toISOString()}`);
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    // Pagination params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 1);
    const skip = (page - 1) * limit;

    console.log(`📋 [PAGINATION] page=${page}, limit=${limit}, skip=${skip}`);

    // Get total counts (lightweight)
    console.log(`🔍 [DB QUERY] Fetching Accommodation count (all documents)`);
    const countStart = Date.now();
    const totalCount = await Accommodation.countDocuments();
    console.log(`✅ [DB RESULT] Accommodation count returned ${totalCount} total documents in ${Date.now() - countStart}ms`);

    console.log(`🔍 [DB QUERY] Fetching Accommodation count (active documents with title and city)`);
    const activeStart = Date.now();
    const activeCount = await Accommodation.countDocuments({ 
      title: { $exists: true, $ne: null },
      city: { $exists: true, $ne: null }
    });
    console.log(`✅ [DB RESULT] Accommodation active count returned ${activeCount} documents in ${Date.now() - activeStart}ms`);

    // Fetch paginated data
    console.log(`🔍 [DB QUERY] Fetching paginated Accommodation data - limit=${limit}, skip=${skip}`);
    const findStart = Date.now();
    const accommodations = await Accommodation.find()
      .select('-__v')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    console.log(`✅ [DB RESULT] Accommodation.find() returned ${(accommodations || []).length} documents in ${Date.now() - findStart}ms`);

    console.log(`📤 [RESPONSE] Sending 200 response with ${(accommodations || []).length} items after ${Date.now() - start}ms`);
    res.status(200).json({
      data: accommodations || [],
      count: (accommodations || []).length,
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
router.get("/:id", async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] GET /accommodation/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    console.log(`🔍 [DB QUERY] Fetching Accommodation by ID: ${req.params.id}`);
    const queryStart = Date.now();
    const accommodation = await Accommodation.findById(req.params.id);
    console.log(`✅ [DB RESULT] Accommodation.findById() ${accommodation ? 'found' : 'not found'} in ${Date.now() - queryStart}ms`);
    
    if (!accommodation) {
      console.log(`📤 [RESPONSE] Sending 404 response after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Not found" });
    }

    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.status(200).json(accommodation);
  } catch (error) {
    console.error(`❌ [ERROR] GET /accommodation/admin/:id failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
});

// CREATE
router.post("/", async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] POST /accommodation/admin/ called at ${new Date().toISOString()}`);
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

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

    // Prepare payload with proper type conversions
    const payload = {
      title,
      city,
      description: req.body.description ? String(req.body.description).trim() : null,
      propertyType: req.body.propertyType ? String(req.body.propertyType).trim() : null,
      postalCode: req.body.postalCode ? String(req.body.postalCode).trim() : null,
      address: req.body.address ? String(req.body.address).trim() : null,
      latitude: req.body.latitude ? parseFloat(req.body.latitude) : null,
      longitude: req.body.longitude ? parseFloat(req.body.longitude) : null,
      
      rentDetails: req.body.rentDetails ? {
        coldRent: req.body.rentDetails.coldRent ? parseFloat(req.body.rentDetails.coldRent) : null,
        warmRent: req.body.rentDetails.warmRent ? parseFloat(req.body.rentDetails.warmRent) : null,
        additionalCosts: req.body.rentDetails.additionalCosts ? parseFloat(req.body.rentDetails.additionalCosts) : null,
        deposit: req.body.rentDetails.deposit ? parseFloat(req.body.rentDetails.deposit) : null,
        electricityIncluded: Boolean(req.body.rentDetails.electricityIncluded),
        heatingIncluded: Boolean(req.body.rentDetails.heatingIncluded),
        internetIncluded: Boolean(req.body.rentDetails.internetIncluded)
      } : {},
      
      propertyDetails: req.body.propertyDetails ? {
        sizeSqm: req.body.propertyDetails.sizeSqm ? parseFloat(req.body.propertyDetails.sizeSqm) : null,
        bedrooms: req.body.propertyDetails.bedrooms ? parseInt(req.body.propertyDetails.bedrooms, 10) : null,
        bathrooms: req.body.propertyDetails.bathrooms ? parseInt(req.body.propertyDetails.bathrooms, 10) : null,
        totalFloors: req.body.propertyDetails.totalFloors ? parseInt(req.body.propertyDetails.totalFloors, 10) : null
      } : {},
      
      amenities: req.body.amenities ? {
        balcony: Boolean(req.body.amenities.balcony),
        terrace: Boolean(req.body.amenities.terrace),
        garden: Boolean(req.body.amenities.garden),
        lift: Boolean(req.body.amenities.lift),
        parking: Boolean(req.body.amenities.parking),
        garage: Boolean(req.body.amenities.garage),
        cellar: Boolean(req.body.amenities.cellar),
        washingMachine: Boolean(req.body.amenities.washingMachine),
        dishwasher: Boolean(req.body.amenities.dishwasher),
        kitchen: Boolean(req.body.amenities.kitchen),
        petsAllowed: Boolean(req.body.amenities.petsAllowed),
        smokingAllowed: Boolean(req.body.amenities.smokingAllowed),
        anmeldungPossible: Boolean(req.body.amenities.anmeldungPossible),
        studentFriendly: Boolean(req.body.amenities.studentFriendly),
        wheelchairAccessible: Boolean(req.body.amenities.wheelchairAccessible)
      } : {},
      
      locationHighlights: req.body.locationHighlights ? {
        nearUniversity: Boolean(req.body.locationHighlights.nearUniversity),
        nearSupermarket: Boolean(req.body.locationHighlights.nearSupermarket),
        nearHospital: Boolean(req.body.locationHighlights.nearHospital),
        nearPublicTransport: Boolean(req.body.locationHighlights.nearPublicTransport),
        ubahnDistanceMeters: req.body.locationHighlights.ubahnDistanceMeters ? parseInt(req.body.locationHighlights.ubahnDistanceMeters, 10) : null,
        sbahnDistanceMeters: req.body.locationHighlights.sbahnDistanceMeters ? parseInt(req.body.locationHighlights.sbahnDistanceMeters, 10) : null,
        busDistanceMeters: req.body.locationHighlights.busDistanceMeters ? parseInt(req.body.locationHighlights.busDistanceMeters, 10) : null
      } : {},
      
      media: req.body.media ? {
        images: Array.isArray(req.body.media.images) ? req.body.media.images : [],
        videoUrl: req.body.media.videoUrl ? String(req.body.media.videoUrl).trim() : null,
        floorPlan: req.body.media.floorPlan ? String(req.body.media.floorPlan).trim() : null
      } : {},
      
      adminControls: req.body.adminControls ? {
        viewsCount: req.body.adminControls.viewsCount ? parseInt(req.body.adminControls.viewsCount, 10) : 0,
        favouritesCount: req.body.adminControls.favouritesCount ? parseInt(req.body.adminControls.favouritesCount, 10) : 0
      } : {},

      contactPhone: req.body.contactPhone ? String(req.body.contactPhone).trim() : null,
      // New listings must be reviewed before going live.
      status: 'pending'
    };

    console.log(`🔍 [DB QUERY] Creating new Accommodation document`);
    const newAccommodation = new Accommodation(payload);
    const saveStart = Date.now();
    await newAccommodation.save();
    console.log(`✅ [DB RESULT] Accommodation document saved with ID ${newAccommodation._id} in ${Date.now() - saveStart}ms`);

    // Verify accommodation was saved to MongoDB
    console.log(`🔍 [DB QUERY] Verifying saved Accommodation with ID ${newAccommodation._id}`);
    const verifyStart = Date.now();
    const savedAccommodation = await Accommodation.findById(newAccommodation._id);
    console.log(`✅ [DB RESULT] Accommodation verification ${savedAccommodation ? 'successful' : 'failed'} in ${Date.now() - verifyStart}ms`);
    
    if (!savedAccommodation) {
      console.error(`❌ [ERROR] Failed to verify saved accommodation: ${newAccommodation._id}`);
      return res.status(500).json({ message: "Accommodation save verification failed" });
    }

    console.log(`✅ Accommodation created successfully: ${savedAccommodation._id}`);
    console.log(`📤 [RESPONSE] Sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(savedAccommodation);
  } catch (error) {
    console.error(`❌ [ERROR] POST /accommodation/admin/ failed: ${error.message} after ${Date.now() - start}ms`);
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
});

// PATCH status
router.patch('/:id/status', async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PATCH /accommodation/admin/:id/status called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    
    const { status } = req.body;
    const normalised = status === 'inactive' ? 'disabled' : status;
    console.log(`📝 [VALIDATION] Status change requested: ${status} -> ${normalised}`);
    
    if (!['active', 'disabled', 'pending'].includes(normalised)) return res.status(400).json({ message: 'Invalid status' });
    const isActive = normalised === 'active';

    console.log(`🔍 [DB QUERY] Fetching Accommodation before update: ${req.params.id}`);
    const fetchStart = Date.now();
    const before = await Accommodation.findById(req.params.id).lean();
    console.log(`✅ [DB RESULT] Before-state fetched in ${Date.now() - fetchStart}ms`);
    
    if (!before) return res.status(404).json({ message: 'Not found' });

    console.log(`🔍 [DB QUERY] Updating Accommodation status: ${req.params.id} -> ${normalised}`);
    const updateStart = Date.now();
    const doc = await Accommodation.findByIdAndUpdate(
      req.params.id,
      { status: normalised, 'adminControls.isActive': isActive },
      { new: true }
    );
    console.log(`✅ [DB RESULT] Accommodation updated in ${Date.now() - updateStart}ms`);
    
    if (!doc) return res.status(404).json({ message: 'Not found' });

    const wasActive = String(before.status || '').toLowerCase() === 'active';
    if (!wasActive && isActive) {
      console.log(`🔔 [NOTIFICATION] Notifying activation for listing: ${doc._id}`);
      notifyListingActivated({
        module: 'accommodation',
        entityId: doc._id,
        listingTitle: doc.title,
      }).catch(() => {});
    }

    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(doc);
  } catch (e) {
    console.error(`❌ [ERROR] PATCH /accommodation/admin/:id/status failed: ${e.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: e.message });
  }
});

// UPDATE
router.put("/:id", async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] PUT /accommodation/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    console.log(`🔍 [DB QUERY] Updating Accommodation with ID: ${req.params.id}`);
    const updateStart = Date.now();
    const updated = await Accommodation.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    console.log(`✅ [DB RESULT] Accommodation update completed in ${Date.now() - updateStart}ms`);

    if (!updated) {
      console.log(`📤 [RESPONSE] Sending 404 response after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Not found" });
    }

    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.status(200).json(updated);
  } catch (error) {
    console.error(`❌ [ERROR] PUT /accommodation/admin/:id failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
});

// DELETE
router.delete("/:id", async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] DELETE /accommodation/admin/:id called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    console.log(`🔍 [DB QUERY] Deleting Accommodation with ID: ${req.params.id}`);
    const deleteStart = Date.now();
    const deleted = await Accommodation.findByIdAndDelete(req.params.id);
    console.log(`✅ [DB RESULT] Accommodation delete completed in ${Date.now() - deleteStart}ms`);

    if (!deleted) {
      console.log(`📤 [RESPONSE] Sending 404 response after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Not found" });
    }

    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.status(200).json({ message: "Deleted successfully" });
  } catch (error) {
    console.error(`❌ [ERROR] DELETE /accommodation/admin/:id failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;