const prisma = require("../../../config/prisma");
const axios = require("axios");

// Helper to map PostgreSQL Prisma FoodGrocery to match frontend _id expectations
const mapFoodGrocery = (item) => {
  if (!item) return null;
  return {
    ...item,
    _id: String(item.id),
  };
};

// ── Geocode an address string → { latitude, longitude } using Nominatim ──────
async function geocode(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "GermanBharathamApp/1.0" },
      timeout: 8000,
    });
    if (data && data.length > 0) {
      return {
        latitude:  parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
      };
    }
  } catch (_) {
    // Geocoding failure must not block the save
  }
  return {};
}

// Get all food/grocery items - paginated
exports.getAllFoodGrocery = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getAllFoodGrocery called at ${new Date().toISOString()}`);
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    console.log(`📋 [PAGINATION] page=${page}, limit=${limit}, skip=${skip}`);

    const where = {};
    if (req.query.status) {
      where.status = { equals: req.query.status, mode: 'insensitive' };
    }

    console.log(`🔍 [DB QUERY] Counting FoodGrocery documents with query:`, JSON.stringify(where));
    const countStart = Date.now();
    const total = await prisma.foodGrocery.count({ where });
    console.log(`✅ [DB RESULT] Count returned ${total} documents in ${Date.now() - countStart}ms`);

    console.log(`🔍 [DB QUERY] Fetching paginated FoodGrocery items - limit=${limit}, skip=${skip}`);
    const findStart = Date.now();
    const items = await prisma.foodGrocery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });
    console.log(`✅ [DB RESULT] findMany returned ${items.length} documents in ${Date.now() - findStart}ms`);

    const mapped = items.map(mapFoodGrocery);
    const totalPages = Math.ceil(total / limit);
    console.log(`📤 [RESPONSE] Sending 200 with ${mapped.length} items after ${Date.now() - start}ms`);
    res.json({ data: mapped, count: total, page, limit, totalPages });
  } catch (err) {
    console.error(`❌ [ERROR] getAllFoodGrocery failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};

// Get single food/grocery item by ID
exports.getFoodGroceryById = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getFoodGroceryById called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    console.log(`🔍 [DB QUERY] Fetching FoodGrocery by ID: ${numericId}`);
    const queryStart = Date.now();
    const item = await prisma.foodGrocery.findUnique({
      where: { id: numericId }
    });
    console.log(`✅ [DB RESULT] findUnique completed in ${Date.now() - queryStart}ms - ${item ? 'found' : 'not found'}`);
    
    if (!item) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Item not found" });
    }
    console.log(`📤 [RESPONSE] Sending 200 after ${Date.now() - start}ms`);
    res.json(mapFoodGrocery(item));
  } catch (err) {
    console.error(`❌ [ERROR] getFoodGroceryById failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};

// Create new food/grocery item
exports.createFoodGrocery = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] createFoodGrocery called at ${new Date().toISOString()}`);
  try {
    const title = (req.body.title || '').trim();
    if (!title) return res.status(400).json({ message: "Title is required" });

    // Ensure proper location field
    const city = req.body.city || "";
    const address = req.body.address || "";
    const location = req.body.location || `${city}, ${address}`.trim();

    // Auto-geocode from city or address
    let latitude = req.body.latitude ? parseFloat(req.body.latitude) : null;
    let longitude = req.body.longitude ? parseFloat(req.body.longitude) : null;

    const locationQuery = city || address;
    if (locationQuery && latitude === null) {
      console.log(`🌍 [GEOCODE] Geocoding location: ${locationQuery}`);
      const coords = await geocode(locationQuery);
      if (coords.latitude) {
        latitude = coords.latitude;
        longitude = coords.longitude;
        console.log(`✅ [GEOCODE RESULT] Got coordinates: ${coords.latitude}, ${coords.longitude}`);
      }
    }
    
    console.log(`🔍 [DB QUERY] Creating and saving new FoodGrocery`);
    const saveStart = Date.now();
    const saved = await prisma.foodGrocery.create({
      data: {
        title,
        category: "Food",
        subCategory: req.body.subCategory || "",
        type: req.body.type || null,
        location,
        address,
        city,
        state: req.body.state || null,
        zipCode: req.body.zipCode || null,
        phone: req.body.phone || null,
        email: req.body.email || null,
        website: req.body.website || null,
        description: req.body.description || null,
        openingHours: req.body.openingHours || null,
        priceRange: req.body.priceRange || null,
        rating: req.body.rating ? parseFloat(req.body.rating) : 0,
        cuisine: Array.isArray(req.body.cuisine) ? req.body.cuisine.map(c => String(c)) : [],
        specialties: Array.isArray(req.body.specialties) ? req.body.specialties.map(s => String(s)) : [],
        deliveryAvailable: req.body.deliveryAvailable === true,
        takeoutAvailable: req.body.takeoutAvailable === true,
        dineInAvailable: req.body.dineInAvailable === true,
        cateringAvailable: req.body.cateringAvailable === true,
        image: req.body.image || null,
        latitude,
        longitude,
        averageRating: 0,
        totalRatings: 0,
        ratingDistribution: req.body.ratingDistribution || {},
        status: req.body.status || "Pending",
        featured: req.body.featured === true,
        verified: req.body.verified === true,
        createdById: req.user ? parseInt(req.user.id, 10) : null,
        creatorType: req.body.creatorType || "admin",
      }
    });

    console.log(`✅ [DB RESULT] FoodGrocery saved with ID ${saved.id} in ${Date.now() - saveStart}ms`);
    console.log(`📤 [RESPONSE] Sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(mapFoodGrocery(saved));
  } catch (err) {
    console.error(`❌ [ERROR] createFoodGrocery failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: err.message });
  }
};

// Update food/grocery item
exports.updateFoodGrocery = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] updateFoodGrocery called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    const b = req.body;

    // Whitelist only known FoodGrocery Prisma schema fields
    const updateData = {};
    if (b.title       != null) updateData.title       = String(b.title || b.name || '').trim() || null;
    if (b.name        != null) updateData.title       = String(b.name  || b.title || '').trim() || null;
    if (b.subCategory != null) updateData.subCategory = String(b.subCategory).trim() || null;
    if (b.type        != null) updateData.type        = String(b.type).trim() || null;
    if (b.address     != null) updateData.address     = String(b.address).trim() || null;
    if (b.city        != null) updateData.city        = String(b.city).trim() || null;
    if (b.state       != null) updateData.state       = String(b.state).trim() || null;
    if (b.zipCode     != null) updateData.zipCode     = String(b.zipCode).trim() || null;
    if (b.description != null) updateData.description = String(b.description).trim() || null;
    if (b.openingHours!= null) updateData.openingHours= String(b.openingHours).trim() || null;
    if (b.priceRange  != null) updateData.priceRange  = String(b.priceRange).trim() || null;
    if (b.website     != null) updateData.website     = String(b.website).trim() || null;
    if (b.status      != null) updateData.status      = b.status;
    if (b.featured    != null) updateData.featured    = !!b.featured;
    if (b.verified    != null) updateData.verified    = !!b.verified;
    if (b.phone  != null) updateData.phone  = String(b.phone).trim() || null;
    if (b.dineInAvailable  != null) updateData.dineInAvailable  = !!b.dineInAvailable;
    if (b.deliveryAvailable!= null) updateData.deliveryAvailable= !!b.deliveryAvailable;
    if (b.takeoutAvailable != null) updateData.takeoutAvailable = !!b.takeoutAvailable;
    if (b.cateringAvailable!= null) updateData.cateringAvailable= !!b.cateringAvailable;

    if (Array.isArray(b.cuisine))     updateData.cuisine     = b.cuisine.map(c => String(c));
    if (Array.isArray(b.specialties)) updateData.specialties = b.specialties.map(s => String(s));

    // Build location string from city/address
    if (b.city || b.address) {
      updateData.location = `${b.city || ''}, ${b.address || ''}`.trim().replace(/^,\s*/, '').replace(/,\s*$/, '');
    }

    // Re-geocode if city/address changed
    const locationQuery = b.city || b.address;
    if (locationQuery) {
      console.log(`🌍 [GEOCODE] Re-geocoding location: ${locationQuery}`);
      const coords = await geocode(locationQuery);
      if (coords.latitude) {
        updateData.latitude  = coords.latitude;
        updateData.longitude = coords.longitude;
        console.log(`✅ [GEOCODE RESULT] Got updated coordinates: ${coords.latitude}, ${coords.longitude}`);
      }
    }

    console.log(`🔍 [DB QUERY] Updating FoodGrocery with ID: ${numericId}`);
    const updateStart = Date.now();
    const updated = await prisma.foodGrocery.update({
      where: { id: numericId },
      data: updateData
    });
    console.log(`✅ [DB RESULT] Update completed in ${Date.now() - updateStart}ms`);

    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(mapFoodGrocery(updated));
  } catch (err) {
    console.error(`❌ [ERROR] updateFoodGrocery failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: err.message });
  }
};

// Delete food/grocery item
exports.deleteFoodGrocery = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] deleteFoodGrocery called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    console.log(`🔍 [DB QUERY] Deleting FoodGrocery with ID: ${numericId}`);
    const deleteStart = Date.now();
    await prisma.foodGrocery.delete({
      where: { id: numericId }
    });
    console.log(`✅ [DB RESULT] Delete completed in ${Date.now() - deleteStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(`❌ [ERROR] deleteFoodGrocery failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};

// Update status only
exports.updateStatus = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] updateStatus called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.params.id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid ID format" });

    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }
    
    console.log(`🔍 [DB QUERY] Updating FoodGrocery status to: ${status}`);
    const updateStart = Date.now();
    const updated = await prisma.foodGrocery.update({
      where: { id: numericId },
      data: { status }
    });
    console.log(`✅ [DB RESULT] Status update completed in ${Date.now() - updateStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(mapFoodGrocery(updated));
  } catch (err) {
    console.error(`❌ [ERROR] updateStatus failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};