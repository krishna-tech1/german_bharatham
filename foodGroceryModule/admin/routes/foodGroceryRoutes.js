const express = require("express");
const router = express.Router();
const ctrl = require("../controller/foodGroceryController");
const { protect, adminOnly } = require("../../../middleware/auth");

// Logging middleware
router.use((req, res, next) => {
  console.log(`🍴 Food Grocery Route: ${req.method} ${req.path}`);
  next();
});

// Anyone can read
router.get("/", ctrl.getAllFoodGrocery);
router.get("/:id", ctrl.getFoodGroceryById);

// Only authenticated admins can create/update/delete
router.post("/", protect, adminOnly, ctrl.createFoodGrocery);
router.put("/:id", protect, adminOnly, ctrl.updateFoodGrocery);
router.patch("/:id/status", protect, adminOnly, ctrl.updateStatus);
router.delete("/:id", protect, adminOnly, ctrl.deleteFoodGrocery);

module.exports = router;