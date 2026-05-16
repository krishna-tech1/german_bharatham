require("dotenv").config();
const mongoose = require("mongoose");
const FoodGrocery = require("./foodGroceryModule/admin/model/FoodGrocery");

const activateAllFood = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB Atlas");
    
    const result = await FoodGrocery.updateMany(
      { status: "Pending" },
      { status: "Active" }
    );
    
    console.log(`✓ Updated ${result.modifiedCount} food items to Active`);
    
    const activeItems = await FoodGrocery.find({ status: "Active" });
    console.log(`Total Active food items: ${activeItems.length}`);
    
    if (activeItems.length > 0) {
      console.log("\nActive restaurants:");
      activeItems.forEach((item, i) => {
        console.log(`${i + 1}. ${item.title} - ${item.location}`);
      });
    }
    
    mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
};

activateAllFood();
