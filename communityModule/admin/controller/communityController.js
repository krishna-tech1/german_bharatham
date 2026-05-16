const Guide = require("../model/Guide");

// public list – most recent first
exports.getAllGuides = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getAllGuides (admin) called at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Fetching all Guide documents sorted by createdAt`);
    const queryStart = Date.now();
    const guides = await Guide.find().sort({ createdAt: -1 });
    console.log(`✅ [DB RESULT] find() returned ${guides.length} documents in ${Date.now() - queryStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 200 with ${guides.length} items after ${Date.now() - start}ms`);
    res.json(guides);
  } catch (err) {
    console.error(`❌ [ERROR] getAllGuides failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};


exports.getGuideById = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getGuideById (admin) called with id=${req.params.id} at ${new Date().toISOString()}`);
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
  } catch (err) {
    console.error(`❌ [ERROR] getGuideById failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};

exports.createGuide = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] createGuide (admin) called at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Creating and saving new Guide`);
    const saveStart = Date.now();
    const guide = new Guide(req.body);
    const saved = await guide.save();
    console.log(`✅ [DB RESULT] Guide saved with ID ${saved._id} in ${Date.now() - saveStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(saved);
  } catch (err) {
    console.error(`❌ [ERROR] createGuide failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: err.message });
  }
};

exports.updateGuide = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] updateGuide (admin) called with id=${req.params.id} at ${new Date().toISOString()}`);
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
  } catch (err) {
    console.error(`❌ [ERROR] updateGuide failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: err.message });
  }
};

exports.deleteGuide = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] deleteGuide (admin) called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Deleting Guide with ID: ${req.params.id}`);
    const deleteStart = Date.now();
    await Guide.findByIdAndDelete(req.params.id);
    console.log(`✅ [DB RESULT] Delete completed in ${Date.now() - deleteStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(`❌ [ERROR] deleteGuide failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};