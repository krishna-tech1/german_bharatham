const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const prisma = require("../config/prisma");
const bcrypt = require("bcryptjs");

const TARGET_EMAIL = (process.env.TARGET_EMAIL || process.argv[2] || "admin@german.com").trim().toLowerCase();
const NEW_PASSWORD = process.env.NEW_PASSWORD || process.argv[3];

async function main() {
  if (!NEW_PASSWORD || String(NEW_PASSWORD).trim().length < 6) {
    console.error("Missing/invalid NEW_PASSWORD (min 6 chars). Provide via env NEW_PASSWORD or 2nd arg.");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: TARGET_EMAIL, mode: 'insensitive' } }
  });

  if (!user) {
    console.error(`Admin user not found: ${TARGET_EMAIL}`);
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(String(NEW_PASSWORD), 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      email: TARGET_EMAIL,
      role: "admin",
      isActive: true,
      password: hashedPassword
    }
  });

  console.log(`Reset password OK for ${TARGET_EMAIL} in PostgreSQL`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
