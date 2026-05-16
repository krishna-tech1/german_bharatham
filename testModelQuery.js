require('dotenv').config();
const mongoose = require('mongoose');
const FoodGrocery = require('./foodGroceryModule/admin/model/FoodGrocery');

async function testQuery() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected:', mongoose.connection.db.databaseName);
    
    // Check model collection name
    console.log('📋 Model collection name:', FoodGrocery.collection.name);
    console.log('📋 Model collection namespace:', FoodGrocery.collection.collectionName);
    
    // Direct collection query (this worked before)
    const directResult = await mongoose.connection.db.collection("foodgrocery").find().toArray();
    console.log(`\n🔍 Direct collection query: ${directResult.length} items found`);
    if (directResult.length > 0) {
      console.log('First item:', directResult[0].title);
    }
    
    // Model query (this was returning empty)
    const modelResult = await FoodGrocery.find();
    console.log(`\n🔍 Model query: ${modelResult.length} items found`);
    if (modelResult.length > 0) {
      console.log('First item:', modelResult[0].title);
    }
    
    // Try with lean()
    const leanResult = await FoodGrocery.find().lean();
    console.log(`\n🔍 Model query with lean(): ${leanResult.length} items found`);
    
    // Check if there's a schema issue
    console.log('\n📊 Sample document from DB:');
    if (directResult.length > 0) {
      const sample = directResult[0];
      console.log('Fields:', Object.keys(sample));
      console.log('Status:', sample.status);
      console.log('Title:', sample.title);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

testQuery();
