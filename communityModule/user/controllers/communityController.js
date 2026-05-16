const Guide = require("../models/Guide");

exports.getAllGuides = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getAllGuides called at ${new Date().toISOString()}`);
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 1));
    const skip = (page - 1) * limit;

    console.log(`📋 [PAGINATION] page=${page}, limit=${limit}, skip=${skip}`);

    const query = {};
    console.log(`🔍 [DB QUERY] Counting Guide documents`);
    const countStart = Date.now();
    const total = await Guide.countDocuments(query);
    console.log(`✅ [DB RESULT] Count returned ${total} documents in ${Date.now() - countStart}ms`);
    
    console.log(`🔍 [DB QUERY] Fetching paginated Guide items - limit=${limit}, skip=${skip}`);
    const findStart = Date.now();
    const guides = await Guide.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    console.log(`✅ [DB RESULT] find() returned ${guides.length} documents in ${Date.now() - findStart}ms`);
    
    const totalPages = Math.ceil(total / limit);
    console.log(`📤 [RESPONSE] Sending 200 with ${guides.length} items after ${Date.now() - start}ms`);
    res.json({ data: guides, count: total, page, limit, totalPages });
  } catch (error) {
    console.error(`❌ [ERROR] getAllGuides failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
};

exports.getGuideById = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getGuideById called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Fetching Guide by ID: ${req.params.id}`);
    const queryStart = Date.now();
    const guide = await Guide.findById(req.params.id);
    console.log(`✅ [DB RESULT] findById completed in ${Date.now() - queryStart}ms - ${guide ? 'found' : 'not found'}`);
    
    if (!guide) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Not found" });
    }
    console.log(`📤 [RESPONSE] Sending 200 after ${Date.now() - start}ms`);
    res.json(guide);
  } catch (error) {
    console.error(`❌ [ERROR] getGuideById failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
};

exports.createGuide = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] createGuide called at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Creating and saving new Guide`);
    const saveStart = Date.now();
    const guide = new Guide(req.body);
    const saved = await guide.save();
    console.log(`✅ [DB RESULT] Guide saved with ID ${saved._id} in ${Date.now() - saveStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(saved);
  } catch (error) {
    console.error(`❌ [ERROR] createGuide failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: error.message });
  }
};

exports.updateGuide = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] updateGuide called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Updating Guide with ID: ${req.params.id}`);
    const updateStart = Date.now();
    const updated = await Guide.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    console.log(`✅ [DB RESULT] Update completed in ${Date.now() - updateStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json(updated);
  } catch (error) {
    console.error(`❌ [ERROR] updateGuide failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: error.message });
  }
};

exports.deleteGuide = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] deleteGuide called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Deleting Guide with ID: ${req.params.id}`);
    const deleteStart = Date.now();
    await Guide.findByIdAndDelete(req.params.id);
    console.log(`✅ [DB RESULT] Delete completed in ${Date.now() - deleteStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error(`❌ [ERROR] deleteGuide failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
};