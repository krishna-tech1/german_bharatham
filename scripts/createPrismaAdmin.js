const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");

const emailArg = process.argv[2];
const passwordArg = process.argv[3];

const adminEmail = String(emailArg || "admin@german.com").trim().toLowerCase();
const adminPassword = String(passwordArg || "admin@123");

async function main() {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log("Admin already exists in Prisma database:", adminEmail);
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const newAdmin = await prisma.user.create({
    data: {
      name: "Super Admin",
      email: adminEmail,
      password: hashedPassword,
      role: "admin",
    },
  });

  console.log("Prisma Admin created successfully:", newAdmin);
  console.log("Email:", adminEmail);
  console.log("Password:", adminPassword);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error creating Prisma admin:", err);
  process.exit(1);
});
