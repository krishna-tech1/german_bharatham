
const express = require("express");
const router = express.Router();
const { protect, adminOnly } = require("../../../middleware/auth");
const userController = require("../controllers/userController");
const controller = require("../controllers/authController");
const notificationController = require("../controllers/notificationController");


router.post("/register", controller.register);
router.post("/send-verification-code", controller.sendVerificationCode);
router.post("/login", controller.login);
router.post("/social-login", controller.socialLogin);
router.post("/forgot-password", controller.forgotPassword);
router.post("/reset-password", controller.resetPassword);
router.post("/forgot-password-otp", controller.forgotPasswordOtp);
router.post("/reset-password-otp", controller.resetPasswordOtp);
router.post("/verify-email", controller.verifyEmail);
router.get("/profile", protect, controller.getProfile);
router.put("/profile", protect, controller.updateProfile);
router.put("/change-password", protect, controller.changePassword);

// Notifications (protected)
router.get("/notifications", protect, notificationController.getMyNotifications);
router.post(
	"/notifications/like",
	protect,
	notificationController.createLikeNotification
);
router.put(
	"/notifications/:id/read",
	protect,
	notificationController.markNotificationRead
);
// Public-safe user listing (no auth)
router.get("/public-users", userController.getPublicUsers);
// 👑 Admin Routes
router.get("/all-users", protect, adminOnly, userController.getAllUsers);
router.put("/activate/:id", protect, adminOnly, userController.activateUser);
router.put("/deactivate/:id", protect, adminOnly, userController.deactivateUser);
module.exports = router;