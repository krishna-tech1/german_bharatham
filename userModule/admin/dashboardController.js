const prisma = require("../../config/prisma");

// Helper function to format time ago
function formatTimeAgo(date) {
  if (!date) return 'just now';
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

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getDashboardStats called at ${new Date().toISOString()}`);
  try {
    const countStart = Date.now();
    const [accommodationCount, foodCount, jobCount, serviceCount, userCount] = await Promise.all([
      prisma.accommodation.count(),
      prisma.foodGrocery.count(),
      prisma.jobListing.count(),
      prisma.service.count(),
      prisma.user.count({ where: { role: "user" } })
    ]);
    console.log(`✅ [DB RESULT] counted all documents in ${Date.now() - countStart}ms`);

    const totalListings = accommodationCount + foodCount + jobCount + serviceCount;
    const totalCategories = 4; // Accommodation, Food, Services, Jobs

    const pendingFilter = {
      OR: [
        { status: { equals: 'pending', mode: 'insensitive' } },
        { status: null }
      ]
    };

    console.log(`🔍 [DB QUERY] counting pending documents from all collections`);
    const pendingStart = Date.now();
    const [
      pendingAccommodations,
      pendingFood,
      pendingJobs,
      pendingServices,
      pendingCustomListings
    ] = await Promise.all([
      prisma.accommodation.count({ where: pendingFilter }),
      prisma.foodGrocery.count({ where: pendingFilter }),
      prisma.jobListing.count({ where: pendingFilter }),
      prisma.service.count({ where: pendingFilter }),
      prisma.genericListing.count({ where: pendingFilter })
    ]);

    const totalPending = pendingAccommodations + pendingFood + pendingJobs + pendingServices + pendingCustomListings;
    console.log(`✅ [DB RESULT] counted pending documents in ${Date.now() - pendingStart}ms, total pending: ${totalPending}`);

    // Get recent listings
    console.log(`🔍 [DB QUERY] fetching recent listings from all collections`);
    const recentStart = Date.now();
    const [recentAccommodations, recentFood, recentJobs, recentServices, recentCustomListings] = await Promise.all([
      prisma.accommodation.findMany({ orderBy: { createdAt: 'desc' }, take: 2 }),
      prisma.foodGrocery.findMany({ orderBy: { createdAt: 'desc' }, take: 2 }),
      prisma.jobListing.findMany({ orderBy: { createdAt: 'desc' }, take: 2 }),
      prisma.service.findMany({ orderBy: { createdAt: 'desc' }, take: 2 }),
      prisma.genericListing.findMany({ orderBy: { createdAt: 'desc' }, take: 4 })
    ]);
    console.log(`✅ [DB RESULT] fetched recent listings in ${Date.now() - recentStart}ms`);

    // Format recent listings
    const recentListings = [
      ...recentAccommodations.map(item => ({
        title: item.title,
        category: 'Accommodation',
        status: item.status || 'Active',
        createdAt: item.createdAt,
        added: formatTimeAgo(item.createdAt)
      })),
      ...recentFood.map(item => ({
        title: item.title,
        category: 'Food',
        status: item.status || 'Active',
        createdAt: item.createdAt,
        added: formatTimeAgo(item.createdAt)
      })),
      ...recentJobs.map(item => ({
        title: item.title,
        category: 'Job',
        status: item.status || 'Active',
        createdAt: item.createdAt,
        added: formatTimeAgo(item.createdAt)
      })),
      ...recentServices.map(item => ({
        title: item.title || item.serviceName || 'Untitled',
        category: 'Services',
        status: item.status || 'Active',
        createdAt: item.createdAt,
        added: formatTimeAgo(item.createdAt)
      })),
      ...recentCustomListings.map(item => ({
        title: item.title || 'Untitled',
        category: item.categoryName || 'Custom',
        status: item.status || 'Active',
        createdAt: item.createdAt,
        added: formatTimeAgo(item.createdAt)
      }))
    ];

    // Sort by creation date and take top 6
    recentListings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const topRecentListings = recentListings.slice(0, 6);

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
    res.status(500).json({ message: err.message });
  }
};

// Get all listings from all categories (unified view)
exports.getAllListings = async (req, res) => {
  try {
    console.log('getAllListings called with query:', req.query);
    const { category, status, search, sort = 'newest', page = 1, limit = 50 } = req.query;
    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(200, parseInt(limit) || 50);

    const normaliseStatus = (s) => {
      if (s === 'inactive') return 'disabled';
      return s;
    };

    // Filters
    const statusQueryVal = status && status !== 'All Listings' ? normaliseStatus(status) : null;
    
    // Sort logic
    const sortField = sort === 'oldest' ? 'asc' : 'desc';

    // Helper queries
    const getAccommodations = async () => {
      if (category && category !== 'All Listings' && category.toLowerCase() !== 'accommodation') return [];
      const where = {};
      if (statusQueryVal) where.status = { equals: statusQueryVal, mode: 'insensitive' };
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } }
        ];
      }
      return prisma.accommodation.findMany({
        where,
        orderBy: { createdAt: sortField },
        select: { id: true, title: true, city: true, status: true, createdAt: true }
      });
    };

    const getFoods = async () => {
      if (category && category !== 'All Listings' && category.toLowerCase() !== 'food') return [];
      const where = {};
      if (statusQueryVal) where.status = { equals: statusQueryVal, mode: 'insensitive' };
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } }
        ];
      }
      return prisma.foodGrocery.findMany({
        where,
        orderBy: { createdAt: sortField },
        select: { id: true, title: true, city: true, status: true, createdAt: true }
      });
    };

    const getJobs = async () => {
      if (category && category !== 'All Listings' && category.toLowerCase() !== 'job') return [];
      const where = {};
      if (statusQueryVal) where.status = { equals: statusQueryVal, mode: 'insensitive' };
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } }
        ];
      }
      return prisma.jobListing.findMany({
        where,
        orderBy: { createdAt: sortField },
        select: { id: true, title: true, location: true, status: true, createdAt: true }
      });
    };

    const getServices = async () => {
      if (category && category !== 'All Listings' && category.toLowerCase() !== 'services') return [];
      const where = {};
      if (statusQueryVal) where.status = { equals: statusQueryVal, mode: 'insensitive' };
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { serviceName: { contains: search, mode: 'insensitive' } }
        ];
      }
      return prisma.service.findMany({
        where,
        orderBy: { createdAt: sortField },
        select: { id: true, title: true, serviceName: true, city: true, status: true, createdAt: true }
      });
    };

    const [accommodations, foods, jobs, services] = await Promise.all([
      getAccommodations(),
      getFoods(),
      getJobs(),
      getServices()
    ]);

    // Format all listings
    const allListings = [
      ...accommodations.map(item => ({
        _id: String(item.id),
        title: item.title,
        category: 'Accommodation',
        location: item.city || '',
        status: item.status || 'Active',
        created: item.createdAt,
        sourceCollection: 'accommodations'
      })),
      ...foods.map(item => ({
        _id: String(item.id),
        title: item.title,
        category: 'Food',
        location: item.city || '',
        status: item.status || 'Active',
        created: item.createdAt,
        sourceCollection: 'foodgrocery'
      })),
      ...jobs.map(item => ({
        _id: String(item.id),
        title: item.title,
        category: 'Job',
        location: item.location || '',
        status: item.status || 'Active',
        created: item.createdAt,
        sourceCollection: 'jobs'
      })),
      ...services.map(item => ({
        _id: String(item.id),
        title: item.title || item.serviceName || 'Untitled Service',
        category: 'Services',
        location: item.city || '',
        status: item.status || 'Active',
        created: item.createdAt,
        sourceCollection: 'services'
      }))
    ];

    // Sort by created
    if (sort === 'newest') {
      allListings.sort((a, b) => new Date(b.created) - new Date(a.created));
    } else if (sort === 'oldest') {
      allListings.sort((a, b) => new Date(a.created) - new Date(b.created));
    } else {
      allListings.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    }

    const paginatedListings = allListings.slice(skip, skip + Math.min(200, parseInt(limit) || 50));
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
      prisma.accommodation.count(),
      prisma.foodGrocery.count(),
      prisma.service.count(),
      prisma.jobListing.count()
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
