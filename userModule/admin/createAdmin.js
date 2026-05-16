const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../..", ".env") });

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../user/models/User");

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

const emailArg = process.argv[2];
const passwordArg = process.argv[3];

const adminEmail = String(emailArg || "admin@german.com").trim().toLowerCase();
const adminPassword = String(passwordArg || "admin@123");

if (!mongoUri) {
  console.error(
    "Missing MongoDB connection string. Set MONGO_URI in backend/.env (or MONGODB_URI)."
  );
  process.exit(2);
}

mongoose
  .connect(mongoUri)
  .then(async () => {

    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      console.log("Admin already exists:", adminEmail);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await User.create({
      name: "Super Admin",
      email: adminEmail,
      password: hashedPassword,
      role: "admin",
    });

    console.log("Admin created successfully");
    console.log("Email:", adminEmail);
    console.log("Password:", adminPassword);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });