const jwt = require("jsonwebtoken");
const User = require("../userModule/user/models/User"); // adjust path if needed

// 🔐 Verify Token Middleware
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user from DB (IMPORTANT)
    const user = await User.findById(decoded.id).select("-password");
    
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Check if user is active
    // We check explicitly for false to allow existing users (where field might be undefined) to remain active.
    if (user.isActive === false) {
      console.warn(`🛑 [AUTH] Blocked access for deactivated user: ${user.email} (${user._id})`);
      return res.status(403).json({
        message: "Account deactivated. Please contact support.",
        code: "ACCOUNT_DEACTIVATED"
      });
    }

    req.user = user; // attach full user object
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token failed" });
  }
};

// 👑 Admin Only Middleware
exports.adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Access denied. Admin privileges required." });
  }

  next();
};