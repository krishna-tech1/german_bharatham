const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../..", ".env") });

const prisma = require("../../config/prisma");
const bcrypt = require("bcryptjs");

const emailArg = process.argv[2];
const passwordArg = process.argv[3];

const adminEmail = String(emailArg || "admin@german.com").trim().toLowerCase();
const adminPassword = String(passwordArg || "admin@123");

async function run() {
  try {
    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail }
    });

    if (existingAdmin) {
      console.log("Admin already exists:", adminEmail);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await prisma.user.create({
      data: {
        name: "Super Admin",
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
      }
    });

    console.log("Admin created successfully in PostgreSQL");
    console.log("Email:", adminEmail);
    console.log("Password:", adminPassword);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();