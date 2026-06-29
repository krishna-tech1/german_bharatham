const fs = require('fs');
const path = require('path');

const filesToDelete = [
  'accommodationModule/accomodation.js',
  'accommodationModule/admin/model/Accommodation.js',
  'foodGroceryModule/Food.js',
  'foodGroceryModule/admin/model/Rating.js',
  'foodGroceryModule/admin/model/FoodGrocery.js',
  'servicesModule/Service.js',
  'servicesModule/admin/model/Service.js',
  'subscriptionModule/models/Subscription.js',
  'subscriptionModule/models/Plan.js',
  'userModule/user/models/User.js',
  'userModule/user/models/Notification.js',
  'userModule/user/models/EmailVerification.js',
  'models/Rating.js',
  'models/ProblemReport.js',
  'categoryModule/Category.js',
  'categoryModule/GenericListing.js',
  'config/db.js',
  'testModelQuery.js',
  'queryFood.js',
  'fixFoodStatuses.js',
  'ensureAdmin.js',
  'checkCollections.js',
  'activateFood.js',
  'scripts/createIndexes.js'
];

const backendDir = path.resolve(__dirname, '..');

filesToDelete.forEach(fileRelPath => {
  const fullPath = path.join(backendDir, fileRelPath);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
      console.log(`Deleted: ${fileRelPath}`);
    } catch (e) {
      console.error(`Failed to delete ${fileRelPath}:`, e.message);
    }
  } else {
    console.log(`Already deleted or not found: ${fileRelPath}`);
  }
});

// Also remove empty model folders if they exist
const foldersToCheck = [
  'accommodationModule/admin/model',
  'foodGroceryModule/admin/model',
  'servicesModule/admin/model',
  'subscriptionModule/models',
  'userModule/user/models',
  'models'
];

foldersToCheck.forEach(folderRelPath => {
  const fullPath = path.join(backendDir, folderRelPath);
  if (fs.existsSync(fullPath)) {
    try {
      const files = fs.readdirSync(fullPath);
      if (files.length === 0) {
        fs.rmdirSync(fullPath);
        console.log(`Removed empty folder: ${folderRelPath}`);
      }
    } catch (e) {
      console.error(`Failed to check/remove folder ${folderRelPath}:`, e.message);
    }
  }
});
