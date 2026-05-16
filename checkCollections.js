require("dotenv").config();
const mongoose = require("mongoose");

async function checkCollections() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ Connected to database: ${mongoose.connection.db.databaseName}`);
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("\n📁 Collections in database:");
    collections.forEach(col => {
      console.log(`   - ${col.name}`);
    });
    
    // Check for food-related collections
    const foodCollections = collections.filter(c => 
      c.name.toLowerCase().includes('food') || 
      c.name.toLowerCase().includes('grocery') ||
      c.name.toLowerCase().includes('restaurant')
    );
    
    if (foodCollections.length > 0) {
      console.log("\n🍴 Food-related collections:");
      for (const col of foodCollections) {
        const count = await mongoose.connection.db.collection(col.name).countDocuments();
        console.log(`   - ${col.name}: ${count} documents`);
        
        if (count > 0) {
          const sample = await mongoose.connection.db.collection(col.name).findOne();
          console.log(`     Sample keys: ${Object.keys(sample).join(', ')}`);
        }
      }
    }
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkCollections();
