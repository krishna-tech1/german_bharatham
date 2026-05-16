// Backward-compatibility wrapper.
// Some modules historically imported from "middleware/authMiddleware".
// The actual JWT auth middleware lives in "middleware/auth".

const { protect, adminOnly } = require("./auth");

module.exports = { protect, adminOnly };