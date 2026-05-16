const User = require("../models/User");

// 🌐 Public-safe user profiles (role=user only)
exports.getPublicUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 1));
    const skip = (page - 1) * limit;

    const filter = { role: "user", isActive: true };
    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).select("name email phone photo role isActive createdAt location preferredCity").skip(skip).limit(limit)
    ]);
    const totalPages = Math.ceil(total / limit);
    res.json({ data: users, count: total, page, limit, totalPages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 👀 Get All Users (only role = user)
exports.getAllUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 1));
    const skip = (page - 1) * limit;

    const filter = { role: "user" };
    
    // Sort logic
    let sort = { createdAt: -1 }; // Default: newest
    const sortBy = req.query.sortBy;
    if (sortBy === 'oldest') sort = { createdAt: 1 };
    else if (sortBy === 'alphabetical') sort = { name: 1 };

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select("-password")
        .sort(sort)
        .skip(skip)
        .limit(limit)
    ]);
    const totalPages = Math.ceil(total / limit);
    res.json({ data: users, count: total, page, limit, totalPages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Activate User
exports.activateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });
    console.log(`🟢 [ADMIN] User activated: ${user.email} (${user._id})`);
    res.json({ message: "User activated", isActive: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ❌ Deactivate User
exports.deactivateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });
    console.log(`🔴 [ADMIN] User deactivated: ${user.email} (${user._id})`);
    res.json({ message: "User deactivated", isActive: false });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};