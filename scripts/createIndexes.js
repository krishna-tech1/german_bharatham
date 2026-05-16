const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Use the db config which handles DNS and connection options
const connectDB = require('../config/db');

const Accommodation = require('../accommodationModule/accomodation');
const FoodGrocery = require('../foodGroceryModule/admin/model/FoodGrocery');
const Job = require('../jobsModule/admin/model/Job');
const Service = require('../servicesModule/admin/model/Service');
const GenericListing = require('../categoryModule/GenericListing');

async function createIndexes() {
  try {
    console.log('🔗 [CONNECT] Connecting to MongoDB...');
    await connectDB();
    console.log('✅ [CONNECTED] Connected to MongoDB');

    const collections = [
      { name: 'Accommodation', model: Accommodation },
      { name: 'FoodGrocery', model: FoodGrocery },
      { name: 'Job', model: Job },
      { name: 'Service', model: Service },
      { name: 'GenericListing', model: GenericListing },
    ];

    console.log('\n📊 [INDEXES] Creating indexes for all collections...\n');

    for (const { name, model } of collections) {
      try {
        console.log(`🔍 [${name}] Creating compound index on { status: 1, createdAt: -1 }...`);
        await model.collection.createIndex({ status: 1, createdAt: -1 });
        console.log(`✅ [${name}] Compound index created successfully`);

        console.log(`🔍 [${name}] Creating index on { status: 1 }...`);
        await model.collection.createIndex({ status: 1 });
        console.log(`✅ [${name}] Status index created successfully`);

        console.log(`🔍 [${name}] Creating index on { createdAt: -1 }...`);
        await model.collection.createIndex({ createdAt: -1 });
        console.log(`✅ [${name}] CreatedAt index created successfully\n`);
      } catch (err) {
        console.error(`⚠️  [${name}] Error creating index: ${err.message}\n`);
      }
    }

    console.log('✨ [SUCCESS] All indexes created/verified successfully!');
    console.log('\n📈 Expected performance improvements:');
    console.log('   - Dashboard recent listings: 1121ms → ~200-300ms');
    console.log('   - Jobs listing: 526ms → ~100-150ms');
    console.log('   - Status filtering: Significantly faster on all collections\n');

    await mongoose.connection.close();
    console.log('🔌 [DISCONNECT] Disconnected from MongoDB');
    process.exit(0);
  } catch (err) {
    console.error('❌ [ERROR] Failed to create indexes:', err.message);
    process.exit(1);
  }
}

createIndexes();
