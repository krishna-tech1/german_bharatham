const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const dns = require("dns");
const dnsServers = (process.env.DNS_SERVERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (dnsServers.length > 0) {
  dns.setServers(dnsServers);
}

const mongoose = require("mongoose");
const prisma = require("../config/prisma");

// Helper to parse numbers safely
const parseFloatOrNull = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? null : parsed;
};

const parseIntOrNull = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const parsed = parseInt(val);
  return isNaN(parsed) ? null : parsed;
};

const parseFloatOrDefault = (val, def = 0) => {
  const parsed = parseFloat(val);
  return isNaN(parsed) ? def : parsed;
};

const parseIntOrDefault = (val, def = 0) => {
  const parsed = parseInt(val);
  return isNaN(parsed) ? def : parsed;
};

// Helper to ensure values are strings (joins arrays, stringifies objects)
const ensureString = (val) => {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) {
    return val.map(item => String(item || '')).filter(Boolean).join(", ");
  }
  if (typeof val === "object") {
    try {
      return JSON.stringify(val);
    } catch (_) {
      return String(val);
    }
  }
  return String(val);
};

// Batch processor to control database load and connection stability
async function batchProcess(items, batchSize, fn) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
    // Brief sleep between batches to let the connection pool settle
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

// Mongo Models
const MongoUser = require("../userModule/user/models/User");
const MongoJob = require("../jobsModule/models/jobModel");
const MongoAccommodation = require("../accommodationModule/admin/model/Accommodation");
const MongoFoodGrocery = require("../foodGroceryModule/admin/model/FoodGrocery");
const MongoService = require("../servicesModule/admin/model/Service");
const MongoPlan = require("../subscriptionModule/models/Plan");
const MongoSubscription = require("../subscriptionModule/models/Subscription");
const MongoRating = require("../models/Rating");
const MongoReport = require("../models/ProblemReport");
const MongoNotification = require("../userModule/user/models/Notification");
const MongoEmailVerification = require("../userModule/user/models/EmailVerification");
const MongoGuide = require("../communityModule/admin/model/Guide");
const MongoCategory = require("../categoryModule/Category");
const MongoGenericListing = require("../categoryModule/GenericListing");

// Inline schemas for dynamic collections
const contentSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, default: '' },
}, { collection: 'content-management-admin' });
const MongoContentAdmin = mongoose.models.ContentAdmin || mongoose.model('ContentAdmin', contentSchema);

const pwLogSchema = new mongoose.Schema({
  adminId: mongoose.Schema.Types.ObjectId,
  adminEmail: String,
  changedAt: { type: Date, default: Date.now },
  note: { type: String, default: 'Password updated by admin' },
}, { collection: 'password setting - admin' });
const MongoPwLog = mongoose.models.PwLog || mongoose.model('PwLog', pwLogSchema);

const helpCenterSchema = new mongoose.Schema({
  question: String,
  answer: String
}, { strict: false, collection: 'help center' });
const MongoHelpCenter = mongoose.models.HelpCenter || mongoose.model('HelpCenter', helpCenterSchema);

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!mongoUri) {
  console.error("Missing MONGO_URI in environment. Cannot perform migration.");
  process.exit(1);
}

async function migrate() {
  console.log("🚀 Starting complete database migration from MongoDB to Neon PostgreSQL...");

  // Connect to MongoDB
  await mongoose.connect(mongoUri);
  console.log("🔌 Connected to MongoDB.");

  // Clean up target tables in PostgreSQL before running migration (optional/safety)
  console.log("🧹 Clearing existing tables in PostgreSQL...");
  await prisma.genericListing.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.guide.deleteMany({});
  await prisma.helpCenter.deleteMany({});
  await prisma.pwLog.deleteMany({});
  await prisma.contentAdmin.deleteMany({});
  await prisma.emailVerification.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.problemReport.deleteMany({});
  await prisma.universalRating.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.subscriptionPlan.deleteMany({});
  await prisma.service.deleteMany({});
  await prisma.foodGrocery.deleteMany({});
  await prisma.jobListing.deleteMany({});
  await prisma.accommodation.deleteMany({});
  await prisma.user.deleteMany({});

  // 1. Migrate Users & Build User ID Map
  console.log("👤 Migrating Users...");
  const mongoUsers = await MongoUser.find({}).lean();
  const userIdMap = {}; // mongoIdString -> postgresIntId

  await batchProcess(mongoUsers, 10, async (mu) => {
    const pu = await prisma.user.create({
      data: {
        name: ensureString(mu.name) || "User",
        email: ensureString(mu.email),
        phone: ensureString(mu.phone) || null,
        password: ensureString(mu.password) || null,
        authProvider: ensureString(mu.authProvider) || "local",
        googleId: ensureString(mu.googleId) || null,
        facebookId: ensureString(mu.facebookId) || null,
        appleSub: ensureString(mu.appleSub) || null,
        role: ensureString(mu.role) || "user",
        isActive: mu.isActive !== false,
        photo: ensureString(mu.photo) || null,
        dob: ensureString(mu.dob) || "",
        gender: ensureString(mu.gender) || "",
        location: ensureString(mu.location) || "",
        preferredCity: ensureString(mu.preferredCity) || "",
        education: ensureString(mu.education) || "",
        profession: ensureString(mu.profession) || "",
        germanLevel: ensureString(mu.germanLevel) || "",
        passport: ensureString(mu.passport) || "",
        resetPasswordToken: ensureString(mu.resetPasswordToken) || null,
        resetPasswordExpires: mu.resetPasswordExpires || null,
        subscriptionStatus: ensureString(mu.subscriptionStatus) || "none",
        subscriptionPlan: ensureString(mu.subscriptionPlan) || null,
        subscriptionExpiresAt: mu.subscriptionExpiresAt || null,
        subscriptionStartedAt: mu.subscriptionStartedAt || null,
        firstLoginAt: mu.firstLoginAt || null,
        lastLoginAt: mu.lastLoginAt || null,
        createdAt: mu.createdAt || new Date(),
        updatedAt: mu.updatedAt || new Date(),
      },
    });
    userIdMap[String(mu._id)] = pu.id;
  });
  console.log(`✅ Migrated ${Object.keys(userIdMap).length} users.`);

  // Maps for listing entity IDs (mongoIdString -> postgresIntId)
  const accommodationIdMap = {};
  const foodGroceryIdMap = {};
  const jobIdMap = {};
  const serviceIdMap = {};
  const categoryIdMap = {};

  // 2. Migrate Subscription Plans
  console.log("💳 Migrating Subscription Plans...");
  const mongoPlans = await MongoPlan.find({}).lean();
  await batchProcess(mongoPlans, 10, async (mp) => {
    await prisma.subscriptionPlan.create({
      data: {
        id: ensureString(mp.id),
        label: ensureString(mp.label),
        currency: ensureString(mp.currency) || "INR",
        priceInr: parseFloatOrDefault(mp.priceInr, 0),
        durationDays: parseIntOrDefault(mp.durationDays, 30),
        active: mp.active !== false,
        createdAt: mp.createdAt || new Date(),
        updatedAt: mp.updatedAt || new Date(),
      },
    });
  });
  console.log(`✅ Migrated ${mongoPlans.length} subscription plans.`);

  // 3. Migrate Subscriptions
  console.log("💵 Migrating Subscriptions...");
  const mongoSubscriptions = await MongoSubscription.find({}).lean();
  const validSubscriptions = mongoSubscriptions.filter(ms => userIdMap[String(ms.userId)]);
  await batchProcess(validSubscriptions, 10, async (ms) => {
    const pgUserId = userIdMap[String(ms.userId)];
    await prisma.subscription.create({
      data: {
        userId: pgUserId,
        provider: ensureString(ms.provider) || "razorpay",
        planId: ensureString(ms.planId) || null,
        status: ensureString(ms.status) || "none",
        currentPeriodStart: ms.currentPeriodStart || null,
        currentPeriodEnd: ms.currentPeriodEnd || null,
        razorpayPaymentLinkId: ensureString(ms.razorpayPaymentLinkId) || null,
        razorpayPaymentId: ensureString(ms.razorpayPaymentId) || null,
        metadata: ms.metadata || {},
        createdAt: ms.createdAt || new Date(),
        updatedAt: ms.updatedAt || new Date(),
      },
    });
  });
  console.log(`✅ Migrated subscriptions.`);

  // 4. Migrate Accommodations
  console.log("🏠 Migrating Accommodations...");
  const mongoAccommodations = await MongoAccommodation.find({}).lean();
  await batchProcess(mongoAccommodations, 10, async (ma) => {
    const pgCreatorId = userIdMap[String(ma.createdBy)];
    const pa = await prisma.accommodation.create({
      data: {
        title: ensureString(ma.title),
        category: ensureString(ma.category) || "Accommodation",
        type: ensureString(ma.type) || null,
        address: ensureString(ma.address) || null,
        city: ensureString(ma.city) || null,
        state: ensureString(ma.state) || null,
        zipCode: ensureString(ma.zipCode) || null,
        phone: ensureString(ma.phone) || null,
        email: ensureString(ma.email) || null,
        website: ensureString(ma.website) || null,
        description: ensureString(ma.description) || null,
        rent: parseFloatOrNull(ma.rent),
        deposit: parseFloatOrNull(ma.deposit),
        bedrooms: parseIntOrNull(ma.bedrooms),
        bathrooms: parseIntOrNull(ma.bathrooms),
        area: parseFloatOrNull(ma.area),
        furnished: ma.furnished === true,
        petsAllowed: ma.petsAllowed === true,
        parkingAvailable: ma.parkingAvailable === true,
        utilities: ensureString(ma.utilities) || null,
        availableFrom: ma.availableFrom || null,
        image: ensureString(ma.image) || null,
        latitude: parseFloatOrNull(ma.latitude),
        longitude: parseFloatOrNull(ma.longitude),
        averageRating: parseFloatOrDefault(ma.averageRating, 0),
        totalRatings: parseIntOrDefault(ma.totalRatings, 0),
        ratingDistribution: ma.ratingDistribution || {},
        lastRatedAt: ma.lastRatedAt || null,
        status: ensureString(ma.status) || "Pending",
        featured: ma.featured === true,
        createdById: pgCreatorId || null,
        creatorType: ensureString(ma.creatorType) || "admin",
        createdAt: ma.createdAt || new Date(),
        updatedAt: ma.updatedAt || new Date(),
        
        // JSON structures compatibility
        rentDetails: ma.rentDetails || {},
        propertyDetails: ma.propertyDetails || {},
        amenities: ma.amenities || {},
        locationHighlights: ma.locationHighlights || {},
        media: ma.media || {},
        adminControls: ma.adminControls || {},
        contactPhone: ensureString(ma.contactPhone) || null,
      },
    });
    accommodationIdMap[String(ma._id)] = pa.id;
  });
  console.log(`✅ Migrated ${Object.keys(accommodationIdMap).length} accommodations.`);

  // 5. Migrate Food & Grocery
  console.log("🍎 Migrating Food & Grocery Listings...");
  const mongoFoodGrocery = await MongoFoodGrocery.find({}).lean();
  await batchProcess(mongoFoodGrocery, 10, async (mf) => {
    const pgCreatorId = userIdMap[String(mf.createdBy)];
    const pf = await prisma.foodGrocery.create({
      data: {
        title: ensureString(mf.title),
        category: ensureString(mf.category) || "Food",
        subCategory: ensureString(mf.subCategory) || null,
        type: ensureString(mf.type) || null,
        location: ensureString(mf.location) || null,
        address: ensureString(mf.address) || null,
        city: ensureString(mf.city) || null,
        state: ensureString(mf.state) || null,
        zipCode: ensureString(mf.zipCode) || null,
        phone: ensureString(mf.phone) || null,
        email: ensureString(mf.email) || null,
        website: ensureString(mf.website) || null,
        description: ensureString(mf.description) || null,
        openingHours: ensureString(mf.openingHours) || null,
        priceRange: ensureString(mf.priceRange) || null,
        rating: parseFloatOrDefault(mf.rating, 0),
        cuisine: Array.isArray(mf.cuisine) ? mf.cuisine.map(c => String(c)) : [],
        specialties: Array.isArray(mf.specialties) ? mf.specialties.map(s => String(s)) : [],
        deliveryAvailable: mf.deliveryAvailable === true,
        takeoutAvailable: mf.takeoutAvailable === true,
        dineInAvailable: mf.dineInAvailable === true,
        cateringAvailable: mf.cateringAvailable === true,
        image: ensureString(mf.image) || null,
        latitude: parseFloatOrNull(mf.latitude),
        longitude: parseFloatOrNull(mf.longitude),
        averageRating: parseFloatOrDefault(mf.averageRating, 0),
        totalRatings: parseIntOrDefault(mf.totalRatings, 0),
        ratingDistribution: mf.ratingDistribution || {},
        lastRatedAt: mf.lastRatedAt || null,
        status: ensureString(mf.status) || "Pending",
        featured: mf.featured === true,
        verified: mf.verified === true,
        createdById: pgCreatorId || null,
        creatorType: ensureString(mf.creatorType) || "admin",
        createdAt: mf.createdAt || new Date(),
        updatedAt: mf.updatedAt || new Date(),
      },
    });
    foodGroceryIdMap[String(mf._id)] = pf.id;
  });
  console.log(`✅ Migrated ${Object.keys(foodGroceryIdMap).length} food & grocery listings.`);

  // 6. Migrate Jobs
  console.log("💼 Migrating Jobs...");
  const mongoJobs = await MongoJob.find({}).lean();
  await batchProcess(mongoJobs, 10, async (mj) => {
    const pgCreatorId = userIdMap[String(mj.createdBy)];
    const pj = await prisma.jobListing.create({
      data: {
        title: ensureString(mj.title),
        category: ensureString(mj.category) || "Job",
        companyName: ensureString(mj.companyName) || null,
        companyLogo: ensureString(mj.companyLogo) || null,
        location: ensureString(mj.location) || null,
        description: ensureString(mj.description) || null,
        contact: ensureString(mj.contact) || null,
        salary: ensureString(mj.salary) || null,
        jobType: ensureString(mj.jobType) || "Full Time",
        requirements: ensureString(mj.requirements) || null,
        benefits: ensureString(mj.benefits) || null,
        applyUrl: ensureString(mj.applyUrl) || null,
        status: ensureString(mj.status) || "Active",
        amenities: Array.isArray(mj.amenities) ? mj.amenities.map(a => String(a)) : [],
        createdById: pgCreatorId || null,
        creatorType: ensureString(mj.creatorType) || "admin",
        createdAt: mj.createdAt || new Date(),
        updatedAt: mj.updatedAt || new Date(),
      },
    });
    jobIdMap[String(mj._id)] = pj.id;
  });
  console.log(`✅ Migrated ${Object.keys(jobIdMap).length} jobs.`);

  // 7. Migrate Services
  console.log("🛠️ Migrating Services...");
  const mongoServices = await MongoService.find({}).lean();
  await batchProcess(mongoServices, 10, async (ms) => {
    const pgCreatorId = userIdMap[String(ms.createdBy)];
    const ps = await prisma.service.create({
      data: {
        title: ensureString(ms.title) || null,
        providerName: ensureString(ms.providerName) || null,
        category: ensureString(ms.category) || "Services",
        description: ensureString(ms.description) || null,
        location: ensureString(ms.location) || null,
        latitude: parseFloatOrNull(ms.latitude),
        longitude: parseFloatOrNull(ms.longitude),
        address: ensureString(ms.address) || null,
        phone: ensureString(ms.phone || ms.contactPhone) || "000-000-0000",
        whatsapp: ensureString(ms.whatsapp) || null,
        email: ensureString(ms.email) || "services@germanbharatham.com",
        website: ensureString(ms.website) || null,
        images: Array.isArray(ms.images) ? ms.images.map(img => String(img)) : [],
        amenities: Array.isArray(ms.amenities) ? ms.amenities.map(a => String(a)) : [],
        rating: parseFloatOrDefault(ms.rating, 0),
        ratingCount: parseIntOrDefault(ms.ratingCount, 0),
        averageRating: parseFloatOrDefault(ms.averageRating, 0),
        totalRatings: parseIntOrDefault(ms.totalRatings, 0),
        ratingDistribution: ms.ratingDistribution || {},
        lastRatedAt: ms.lastRatedAt || null,
        priceRange: ensureString(ms.priceRange) || null,
        isActive: ms.isActive !== false,
        serviceName: ensureString(ms.serviceName) || null,
        serviceType: ensureString(ms.serviceType) || null,
        provider: ensureString(ms.provider) || null,
        city: ensureString(ms.city) || null,
        area: ensureString(ms.area) || null,
        postalCode: ensureString(ms.postalCode) || null,
        contactPhone: ensureString(ms.contactPhone) || null,
        status: ensureString(ms.status) || "Active",
        featured: ms.featured === true,
        verified: ms.verified === true,
        createdById: pgCreatorId || null,
        creatorType: ensureString(ms.creatorType) || "admin",
        createdAt: ms.createdAt || new Date(),
        updatedAt: ms.updatedAt || new Date(),
      },
    });
    serviceIdMap[String(ms._id)] = ps.id;
  });
  console.log(`✅ Migrated ${Object.keys(serviceIdMap).length} services.`);

  // 8. Migrate Ratings & Match Entity IDs
  console.log("⭐ Migrating Universal Ratings...");
  const mongoRatings = await MongoRating.find({}).lean();
  const validRatings = [];
  
  for (const mr of mongoRatings) {
    let pgEntityId = null;
    const type = String(mr.entityType).toLowerCase();
    
    if (type === "accommodation") pgEntityId = accommodationIdMap[String(mr.entityId)];
    else if (type === "foodgrocery") pgEntityId = foodGroceryIdMap[String(mr.entityId)];
    else if (type === "job") pgEntityId = jobIdMap[String(mr.entityId)];
    else if (type === "service") pgEntityId = serviceIdMap[String(mr.entityId)];

    if (pgEntityId) {
      validRatings.push({ mongoRating: mr, pgEntityId });
    }
  }

  await batchProcess(validRatings, 10, async ({ mongoRating, pgEntityId }) => {
    let pgUserId = String(mongoRating.userId);
    const mappedId = userIdMap[String(mongoRating.userId)];
    if (mappedId) pgUserId = String(mappedId);

    await prisma.universalRating.create({
      data: {
        userId: pgUserId,
        userName: ensureString(mongoRating.userName) || "Anonymous User",
        userType: ensureString(mongoRating.userType) || "guest",
        entityId: pgEntityId,
        entityType: ensureString(mongoRating.entityType),
        rating: parseIntOrDefault(mongoRating.rating, 5),
        review: ensureString(mongoRating.review) || "",
        deviceInfo: mongoRating.deviceInfo || {},
        status: ensureString(mongoRating.status) || "active",
        createdAt: mongoRating.createdAt || new Date(),
        updatedAt: mongoRating.updatedAt || new Date(),
      },
    });
  });
  console.log(`✅ Migrated universal ratings.`);

  // 9. Migrate Problem Reports
  console.log("⚠️ Migrating Problem Reports...");
  const mongoReports = await MongoReport.find({}).lean();
  const validReports = mongoReports.filter(mr => userIdMap[String(mr.user?.id)]);
  await batchProcess(validReports, 10, async (mr) => {
    const pgUserId = userIdMap[String(mr.user.id)];
    await prisma.problemReport.create({
      data: {
        subject: ensureString(mr.subject),
        description: ensureString(mr.description),
        userId: pgUserId,
        userName: ensureString(mr.user.name) || "",
        userEmail: ensureString(mr.user.email) || "",
        createdAt: mr.createdAt || new Date(),
        updatedAt: mr.updatedAt || new Date(),
      },
    });
  });
  console.log(`✅ Migrated problem reports.`);

  // 10. Migrate Notifications
  console.log("🔔 Migrating Notifications...");
  const mongoNotifications = await MongoNotification.find({}).lean();
  const validNotifications = mongoNotifications.filter(mn => userIdMap[String(mn.recipient)]);
  await batchProcess(validNotifications, 10, async (mn) => {
    const pgRecipientId = userIdMap[String(mn.recipient)];
    const pgSenderId = userIdMap[String(mn.sender)] || null;

    await prisma.notification.create({
      data: {
        recipientId: pgRecipientId,
        senderId: pgSenderId,
        type: ensureString(mn.type),
        title: ensureString(mn.title),
        message: ensureString(mn.message),
        senderName: ensureString(mn.senderName) || null,
        senderPhoto: ensureString(mn.senderPhoto) || null,
        data: mn.data || {},
        read: mn.read === true,
        createdAt: mn.createdAt || new Date(),
        updatedAt: mn.updatedAt || new Date(),
      },
    });
  });
  console.log(`✅ Migrated notifications.`);

  // 11. Migrate Email Verifications
  console.log("✉️ Migrating Email Verifications...");
  const mongoVerifications = await MongoEmailVerification.find({}).lean();
  await batchProcess(mongoVerifications, 10, async (mv) => {
    await prisma.emailVerification.create({
      data: {
        email: ensureString(mv.email),
        code: ensureString(mv.code),
        expiresAt: mv.expiresAt || new Date(),
        createdAt: mv.createdAt || new Date(),
        updatedAt: mv.updatedAt || new Date(),
      }
    });
  });
  console.log(`✅ Migrated email verifications.`);

  // 12. Migrate Content Management Admin
  console.log("⚙️ Migrating Content Admin Settings...");
  const mongoContent = await MongoContentAdmin.find({}).lean();
  await batchProcess(mongoContent, 10, async (mc) => {
    await prisma.contentAdmin.create({
      data: {
        key: ensureString(mc.key),
        value: ensureString(mc.value) || "",
        updatedAt: mc.updatedAt || new Date()
      }
    });
  });
  console.log(`✅ Migrated content admin settings.`);

  // 13. Migrate Password Logs
  console.log("🔑 Migrating Password Logs...");
  const mongoLogs = await MongoPwLog.find({}).lean();
  await batchProcess(mongoLogs, 10, async (ml) => {
    const pgAdminId = userIdMap[String(ml.adminId)] || null;
    await prisma.pwLog.create({
      data: {
        adminId: pgAdminId,
        adminEmail: ensureString(ml.adminEmail) || null,
        changedAt: ml.changedAt || new Date(),
        note: ensureString(ml.note) || "Password updated by admin"
      }
    });
  });
  console.log(`✅ Migrated password logs.`);

  // 14. Migrate Help Center FAQs
  console.log("ℹ️ Migrating Help Center FAQs...");
  const mongoHelp = await MongoHelpCenter.find({}).lean();
  await batchProcess(mongoHelp, 10, async (mh) => {
    await prisma.helpCenter.create({
      data: {
        question: ensureString(mh.question) || "",
        answer: ensureString(mh.answer) || "",
        createdAt: mh.createdAt || new Date(),
        updatedAt: mh.updatedAt || new Date()
      }
    });
  });
  console.log(`✅ Migrated help center FAQs.`);

  // 15. Migrate Guides (Community)
  console.log("📖 Migrating Guides (Community)...");
  const mongoGuides = await MongoGuide.find({}).lean();
  await batchProcess(mongoGuides, 10, async (mg) => {
    await prisma.guide.create({
      data: {
        title: ensureString(mg.title),
        category: ensureString(mg.category) || null,
        readTime: parseIntOrNull(mg.readTime),
        description: ensureString(mg.description) || null,
        keyPoints: Array.isArray(mg.keyPoints) ? mg.keyPoints.map(k => String(k)) : [],
        content: ensureString(mg.content) || null,
        officialWebsites: ensureString(mg.officialWebsites) || null,
        communityDiscussions: ensureString(mg.communityDiscussions) || null,
        author: ensureString(mg.author) || "German Bharatham Team",
        date: ensureString(mg.date) || new Date().toDateString(),
        createdAt: mg.createdAt || new Date(),
        updatedAt: mg.updatedAt || new Date()
      }
    });
  });
  console.log(`✅ Migrated guides.`);

  // 16. Migrate Categories
  console.log("📂 Migrating Categories...");
  const mongoCategories = await MongoCategory.find({}).lean();
  await batchProcess(mongoCategories, 10, async (mc) => {
    const pc = await prisma.category.create({
      data: {
        name: ensureString(mc.name),
        description: ensureString(mc.description) || "",
        icon: ensureString(mc.icon) || "📋",
        status: ensureString(mc.status) || "active",
        createdAt: mc.createdAt || new Date(),
        updatedAt: mc.updatedAt || new Date()
      }
    });
    categoryIdMap[String(mc._id)] = pc.id;
  });
  console.log(`✅ Migrated categories.`);

  // 17. Migrate Generic Listings
  console.log("📄 Migrating Generic Listings...");
  const mongoGeneric = await MongoGenericListing.find({}).lean();
  const validGeneric = mongoGeneric.filter(mg => categoryIdMap[String(mg.categoryId)]);
  await batchProcess(validGeneric, 10, async (mg) => {
    const pgCategoryId = categoryIdMap[String(mg.categoryId)];
    await prisma.genericListing.create({
      data: {
        categoryId: pgCategoryId,
        categoryName: ensureString(mg.categoryName),
        title: ensureString(mg.title),
        description: ensureString(mg.description) || "",
        contactPhone: ensureString(mg.contactPhone) || "",
        city: ensureString(mg.city) || "",
        area: ensureString(mg.area) || "",
        images: Array.isArray(mg.images) ? mg.images.map(img => String(img)) : [],
        status: ensureString(mg.status) || "active",
        createdAt: mg.createdAt || new Date(),
        updatedAt: mg.updatedAt || new Date()
      }
    });
  });
  console.log(`✅ Migrated generic listings.`);

  console.log("🏁 Migration complete! Closing database connections.");
  await mongoose.disconnect();
  console.log("🔒 Disconnected from MongoDB.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Fatal error during migration:", err);
  process.exit(1);
});
