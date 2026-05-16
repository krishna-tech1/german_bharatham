const FoodGrocery = require("../model/FoodGrocery");
const axios = require("axios");

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
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 1));
    const skip = (page - 1) * limit;

    console.log(`📋 [PAGINATION] page=${page}, limit=${limit}, skip=${skip}`);

    const query = {};
    // optional status filter
    if (req.query.status) query.status = req.query.status;

    console.log(`🔍 [DB QUERY] Counting FoodGrocery documents with query:`, JSON.stringify(query));
    const countStart = Date.now();
    const total = await FoodGrocery.countDocuments(query);
    console.log(`✅ [DB RESULT] Count returned ${total} documents in ${Date.now() - countStart}ms`);

    console.log(`🔍 [DB QUERY] Fetching paginated FoodGrocery items - limit=${limit}, skip=${skip}`);
    const findStart = Date.now();
    const items = await FoodGrocery.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    console.log(`✅ [DB RESULT] find() returned ${items.length} documents in ${Date.now() - findStart}ms`);

    const totalPages = Math.ceil(total / limit);
    console.log(`📤 [RESPONSE] Sending 200 with ${items.length} items after ${Date.now() - start}ms`);
    res.json({ data: items, count: total, page, limit, totalPages });
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
    console.log(`🔍 [DB QUERY] Fetching FoodGrocery by ID: ${req.params.id}`);
    const queryStart = Date.now();
    const item = await FoodGrocery.findById(req.params.id);
    console.log(`✅ [DB RESULT] findById completed in ${Date.now() - queryStart}ms - ${item ? 'found' : 'not found'}`);
    
    if (!item) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Item not found" });
    }
    console.log(`📤 [RESPONSE] Sending 200 after ${Date.now() - start}ms`);
    res.json(item);
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
    // Ensure proper data structure
    const itemData = {
      ...req.body,
      category: "Food", // Always set category to Food
      location: req.body.location || `${req.body.city}, ${req.body.address}`, // Ensure location field exists
      status: req.body.status || "Pending" // Default to Pending
    };

    // Auto-geocode from city or address
    const locationQuery = itemData.city || itemData.address;
    if (locationQuery) {
      console.log(`🌍 [GEOCODE] Geocoding location: ${locationQuery}`);
      const coords = await geocode(locationQuery);
      if (coords.latitude) {
        itemData.latitude  = coords.latitude;
        itemData.longitude = coords.longitude;
        console.log(`✅ [GEOCODE RESULT] Got coordinates: ${coords.latitude}, ${coords.longitude}`);
      }
    }
    
    console.log(`🔍 [DB QUERY] Creating and saving new FoodGrocery`);
    const saveStart = Date.now();
    const item = new FoodGrocery(itemData);
    const saved = await item.save();
    console.log(`✅ [DB RESULT] FoodGrocery saved with ID ${saved._id} in ${Date.now() - saveStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(saved);
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
    // Ensure location is updated if address or city changes
    const updateData = {
      ...req.body,
      category: "Food" // Maintain category
    };
    
    if (req.body.city || req.body.address) {
      updateData.location = `${req.body.city || ''}, ${req.body.address || ''}`.trim();
    }

    // Re-geocode if city/address changed
    const locationQuery = req.body.city || req.body.address;
    if (locationQuery) {
      console.log(`🌍 [GEOCODE] Re-geocoding location: ${locationQuery}`);
      const coords = await geocode(locationQuery);
      if (coords.latitude) {
        updateData.latitude  = coords.latitude;
        updateData.longitude = coords.longitude;
        console.log(`✅ [GEOCODE RESULT] Got updated coordinates: ${coords.latitude}, ${coords.longitude}`);
      }
    }
    
    console.log(`🔍 [DB QUERY] Updating FoodGrocery with ID: ${req.params.id}`);
    const updateStart = Date.now();
    const updated = await FoodGrocery.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    console.log(`✅ [DB RESULT] Update completed in ${Date.now() - updateStart}ms`);
    
    if (!updated) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Item not found" });
    }
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(updated);
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
    console.log(`🔍 [DB QUERY] Deleting FoodGrocery with ID: ${req.params.id}`);
    const deleteStart = Date.now();
    const deleted = await FoodGrocery.findByIdAndDelete(req.params.id);
    console.log(`✅ [DB RESULT] Delete completed in ${Date.now() - deleteStart}ms`);
    
    if (!deleted) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Item not found" });
    }
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
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }
    
    console.log(`🔍 [DB QUERY] Updating FoodGrocery status to: ${status}`);
    const updateStart = Date.now();
    const updated = await FoodGrocery.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    console.log(`✅ [DB RESULT] Status update completed in ${Date.now() - updateStart}ms`);
    
    if (!updated) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Item not found" });
    }
    
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(updated);
  } catch (err) {
    console.error(`❌ [ERROR] updateStatus failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};