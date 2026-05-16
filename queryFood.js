require("dotenv").config();
const mongoose = require("mongoose");

async function queryDirectly() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ Connected to: ${mongoose.connection.db.databaseName}`);
    
    // Query directly using collection
    const items = await mongoose.connection.db.collection("foodgrocery").find().toArray();
    console.log(`\n📊 Found ${items.length} items in 'foodgrocery' collection:\n`);
    
    items.forEach((item, i) => {
      console.log(`${i + 1}. ${item.title || item.name || 'Untitled'}`);
      console.log(`   - ID: ${item._id}`);
      console.log(`   - City: ${item.city}`);
      console.log(`   - Category: ${item.category}`);
      console.log(`   - Status: ${item.status}`);
      console.log(`   - Created: ${item.createdAt}`);
      console.log('');
    });
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

queryDirectly();
