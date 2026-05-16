const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../userModule/user/models/User");

// Usage (PowerShell):
//   $env:TARGET_EMAIL='admin@german.com'; $env:NEW_PASSWORD='admin@123'; node .\scripts\resetAdminPassword.js
// Or positional args:
//   node .\scripts\resetAdminPassword.js admin@german.com admin@123
const TARGET_EMAIL = (process.env.TARGET_EMAIL || process.argv[2] || "admin@german.com").trim().toLowerCase();
const NEW_PASSWORD = process.env.NEW_PASSWORD || process.argv[3];

async function main() {
  if (!NEW_PASSWORD || String(NEW_PASSWORD).trim().length < 6) {
    console.error("Missing/invalid NEW_PASSWORD (min 6 chars). Provide via env NEW_PASSWORD or 2nd arg.");
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("Missing MongoDB connection string. Set MONGO_URI in backend/.env");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const user = await User.findOne({ email: new RegExp(`^${TARGET_EMAIL}$`, "i") });

  if (!user) {
    console.error(`Admin user not found: ${TARGET_EMAIL}`);
    process.exit(1);
  }

  user.email = TARGET_EMAIL;
  user.role = "admin";
  user.isActive = true;
  user.password = await bcrypt.hash(String(NEW_PASSWORD), 10);

  await user.save();

  console.log(`Reset password OK for ${TARGET_EMAIL}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});




