require("dotenv").config();
const mongoose = require("mongoose");

async function fixStatuses() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ Connected to: ${mongoose.connection.db.databaseName}`);
    
    // Fix items with undefined or invalid status
    const result = await mongoose.connection.db.collection("foodgrocery").updateMany(
      { $or: [{ status: { $exists: false } }, { status: null }, { status: { $nin: ['Active', 'Pending', 'Inactive'] } }] },
      { $set: { status: 'Pending' } }
    );
    
    console.log(`\n✅ Updated ${result.modifiedCount} documents with missing/invalid status`);
    
    // Verify all items now
    const items = await mongoose.connection.db.collection("foodgrocery").find().toArray();
    console.log(`\n📊 All ${items.length} food items:`);
    items.forEach(item => {
      console.log(`   - ${item.title || item.name}: ${item.status}`);
    });
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

fixStatuses();
