const Accommodation = require("../../accomodation");
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

// Get all accommodations (paginated)
exports.getAllAccommodations = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getAllAccommodations called at ${new Date().toISOString()}`);
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 1));
    const skip = (page - 1) * limit;

    console.log(`📋 [PAGINATION] page=${page}, limit=${limit}, skip=${skip}`);

    const query = {};
    if (req.query.status) query.status = req.query.status;

    console.log(`🔍 [DB QUERY] Fetching Accommodation count with query:`, JSON.stringify(query));
    const countStart = Date.now();
    const total = await Accommodation.countDocuments(query);
    console.log(`✅ [DB RESULT] Accommodation count returned ${total} documents in ${Date.now() - countStart}ms`);

    console.log(`🔍 [DB QUERY] Fetching paginated Accommodation items - limit=${limit}, skip=${skip}`);
    const findStart = Date.now();
    const items = await Accommodation.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    console.log(`✅ [DB RESULT] Accommodation.find() returned ${items.length} documents in ${Date.now() - findStart}ms`);

    const totalPages = Math.ceil(total / limit);
    console.log(`📤 [RESPONSE] Sending 200 with ${items.length} items after ${Date.now() - start}ms`);
    res.json({ data: items, count: total, page, limit, totalPages });
  } catch (err) {
    console.error(`❌ [ERROR] getAllAccommodations failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};

// Get single accommodation by ID
exports.getAccommodationById = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getAccommodationById called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Fetching Accommodation by ID: ${req.params.id}`);
    const queryStart = Date.now();
    const item = await Accommodation.findById(req.params.id);
    console.log(`✅ [DB RESULT] findById completed in ${Date.now() - queryStart}ms - ${item ? 'found' : 'not found'}`);
    
    if (!item) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Item not found" });
    }
    console.log(`📤 [RESPONSE] Sending 200 after ${Date.now() - start}ms`);
    res.json(item);
  } catch (err) {
    console.error(`❌ [ERROR] getAccommodationById failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};

// Create new accommodation
exports.createAccommodation = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] createAccommodation called at ${new Date().toISOString()}`);
  try {
    const body = { ...req.body };

    // Auto-geocode from city or address
    const locationQuery = body.city || body.address;
    if (locationQuery) {
      console.log(`🌍 [GEOCODE] Geocoding location: ${locationQuery}`);
      const coords = await geocode(locationQuery);
      if (coords.latitude) {
        body.latitude  = coords.latitude;
        body.longitude = coords.longitude;
        console.log(`✅ [GEOCODE RESULT] Got coordinates: ${coords.latitude}, ${coords.longitude}`);
      }
    }

    console.log(`🔍 [DB QUERY] Creating and saving new Accommodation`);
    const saveStart = Date.now();
    const item = new Accommodation(body);
    const saved = await item.save();
    console.log(`✅ [DB RESULT] Accommodation saved with ID ${saved._id} in ${Date.now() - saveStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(saved);
  } catch (err) {
    console.error(`❌ [ERROR] createAccommodation failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: err.message });
  }
};

// Update accommodation
exports.updateAccommodation = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] updateAccommodation called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    const body = { ...req.body };

    // Re-geocode if city/address changed
    const locationQuery = body.city || body.address;
    if (locationQuery) {
      console.log(`🌍 [GEOCODE] Re-geocoding location: ${locationQuery}`);
      const coords = await geocode(locationQuery);
      if (coords.latitude) {
        body.latitude  = coords.latitude;
        body.longitude = coords.longitude;
        console.log(`✅ [GEOCODE RESULT] Got updated coordinates: ${coords.latitude}, ${coords.longitude}`);
      }
    }

    console.log(`🔍 [DB QUERY] Updating Accommodation with ID: ${req.params.id}`);
    const updateStart = Date.now();
    const updated = await Accommodation.findByIdAndUpdate(
      req.params.id,
      body,
      { new: true }
    );
    console.log(`✅ [DB RESULT] Accommodation update completed in ${Date.now() - updateStart}ms`);
    
    if (!updated) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Item not found" });
    }
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(updated);
  } catch (err) {
    console.error(`❌ [ERROR] updateAccommodation failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: err.message });
  }
};

// Delete accommodation
exports.deleteAccommodation = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] deleteAccommodation called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Deleting Accommodation with ID: ${req.params.id}`);
    const deleteStart = Date.now();
    const deleted = await Accommodation.findByIdAndDelete(req.params.id);
    console.log(`✅ [DB RESULT] Accommodation delete completed in ${Date.now() - deleteStart}ms`);
    
    if (!deleted) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Item not found" });
    }
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(`❌ [ERROR] deleteAccommodation failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};
