const Job = require("../model/Job");

// Get all jobs (paginated)
exports.getAllJobs = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getAllJobs called at ${new Date().toISOString()}`);
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 1));
    const skip = (page - 1) * limit;

    console.log(`📋 [PAGINATION] page=${page}, limit=${limit}, skip=${skip}`);

    const query = {};
    if (req.query.status) query.status = req.query.status;

    console.log(`🔍 [DB QUERY] Counting Job documents with query:`, JSON.stringify(query));
    const countStart = Date.now();
    const total = await Job.countDocuments(query);
    console.log(`✅ [DB RESULT] Count returned ${total} documents in ${Date.now() - countStart}ms`);

    console.log(`🔍 [DB QUERY] Fetching paginated Job items - limit=${limit}, skip=${skip}`);
    const findStart = Date.now();
    const items = await Job.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    console.log(`✅ [DB RESULT] find() returned ${items.length} documents in ${Date.now() - findStart}ms`);

    const totalPages = Math.ceil(total / limit);
    console.log(`📤 [RESPONSE] Sending 200 with ${items.length} items after ${Date.now() - start}ms`);
    res.json({ data: items, count: total, page, limit, totalPages });
  } catch (err) {
    console.error(`❌ [ERROR] getAllJobs failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};

// Get single job by ID
exports.getJobById = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getJobById called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Fetching Job by ID: ${req.params.id}`);
    const queryStart = Date.now();
    const item = await Job.findById(req.params.id);
    console.log(`✅ [DB RESULT] findById completed in ${Date.now() - queryStart}ms - ${item ? 'found' : 'not found'}`);
    
    if (!item) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Item not found" });
    }
    console.log(`📤 [RESPONSE] Sending 200 after ${Date.now() - start}ms`);
    res.json(item);
  } catch (err) {
    console.error(`❌ [ERROR] getJobById failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};

// Create new job
exports.createJob = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] createJob called at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Creating and saving new Job`);
    const saveStart = Date.now();
    const item = new Job(req.body);
    const saved = await item.save();
    console.log(`✅ [DB RESULT] Job saved with ID ${saved._id} in ${Date.now() - saveStart}ms`);
    
    console.log(`📤 [RESPONSE] Sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json(saved);
  } catch (err) {
    console.error(`❌ [ERROR] createJob failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: err.message });
  }
};

// Update job
exports.updateJob = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] updateJob called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Updating Job with ID: ${req.params.id}`);
    const updateStart = Date.now();
    const updated = await Job.findByIdAndUpdate(
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
    console.error(`❌ [ERROR] updateJob failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(400).json({ message: err.message });
  }
};

// Delete job
exports.deleteJob = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] deleteJob called with id=${req.params.id} at ${new Date().toISOString()}`);
  try {
    console.log(`🔍 [DB QUERY] Deleting Job with ID: ${req.params.id}`);
    const deleteStart = Date.now();
    const deleted = await Job.findByIdAndDelete(req.params.id);
    console.log(`✅ [DB RESULT] Delete completed in ${Date.now() - deleteStart}ms`);
    
    if (!deleted) {
      console.log(`📤 [RESPONSE] Sending 404 after ${Date.now() - start}ms`);
      return res.status(404).json({ message: "Item not found" });
    }
    console.log(`📤 [RESPONSE] Sending 200 response after ${Date.now() - start}ms`);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(`❌ [ERROR] deleteJob failed: ${err.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: err.message });
  }
};
