const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

// 🔐 Verify Token Middleware
exports.protect = async (req, res, next) => {
  try {
    let token;

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
    const numericId = parseInt(decoded.id);

    if (isNaN(numericId)) {
      return res.status(401).json({ message: "Invalid token ID format" });
    }

    const prismaUser = await prisma.user.findUnique({
      where: { id: numericId }
    });

    if (!prismaUser) {
      return res.status(401).json({ message: "User not found" });
    }

    // Attach fields matching old Mongoose document expectations
    const user = {
      ...prismaUser,
      id: String(prismaUser.id),
      _id: String(prismaUser.id)
    };

    // Check if user is active
    if (user.isActive === false) {
      console.warn(`🛑 [AUTH] Blocked access for deactivated user: ${user.email} (${user.id})`);
      return res.status(403).json({
        message: "Account deactivated. Please contact support.",
        code: "ACCOUNT_DEACTIVATED"
      });
    }

    req.user = user;
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