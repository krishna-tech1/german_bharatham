const Service = require("../model/Service");

// Get all services
exports.getAllServices = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getAllServices called at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Fetching all Service documents sorted by createdAt`);
    const queryStart = Date.now();
    const items = await Service.find().sort({ createdAt: -1 });
    console.log(`✅ [DB RESULT] find() returned ${items.length} documents in ${Date.now() - queryStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 200 with ${items.length} items after ${Date.now() - start}ms`);
    res.json({ data: items, count: items.length });
  } catch (err) {
    console.error(`❌ [ERROR] getAllServices failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};

// Get single service by ID
exports.getServiceById = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getServiceById called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Fetching Service by ID: ${req.params.id}`);
    const queryStart = Date.now();
    const item = await Service.findById(req.params.id);
    console.log(`✅ [DB RESULT] findById completed in ${Date.now() - queryStart}ms - ${item ? 'found' : 'not found'}`);
    
    if (!item) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Item not found" });
    }
    console.log(`📤 [RESPONSE] Sending 200 after ${Date.now() - start}ms`);
    res.json(item);
  } catch (err) {
    console.error(`❌ [ERROR] getServiceById failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};

// Create new service
exports.createService = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] createService called at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Creating and saving new Service`);
    const saveStart = Date.now();
    const item = new Service(req.body);
    const saved = await item.save();
    console.log(`✅ [DB RESULT] Service saved with ID ${saved._id} in ${Date.now() - saveStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(saved);
  } catch (err) {
    console.error(`❌ [ERROR] createService failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: err.message });
  }
};

// Update service
exports.updateService = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] updateService called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Updating Service with ID: ${req.params.id}`);
    const updateStart = Date.now();
    const updated = await Service.findByIdAndUpdate(
      req.params.id,
      req.body,
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
    console.error(`❌ [ERROR] updateService failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: err.message });
  }
};

// Delete service
exports.deleteService = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] deleteService called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Deleting Service with ID: ${req.params.id}`);
    const deleteStart = Date.now();
    const deleted = await Service.findByIdAndDelete(req.params.id);
    console.log(`✅ [DB RESULT] Delete completed in ${Date.now() - deleteStart}ms`);
    
    if (!deleted) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Item not found" });
    }
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(`❌ [ERROR] deleteService failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};
