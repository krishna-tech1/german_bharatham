require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema, "user");

async function ensureAdmin() {
  try {
    // Connect to database (will use "germanbharatham" from URI)
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ Connected to database: ${mongoose.connection.db.databaseName}`);

    // Check if admin exists
    const existingAdmin = await User.findOne({ email: "admin@german.com" });
    
    if (existingAdmin) {
      console.log(`✅ Admin user already exists in '${mongoose.connection.db.databaseName}' database`);
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Role: ${existingAdmin.role}`);
    } else {
      // Create admin user
      const hashedPassword = await bcrypt.hash("admin@123", 10);
      const admin = new User({
        name: "Admin",
        email: "admin@german.com",
        password: hashedPassword,
        role: "admin",
      });
      
      await admin.save();
      console.log(`✅ Admin user created in '${mongoose.connection.db.databaseName}' database`);
      console.log(`   Email: admin@german.com`);
      console.log(`   Password: admin@123`);
      console.log(`   Role: admin`);
    }
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

ensureAdmin();
