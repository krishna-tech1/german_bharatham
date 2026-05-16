const Accommodation = require("../../accommodationModule/accomodation");
const FoodGrocery = require("../../foodGroceryModule/admin/model/FoodGrocery");
const Job = require("../../jobsModule/admin/model/Job");
const Service = require("../../servicesModule/admin/model/Service");
const User = require("../user/models/User");
const GenericListing = require("../../categoryModule/GenericListing");

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getDashboardStats called at ${new Date().toISOString()}`);
  try {
    // Count total listings from all categories
    console.log(`🔍 [DB QUERY] counting documents from all collections`);
    const countStart = Date.now();
    const [accommodationCount, foodCount, jobCount, serviceCount, userCount] = await Promise.all([
      Accommodation.countDocuments(),
      FoodGrocery.countDocuments(),
      Job.countDocuments(),
      Service.countDocuments(),
      User.countDocuments({ role: "user" })
    ]);
    console.log(`✅ [DB RESULT] counted all documents in ${Date.now() - countStart}ms: accommodation=${accommodationCount}, food=${foodCount}, job=${jobCount}, service=${serviceCount}, users=${userCount}`);

    const totalListings = accommodationCount + foodCount + jobCount + serviceCount;
    const totalCategories = 4; // Accommodation, Food, Services, Jobs

        // Get pending reviews count.
        // Be more inclusive: match any status containing "pending" (case-insensitive),
        // and also treat documents with missing/null status as pending (data-cleanup safe-guard).
        const pendingFilter = { $or: [ { status: { $regex: /pending/i } }, { status: { $exists: false } }, { status: null } ] };
        console.log(`🔍 [DB QUERY] counting pending documents from all collections`);
        const pendingStart = Date.now();
        const pendingReviews = await Promise.all([
      Accommodation.countDocuments(pendingFilter),
      FoodGrocery.countDocuments(pendingFilter),
      Job.countDocuments(pendingFilter),
      Service.countDocuments(pendingFilter),
      GenericListing.countDocuments(pendingFilter)
        ]);
    console.log(`✅ [DB RESULT] counted pending documents in ${Date.now() - pendingStart}ms, total pending: ${pendingReviews.reduce((sum, count) => sum + count, 0)}`);
    const totalPending = pendingReviews.reduce((sum, count) => sum + count, 0);

    // Get recent listings (last 6 from all categories)
    // Use field projection to fetch only needed fields for massive performance boost
    console.log(`🔍 [DB QUERY] fetching recent listings from all collections with field projection`);
    const recentStart = Date.now();
    const [recentAccommodations, recentFood, recentJobs, recentServices, recentCustomListings] = await Promise.all([
      Accommodation.find().sort({ createdAt: -1 }).limit(2).select('title status createdAt').lean(),
      FoodGrocery.find().sort({ createdAt: -1 }).limit(2).select('title status createdAt').lean(),
      Job.find().sort({ createdAt: -1 }).limit(2).select('title status createdAt').lean(),
      Service.find().sort({ createdAt: -1 }).limit(2).select('title status createdAt').lean(),
      GenericListing.find().sort({ createdAt: -1 }).limit(4).select('title categoryName category status createdAt').lean()
    ]);
    console.log(`✅ [DB RESULT] fetched recent listings in ${Date.now() - recentStart}ms with field projection reducing data transfer`);

    // Format recent listings
    const recentListings = [
      ...recentAccommodations.map(item => ({
        title: item.title,
        category: 'Accommodation',
        status: item.status || 'Active',
        added: formatTimeAgo(item.createdAt)
      })),
      ...recentFood.map(item => ({
        title: item.title,
        category: 'Food',
        status: item.status || 'Active',
        added: formatTimeAgo(item.createdAt)
      })),
      ...recentJobs.map(item => ({
        title: item.title,
        category: 'Job',
        status: item.status || 'Active',
        added: formatTimeAgo(item.createdAt)
      })),
      ...recentServices.map(item => ({
        title: item.title,
        category: 'Services',
        status: item.status || 'Active',
        createdAt: item.createdAt,
        added: formatTimeAgo(item.createdAt)
      })),
      ...recentCustomListings.map(item => ({
        title: item.title || 'Untitled',
        category: item.categoryName || item.category || 'Custom',
        status: item.status || 'Active',
        createdAt: item.createdAt,
        added: formatTimeAgo(item.createdAt)
      }))
    ];

    // Sort by creation date and take top 6
    recentListings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const topRecentListings = recentListings.slice(0, 6);

    console.log(`📤 [RESPONSE] sending 200 response with dashboard stats after ${Date.now() - start}ms`);
    res.json({
      stats: {
        totalListings,
        totalCategories,
        totalUsers: userCount,
        pendingReviews: totalPending
      },
      categoryStats: [
        { name: 'Accommodation', count: accommodationCount, icon: '🏠' },
        { name: 'Food', count: foodCount, icon: '🍴' },
        { name: 'Services', count: serviceCount, icon: '🔧' },
        { name: 'Jobs', count: jobCount, icon: '💼' }
      ],
      recentListings: topRecentListings
    });
  } catch (err) {
    console.error(`❌ [ERROR] getDashboardStats failed: ${err.message} after ${Date.now() - start}ms`);
    console.error('Dashboard stats error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get all listings from all categories (unified view)
exports.getAllListings = async (req, res) => {
  try {
    console.log('getAllListings called with query:', req.query);
    const { category, status, search, sort = 'newest', page = 1, limit = 50 } = req.query;
    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(200, parseInt(limit) || 50);

    // Build filters for database level filtering
    const statusFilter = status && status !== 'All Listings' ? { status: status === 'inactive' ? 'disabled' : status } : {};
    const searchFilter = search ? { title: { $regex: search, $options: 'i' } } : {};

    // Fetch from all collections with field projection and server-side filtering/sorting
    const sortObj = sort === 'newest' ? { createdAt: -1 } : sort === 'oldest' ? { createdAt: 1 } : { title: 1 };
    const fieldProjection = '_id title city status createdAt location address';
    
    let [accommodations, foods, jobs, services] = await Promise.all([
      category && category !== 'All Listings' && category.toLowerCase() !== 'accommodation' ? Promise.resolve([]) : 
        Accommodation.find(searchFilter).where({ ...statusFilter }).sort(sortObj).select(fieldProjection).lean(),
      category && category !== 'All Listings' && category.toLowerCase() !== 'food' ? Promise.resolve([]) : 
        FoodGrocery.find(searchFilter).where({ ...statusFilter }).sort(sortObj).select(fieldProjection).lean(),
      category && category !== 'All Listings' && category.toLowerCase() !== 'job' ? Promise.resolve([]) : 
        Job.find(searchFilter).where({ ...statusFilter }).sort(sortObj).select(fieldProjection).lean(),
      category && category !== 'All Listings' && category.toLowerCase() !== 'services' ? Promise.resolve([]) : 
        Service.find(searchFilter).where({ ...statusFilter }).sort(sortObj).select(fieldProjection).lean()
    ]);

    console.log('Data fetched from DB with field projection:');
    console.log('- Accommodations:', accommodations.length);
    console.log('- Foods:', foods.length);
    console.log('- Jobs:', jobs.length);
    console.log('- Services:', services.length);

    // Format all listings with consistent structure
    const allListings = [
      ...accommodations.map(item => ({
        _id: item._id,
        title: item.title,
        category: 'Accommodation',
        location: item.location || `${item.city}, ${item.address}`,
        status: item.status || 'Active',
        created: item.createdAt,
        sourceCollection: 'accommodations'
      })),
      ...foods.map(item => ({
        _id: item._id,
        title: item.title,
        category: 'Food',
        location: item.location || `${item.city}, ${item.address}`,
        status: item.status || 'Active',
        created: item.createdAt,
        sourceCollection: 'foodgrocery'
      })),
      ...jobs.map(item => ({
        _id: item._id,
        title: item.title,
        category: 'Job',
        location: item.location || `${item.city}`,
        status: item.status || 'Active',
        created: item.createdAt,
        sourceCollection: 'jobs'
      })),
      ...services.map(item => ({
        _id: item._id,
        title: item.title,
        category: 'Services',
        location: item.location || `${item.city}, ${item.address || ''}`,
        status: item.status || 'Active',
        created: item.createdAt,
        sourceCollection: 'services'
      }))
    ];

    console.log('Total listings combined:', allListings.length);

    // Apply pagination to combined results
    const paginatedListings = allListings.slice(skip, skip + Math.min(200, parseInt(limit) || 50));

    console.log('Returning', paginatedListings.length, 'listings after pagination (page', page, ')');
    res.json({ data: paginatedListings, total: allListings.length });
  } catch (err) {
    console.error('Get all listings error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get category details with listing counts
exports.getCategoryStats = async (req, res) => {
  try {
    const [accommodationCount, foodCount, serviceCount, jobCount] = await Promise.all([
      Accommodation.countDocuments(),
      FoodGrocery.countDocuments(),
      Service.countDocuments(),
      Job.countDocuments()
    ]);

    const categories = [
      {
        name: 'Accommodation',
        listings: `${accommodationCount} listings`,
        description: 'Housing, apartments, student housing, and shared accommodations',
        status: 'Active',
        icon: '🏠',
        count: accommodationCount
      },
      {
        name: 'Food',
        listings: `${foodCount} listings`,
        description: 'Indian grocery stores, restaurants, and food delivery services',
        status: 'Active',
        icon: '🍴',
        count: foodCount
      },
      {
        name: 'Services',
        listings: `${serviceCount} listings`,
        description: 'Immigration, legal, financial, and consultation services',
        status: 'Active',
        icon: '🔧',
        count: serviceCount
      },
      {
        name: 'Jobs',
        listings: `${jobCount} listings`,
        description: 'Job listings, career opportunities, and employment services',
        status: 'Active',
        icon: '💼',
        count: jobCount
      }
    ];

    res.json(categories);
  } catch (err) {
    console.error('Get category stats error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Helper function to format time ago
function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
  }
  
  return 'just now';
}
