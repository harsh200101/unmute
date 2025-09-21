const express = require('express');
const { query, param, body } = require('express-validator');
const db = require('../config/database');
const auth = require('../middleware/auth');
const { optionalAuth, rateLimit } = require('../middleware/auth');
const mentorController = require('../controllers/mentorController');

const router = express.Router();

// Enhanced validation middleware for mentor queries
const mentorQueryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  
  query('sort')
    .optional()
    .isIn(['rating', 'price-low', 'price-high', 'popular', 'newest', 'featured'])
    .withMessage('Invalid sort option'),
  
  query('languages')
    .optional()
    .custom((value) => {
      const langs = value.split(',').filter(Boolean);
      if (langs.length > 5) {
        throw new Error('Maximum 5 languages allowed');
      }
      return true;
    }),
  
  query('minPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum price must be a positive number'),
  
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum price must be a positive number'),
  
  query('minRating')
    .optional()
    .isFloat({ min: 1, max: 5 })
    .withMessage('Minimum rating must be between 1 and 5'),
  
  query('badgeLevel')
    .optional()
    .isIn(['bronze', 'silver', 'gold', 'platinum', 'diamond'])
    .withMessage('Invalid badge level'),
  
  query('instantBooking')
    .optional()
    .isBoolean()
    .withMessage('Instant booking must be a boolean'),
  
  query('featured')
    .optional()
    .isBoolean()
    .withMessage('Featured must be a boolean')
];

// GET /api/mentors - Enhanced version with comprehensive filtering
router.get('/',
  rateLimit(100, 15 * 60 * 1000), // 100 requests per 15 minutes
  optionalAuth, // Optional authentication to personalize results
  mentorQueryValidation,
  mentorController.getActiveMentors
);

// GET /api/mentors/featured - Get featured mentors
router.get('/featured',
  rateLimit(50, 15 * 60 * 1000),
  optionalAuth,
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('Limit must be between 1 and 20')
  ],
  async (req, res) => {
    try {
      const { limit = 10 } = req.query;

      console.log('🔍 Fetching featured mentors');

      // Fixed query - bio column is in users table, not mentors
      const query = `
        SELECT
          m.id,
          u.bio,  -- Fixed: bio is in users table
          m.specializations,
          m.hourly_rate,
          m.years_experience,
          m.profile_image,
          m.average_rating,
          m.total_reviews,
          m.languages,
          m.badge_level,
          u.first_name,
          u.last_name,
          u.avatar_url
        FROM mentors m
        INNER JOIN users u ON m.user_id = u.id
        WHERE m.status = 'active'
          AND m.verification_status = 'verified'
          AND u.is_verified = true
          AND (m.is_featured = true OR m.is_top_mentor = true)
        ORDER BY m.is_featured DESC, m.is_top_mentor DESC, m.average_rating DESC
        LIMIT $1
      `;

      const result = await db.query(query, [parseInt(limit)]);

      // If no mentors found in database, return empty array instead of error
      if (result.rows.length === 0) {
        return res.json({
          success: true,
          data: {
            mentors: []
          }
        });
      }

      const mentors = result.rows.map(mentor => ({
        id: mentor.id,
        firstName: mentor.first_name,
        lastName: mentor.last_name,
        fullName: `${mentor.first_name} ${mentor.last_name}`.trim(),
        avatarUrl: mentor.avatar_url || mentor.profile_image,
        bio: mentor.bio,
        specializations: mentor.specializations || [],
        categories: [], // Simplified - no categories for now
        languages: mentor.languages || ['en'],
        hourlyRate: parseFloat(mentor.hourly_rate || 0),
        yearsExperience: mentor.years_experience || 0,
        averageRating: parseFloat(mentor.average_rating || 0),
        totalReviews: mentor.total_reviews || 0,
        sessionCount: 0, // Simplified - no session count for now
        badgeLevel: mentor.badge_level || 'bronze'
      }));

      res.json({
        success: true,
        data: {
          mentors
        }
      });

    } catch (error) {
      console.error('❌ Error fetching featured mentors:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch featured mentors',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/mentors/profile - Get current mentor's profile (must be before :mentorId route)
router.get('/profile',
  auth,
  rateLimit(100, 15 * 60 * 1000), // 100 requests per 15 minutes
  async (req, res) => {
    try {
      const userId = req.user.userId;

      console.log('🔍 Fetching mentor profile for user:', userId);

      const query = `
        SELECT
          m.*,
          u.first_name,
          u.last_name,
          u.email,
          u.avatar_url,
          u.bio,
          u.location,
          u.social_links,
          COALESCE(AVG(r.overall_rating), 0) as calculated_rating,
          COUNT(DISTINCT r.id) as total_reviews,
          COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'completed') as completed_sessions,
          ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as categories,
          ARRAY_AGG(DISTINCT et.name) FILTER (WHERE et.name IS NOT NULL) as expertise
        FROM mentors m
        INNER JOIN users u ON m.user_id = u.id
        LEFT JOIN mentor_categories mc ON m.id = mc.mentor_id
        LEFT JOIN categories c ON mc.category_id = c.id
        LEFT JOIN reviews r ON m.id = r.mentor_id AND r.is_hidden = false
        LEFT JOIN sessions s ON m.id = s.mentor_id
        LEFT JOIN mentor_expertise me ON m.id = me.mentor_id
        LEFT JOIN expertise_tags et ON me.tag_id = et.id
        WHERE m.user_id = $1
        GROUP BY m.id, u.id
      `;

      const result = await db.query(query, [userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Mentor profile not found',
          code: 'MENTOR_NOT_FOUND'
        });
      }

      const mentor = result.rows[0];

      // Calculate profile completion percentage
      let completionScore = 0;
      const totalFields = 10;

      if (mentor.bio && mentor.bio.length > 50) completionScore++;
      if (mentor.specializations && mentor.specializations.length > 0) completionScore++;
      if (mentor.hourly_rate && mentor.hourly_rate > 0) completionScore++;
      if (mentor.years_experience && mentor.years_experience > 0) completionScore++;
      if (mentor.languages && mentor.languages.length > 0) completionScore++;
      if (mentor.profile_image) completionScore++;
      if (mentor.video_intro_url) completionScore++;
      if (mentor.portfolio_urls && mentor.portfolio_urls.length > 0) completionScore++;
      if (mentor.location && Object.keys(mentor.location).length > 0) completionScore++;
      if (mentor.timezone) completionScore++;

      const profileCompletionPercentage = Math.round((completionScore / totalFields) * 100);

      const mentorProfile = {
        id: mentor.id,
        userId: mentor.user_id,
        firstName: mentor.first_name,
        lastName: mentor.last_name,
        email: mentor.email,
        avatarUrl: mentor.avatar_url,
        bio: mentor.bio,
        location: mentor.location || {},
        socialLinks: mentor.social_links || {},

        // Professional Info
        specializations: mentor.specializations || [],
        industries: mentor.industries || [],
        skills: mentor.skills || [],
        languages: mentor.languages || [],
        hourlyRate: parseFloat(mentor.hourly_rate || 0),
        currency: mentor.currency || 'USD',
        yearsExperience: mentor.years_experience || 0,

        // Media
        profileImage: mentor.profile_image,
        videoIntroUrl: mentor.video_intro_url,
        portfolioUrls: mentor.portfolio_urls || [],

        // Status
        status: mentor.status,
        verificationStatus: mentor.verification_status,
        isVerified: mentor.verification_status === 'verified',
        isFeatured: mentor.is_featured || false,
        badgeLevel: mentor.badge_level || 'bronze',

        // Statistics
        totalSessions: mentor.total_sessions || 0,
        completedSessions: parseInt(mentor.completed_sessions || 0),
        averageRating: parseFloat(mentor.average_rating || mentor.calculated_rating || 0),
        totalReviews: parseInt(mentor.total_reviews || 0),
        totalEarnings: parseFloat(mentor.total_earnings || 0),

        // Settings
        timezone: mentor.timezone || 'UTC',
        instantBooking: mentor.instant_booking || false,
        autoAcceptBookings: mentor.auto_accept_bookings || false,
        advanceBookingDays: mentor.advance_booking_days || 30,
        minSessionDuration: mentor.min_session_duration || 30,
        maxSessionDuration: mentor.max_session_duration || 120,
        sessionBufferMinutes: mentor.session_buffer_minutes || 15,

        // Additional data
        categories: mentor.categories || [],
        expertise: mentor.expertise || [],
        profileCompletionPercentage,
        lastActive: mentor.last_active,
        createdAt: mentor.created_at,
        updatedAt: mentor.updated_at
      };

      console.log('✅ Mentor profile retrieved for user:', userId);

      res.json({
        success: true,
        data: {
          mentor: mentorProfile
        }
      });

    } catch (error) {
      console.error('❌ Error fetching mentor profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch mentor profile',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/mentors/stats - Get mentor statistics for dashboard (must be before :mentorId route)
router.get('/stats',
  auth,
  rateLimit(20, 15 * 60 * 1000), // 20 requests per 15 minutes
  async (req, res) => {
    try {
      const userId = req.user.userId;

      console.log('🔍 Fetching mentor stats for user:', userId);

      // Get mentor ID first
      const mentorQuery = 'SELECT id FROM mentors WHERE user_id = $1';
      const mentorResult = await db.query(mentorQuery, [userId]);

      if (mentorResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Mentor profile not found',
          code: 'MENTOR_NOT_FOUND'
        });
      }

      const mentorId = mentorResult.rows[0].id;

      // Get comprehensive stats
      const statsQuery = `
        SELECT
          COUNT(*) FILTER (WHERE s.status IN ('scheduled', 'confirmed')) as upcoming_sessions,
          COUNT(*) FILTER (WHERE s.status = 'completed') as total_sessions,
          COUNT(*) FILTER (WHERE s.status = 'completed' AND DATE_TRUNC('month', s.scheduled_at) = DATE_TRUNC('month', CURRENT_DATE)) as sessions_this_month,
          COUNT(*) FILTER (WHERE s.status LIKE 'cancelled%') as cancelled_sessions,
          ROUND(AVG(CASE WHEN s.status = 'completed' THEN s.duration_minutes END), 2) as avg_session_duration,
          ROUND(AVG(r.overall_rating), 2) as average_rating,
          COUNT(DISTINCT r.id) as total_reviews,
          ROUND(AVG(CASE WHEN s.status = 'completed' THEN EXTRACT(EPOCH FROM (s.actual_end_time - s.actual_start_time))/60 END), 2) as avg_actual_duration,
          COUNT(*) FILTER (WHERE s.status = 'completed' AND s.scheduled_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') as sessions_last_24h,
          SUM(CASE WHEN s.status = 'completed' THEN s.mentor_earnings ELSE 0 END) as total_earnings
        FROM sessions s
        LEFT JOIN reviews r ON s.id = r.session_id AND r.is_hidden = false
        WHERE s.mentor_id = $1
      `;

      const statsResult = await db.query(statsQuery, [mentorId]);
      const stats = statsResult.rows[0];

      // Calculate response rate (simplified - would need messages table)
      const responseRate = 95; // Placeholder - would calculate from actual data

      // Calculate response time (simplified)
      const responseTime = 2.5; // Placeholder - would calculate from actual data

      const mentorStats = {
        totalSessions: parseInt(stats.total_sessions || 0),
        upcomingSessions: parseInt(stats.upcoming_sessions || 0),
        sessionsThisMonth: parseInt(stats.sessions_this_month || 0),
        cancelledSessions: parseInt(stats.cancelled_sessions || 0),
        averageRating: parseFloat(stats.average_rating || 0),
        totalReviews: parseInt(stats.total_reviews || 0),
        averageSessionDuration: parseFloat(stats.avg_session_duration || 60),
        responseRate,
        responseTime,
        sessionsLast24h: parseInt(stats.sessions_last_24h || 0),
        totalEarnings: parseFloat(stats.total_earnings || 0)
      };

      console.log('✅ Mentor stats retrieved for user:', userId);

      res.json({
        success: true,
        data: mentorStats
      });

    } catch (error) {
      console.error('❌ Error fetching mentor stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch mentor statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/mentors/earnings - Get detailed mentor earnings
router.get('/earnings',
  auth,
  rateLimit(20, 15 * 60 * 1000), // 20 requests per 15 minutes
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { period = 'all', page = 1, limit = 20 } = req.query;

      console.log('🔍 Fetching detailed earnings for mentor:', userId);

      // Get mentor ID first
      const mentorQuery = 'SELECT id FROM mentors WHERE user_id = $1';
      const mentorResult = await db.query(mentorQuery, [userId]);

      if (mentorResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Mentor profile not found',
          code: 'MENTOR_NOT_FOUND'
        });
      }

      const mentorId = mentorResult.rows[0].id;

      // Build query based on period
      let dateFilter = '';
      const params = [mentorId];
      let paramCount = 1;

      if (period === 'month') {
        paramCount++;
        dateFilter = ` AND DATE_TRUNC('month', s.scheduled_at) = DATE_TRUNC('month', CURRENT_DATE)`;
      } else if (period === 'year') {
        paramCount++;
        dateFilter = ` AND DATE_TRUNC('year', s.scheduled_at) = DATE_TRUNC('year', CURRENT_DATE)`;
      }

      // Get earnings transactions
      const earningsQuery = `
        SELECT
          s.id as session_id,
          s.title,
          s.scheduled_at,
          s.duration_minutes,
          s.mentor_earnings,
          s.status,
          u.first_name as mentee_first_name,
          u.last_name as mentee_last_name,
          s.actual_start_time,
          s.actual_end_time
        FROM sessions s
        JOIN users u ON s.mentee_id = u.id
        WHERE s.mentor_id = $1
          AND s.status = 'completed'
          ${dateFilter}
        ORDER BY s.scheduled_at DESC
      `;

      // Pagination
      const offset = (page - 1) * limit;
      paramCount++;
      const paginatedQuery = earningsQuery + ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));

      paramCount++;
      const finalQuery = paginatedQuery + ` OFFSET $${paramCount}`;
      params.push(offset);

      const result = await db.query(finalQuery, params);

      // Get total count and sum
      const summaryQuery = `
        SELECT
          COUNT(*) as total_sessions,
          SUM(mentor_earnings) as total_earnings,
          AVG(mentor_earnings) as avg_earnings
        FROM sessions
        WHERE mentor_id = $1
          AND status = 'completed'
          ${dateFilter}
      `;

      const summaryResult = await db.query(summaryQuery, [mentorId]);
      const summary = summaryResult.rows[0];

      // Format earnings data
      const earnings = result.rows.map(earning => ({
        sessionId: earning.session_id,
        title: earning.title,
        scheduledAt: earning.scheduled_at,
        duration: earning.duration_minutes,
        earnings: parseFloat(earning.mentor_earnings || 0),
        status: earning.status,
        mentee: {
          firstName: earning.mentee_first_name,
          lastName: earning.mentee_last_name
        },
        actualStartTime: earning.actual_start_time,
        actualEndTime: earning.actual_end_time
      }));

      res.json({
        success: true,
        data: {
          earnings,
          summary: {
            totalSessions: parseInt(summary.total_sessions || 0),
            totalEarnings: parseFloat(summary.total_earnings || 0),
            averageEarnings: parseFloat(summary.avg_earnings || 0),
            period
          },
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(parseInt(summary.total_sessions || 0) / limit),
            totalItems: parseInt(summary.total_sessions || 0),
            limit: parseInt(limit)
          }
        }
      });

    } catch (error) {
      console.error('❌ Error fetching mentor earnings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch earnings',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/mentors/availability - Get current mentor's availability
router.get('/availability',
  auth,
  rateLimit(500, 15 * 60 * 1000), // Increased to 500 for better UX
  async (req, res) => {
    try {
      const userId = req.user.userId;

      console.log('🔍 Fetching mentor availability for user:', userId);

      // Get mentor ID first
      const mentorQuery = 'SELECT id FROM mentors WHERE user_id = $1';
      const mentorResult = await db.query(mentorQuery, [userId]);

      if (mentorResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Mentor profile not found',
          code: 'MENTOR_NOT_FOUND'
        });
      }

      const mentorId = mentorResult.rows[0].id;

      // Get availability slots
      const availabilityQuery = `
        SELECT
          id,
          day_of_week,
          start_time,
          end_time,
          specific_date,
          is_available,
          slot_duration_minutes,
          notes,
          created_at,
          updated_at
        FROM mentor_availability
        WHERE mentor_id = $1
        ORDER BY
          CASE WHEN specific_date IS NOT NULL THEN 0 ELSE 1 END,
          specific_date,
          day_of_week,
          start_time
      `;

      const availabilityResult = await db.query(availabilityQuery, [mentorId]);

      // Format availability data
      const availability = availabilityResult.rows.map(slot => ({
        id: slot.id,
        dayOfWeek: slot.day_of_week,
        startTime: slot.start_time,
        endTime: slot.end_time,
        specificDate: slot.specific_date,
        isAvailable: slot.is_available,
        slotDurationMinutes: slot.slot_duration_minutes,
        notes: slot.notes,
        createdAt: slot.created_at,
        updatedAt: slot.updated_at
      }));

      console.log('✅ Mentor availability retrieved for user:', userId, '(', availability.length, 'slots)');

      res.json({
        success: true,
        data: {
          availability,
          mentorId: mentorId
        }
      });

    } catch (error) {
      console.error('❌ Error fetching mentor availability:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch availability',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/mentors/:mentorId - Get single mentor profile (must be after specific routes)
router.get('/:mentorId',
  rateLimit(50, 15 * 60 * 1000), // 50 requests per 15 minutes
  optionalAuth,
  [
    param('mentorId')
      .isInt({ min: 1 })
      .withMessage('Invalid mentor ID')
  ],
  mentorController.getMentorProfile
);

// GET /api/mentors/:mentorId/availability - Get mentor availability
router.get('/:mentorId/availability',
  rateLimit(500, 15 * 60 * 1000), // Increased to 500 for better UX
  optionalAuth,
  [
    param('mentorId')
      .isInt({ min: 1 })
      .withMessage('Invalid mentor ID'),

    query('date')
      .optional()
      .isISO8601()
      .withMessage('Invalid date format'),

    query('timezone')
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage('Invalid timezone')
  ],
  async (req, res) => {
    try {
      const { mentorId } = req.params;
      const { date, timezone = 'UTC' } = req.query;

      console.log('🔍 Fetching mentor availability:', { mentorId, date, timezone });

      // Enhanced error logging - Check if mentor exists first
      console.log('🔍 Step 1: Checking if mentor exists...');
      const mentorCheck = await db.query(
        'SELECT id, min_session_duration, max_session_duration, session_buffer_minutes, advance_booking_days, instant_booking, timezone FROM mentors WHERE id = $1 AND status = $2 AND verification_status = $3',
        [mentorId, 'active', 'verified']
      );

      console.log('🔍 Step 1 Result:', mentorCheck.rows.length, 'mentors found');

      if (mentorCheck.rows.length === 0) {
        console.log('❌ Mentor not found:', mentorId);
        return res.status(404).json({
          success: false,
          message: 'Mentor not found',
          code: 'MENTOR_NOT_FOUND'
        });
      }

      const mentorSettings = mentorCheck.rows[0];
      console.log('✅ Mentor found:', mentorSettings);

      // Check if mentor_availability table has any data
      console.log('🔍 Step 2: Checking mentor_availability table...');
      const availabilityCountCheck = await db.query(
        'SELECT COUNT(*) as count FROM mentor_availability WHERE mentor_id = $1',
        [mentorId]
      );
      
      console.log('🔍 Step 2 Result: Mentor', mentorId, 'has', availabilityCountCheck.rows[0].count, 'availability slots');

      // Get mentor's availability schedule - FIXED QUERY
      console.log('🔍 Step 3: Fetching availability data...');
      let availabilityQuery = `
        SELECT 
          day_of_week,
          start_time,
          end_time,
          specific_date,
          is_available,
          slot_duration_minutes,
          notes
        FROM mentor_availability
        WHERE mentor_id = $1
      `;

      const params = [mentorId];

      if (date) {
        // FIXED: Calculate day of week in JavaScript to avoid parameter conflict
        const dateObj = new Date(date);
        const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday, etc.
        availabilityQuery += ` AND (specific_date = $2 OR day_of_week = $3)`;
        params.push(date, dayOfWeek);
      }

      availabilityQuery += ` ORDER BY day_of_week, start_time`;

      console.log('🔍 Step 3: Executing query:', availabilityQuery);
      console.log('🔍 Step 3: With params:', params);

      const availabilityResult = await db.query(availabilityQuery, params);
      console.log('🔍 Step 3 Result:', availabilityResult.rows.length, 'availability slots found');

      // Get existing bookings
      console.log('🔍 Step 4: Fetching existing bookings...');
      const bookingsQuery = `
        SELECT scheduled_at, duration_minutes
        FROM sessions
        WHERE mentor_id = $1
          AND status IN ('scheduled', 'confirmed', 'in_progress')
          AND scheduled_at >= CURRENT_TIMESTAMP
        ORDER BY scheduled_at
      `;

      const bookingsResult = await db.query(bookingsQuery, [mentorId]);
      console.log('🔍 Step 4 Result:', bookingsResult.rows.length, 'existing bookings found');

      const existingBookings = bookingsResult.rows.map(booking => ({
        scheduledAt: booking.scheduled_at,
        duration: booking.duration_minutes
      }));

      // Return success response (even if no availability found)
      console.log('✅ Returning availability data for mentor', mentorId);
      res.json({
        success: true,
        data: {
          mentorId: parseInt(mentorId),
          availability: availabilityResult.rows, // Can be empty array
          existingBookings,
          mentorSettings: {
            minSessionDuration: mentorSettings.min_session_duration || 30,
            maxSessionDuration: mentorSettings.max_session_duration || 120,
            sessionBufferMinutes: mentorSettings.session_buffer_minutes || 15,
            advanceBookingDays: mentorSettings.advance_booking_days || 30,
            instantBooking: mentorSettings.instant_booking || false,
            timezone: mentorSettings.timezone || 'UTC'
          }
        }
      });

    } catch (error) {
      console.error('❌ DETAILED ERROR in availability route:');
      console.error('❌ Error message:', error.message);
      console.error('❌ Error code:', error.code);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ Full error object:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to fetch availability',
        error: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          code: error.code,
          stack: error.stack
        } : 'Internal server error'
      });
    }
  }
);


// GET /api/mentors/:mentorId/reviews - Get mentor reviews
router.get('/:mentorId/reviews',
  rateLimit(50, 15 * 60 * 1000),
  optionalAuth,
  [
    param('mentorId')
      .isInt({ min: 1 })
      .withMessage('Invalid mentor ID'),
    
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('Limit must be between 1 and 20'),
    
    query('rating')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('Rating filter must be between 1 and 5')
  ],
  async (req, res) => {
    try {
      const { mentorId } = req.params;
      const { page = 1, limit = 10, rating } = req.query;

      console.log('🔍 Fetching mentor reviews:', { mentorId, page, limit, rating });

      let query = `
        SELECT 
          r.id,
          r.overall_rating,
          r.communication_rating,
          r.knowledge_rating,
          r.helpfulness_rating,
          r.comment,
          r.created_at,
          r.is_featured,
          r.helpful_votes,
          r.mentor_response,
          r.mentor_response_at,
          u.first_name as mentee_first_name,
          u.last_name as mentee_last_name,
          u.avatar_url as mentee_avatar,
          s.title as session_title,
          s.duration_minutes as session_duration
        FROM reviews r
        JOIN users u ON r.mentee_id = u.id
        LEFT JOIN sessions s ON r.session_id = s.id
        WHERE r.mentor_id = $1
          AND r.is_hidden = false
      `;

      const params = [mentorId];
      let paramCount = 1;

      if (rating) {
        paramCount++;
        query += ` AND r.overall_rating = $${paramCount}`;
        params.push(rating);
      }

      query += ` ORDER BY r.is_featured DESC, r.created_at DESC`;

      // Pagination
      const offset = (page - 1) * limit;
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
      
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(offset);

      const result = await db.query(query, params);

      // Get total count
      let countQuery = `
        SELECT COUNT(*) as total
        FROM reviews r
        WHERE r.mentor_id = $1 AND r.is_hidden = false
      `;

      const countParams = [mentorId];

      if (rating) {
        countQuery += ` AND r.overall_rating = $2`;
        countParams.push(rating);
      }

      const countResult = await db.query(countQuery, countParams);
      const totalReviews = parseInt(countResult.rows[0].total);

      // Format reviews
      const reviews = result.rows.map(review => ({
        id: review.id,
        rating: {
          overall: review.overall_rating,
          communication: review.communication_rating,
          knowledge: review.knowledge_rating,
          helpfulness: review.helpfulness_rating
        },
        comment: review.comment,
        createdAt: review.created_at,
        isFeatured: review.is_featured,
        helpfulVotes: review.helpful_votes,
        mentorResponse: review.mentor_response,
        mentorResponseAt: review.mentor_response_at,
        mentee: {
          firstName: review.mentee_first_name,
          lastName: review.mentee_last_name,
          avatar: review.mentee_avatar
        },
        session: {
          title: review.session_title,
          duration: review.session_duration
        }
      }));

      res.json({
        success: true,
        data: {
          reviews,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalReviews / limit),
            totalReviews,
            limit: parseInt(limit)
          }
        }
      });

    } catch (error) {
      console.error('❌ Error fetching mentor reviews:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch reviews',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/mentors/categories - Get all mentor categories
router.get('/meta/categories',
  rateLimit(20, 60 * 60 * 1000), // 20 requests per hour (rarely changes)
  async (req, res) => {
    try {
      console.log('🔍 Fetching mentor categories');

      const query = `
        SELECT 
          c.id,
          c.name,
          c.slug,
          c.description,
          c.icon_url,
          c.color_hex,
          c.sort_order,
          COUNT(mc.mentor_id) as mentor_count
        FROM categories c
        LEFT JOIN mentor_categories mc ON c.id = mc.category_id
        LEFT JOIN mentors m ON mc.mentor_id = m.id AND m.status = 'active' AND m.verification_status = 'verified'
        WHERE c.is_active = true
        GROUP BY c.id
        ORDER BY c.sort_order, c.name
      `;

      const result = await db.query(query);

      const categories = result.rows.map(category => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        iconUrl: category.icon_url,
        colorHex: category.color_hex,
        sortOrder: category.sort_order,
        mentorCount: parseInt(category.mentor_count || 0)
      }));

      res.json({
        success: true,
        data: {
          categories
        }
      });

    } catch (error) {
      console.error('❌ Error fetching categories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch categories',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/mentors/meta/languages - Get all available languages
router.get('/meta/languages',
  rateLimit(20, 60 * 60 * 1000), // 20 requests per hour
  async (req, res) => {
    try {
      console.log('🔍 Fetching mentor languages');

      const query = `
        SELECT 
          UNNEST(languages) as language_code,
          COUNT(*) as mentor_count
        FROM mentors m
        JOIN users u ON m.user_id = u.id
        WHERE m.status = 'active' 
          AND m.verification_status = 'verified'
          AND u.is_verified = true
        GROUP BY language_code
        ORDER BY mentor_count DESC, language_code
      `;

      const result = await db.query(query);

      // Language mapping (you might want to store this in database)
      const languageMap = {
        'en': { name: 'English', flag: '🇺🇸' },
        'es': { name: 'Spanish', flag: '🇪🇸' },
        'fr': { name: 'French', flag: '🇫🇷' },
        'hi': { name: 'Hindi', flag: '🇮🇳' },
        'zh': { name: 'Chinese', flag: '🇨🇳' },
        'de': { name: 'German', flag: '🇩🇪' },
        'ja': { name: 'Japanese', flag: '🇯🇵' },
        'ko': { name: 'Korean', flag: '🇰🇷' },
        'pt': { name: 'Portuguese', flag: '🇵🇹' },
        'ar': { name: 'Arabic', flag: '🇸🇦' },
      };

      const languages = result.rows.map(row => ({
        code: row.language_code,
        name: languageMap[row.language_code]?.name || row.language_code,
        flag: languageMap[row.language_code]?.flag || '🌐',
        mentorCount: parseInt(row.mentor_count)
      }));

      res.json({
        success: true,
        data: {
          languages
        }
      });

    } catch (error) {
      console.error('❌ Error fetching languages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch languages',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// PUT /api/mentors/profile - Update mentor profile
router.put('/profile',
  auth,
  rateLimit(10, 15 * 60 * 1000), // 10 updates per 15 minutes
  [
    body('bio').optional().isLength({ min: 50, max: 1000 }).withMessage('Bio must be between 50 and 1000 characters'),
    body('years_experience').optional().isInt({ min: 0, max: 50 }).withMessage('Years of experience must be between 0 and 50'),
    body('hourly_rate').optional().isFloat({ min: 10, max: 500 }).withMessage('Hourly rate must be between $10 and $500'),
    body('min_session_duration').optional().isInt({ min: 15, max: 60 }).withMessage('Minimum session duration must be between 15 and 60 minutes'),
    body('max_session_duration').optional().isInt({ min: 60, max: 480 }).withMessage('Maximum session duration must be between 1 and 8 hours'),
    body('timezone').optional().isLength({ min: 1, max: 50 }).withMessage('Invalid timezone'),
    body('specializations').optional().isArray().withMessage('Specializations must be an array'),
    body('categories').optional().isArray().withMessage('Categories must be an array'),
    body('languages').optional().isArray().withMessage('Languages must be an array')
  ],
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const updates = req.body;

      console.log('🔄 Updating mentor profile for user:', userId);

      // Get mentor ID first
      const mentorQuery = 'SELECT id FROM mentors WHERE user_id = $1';
      const mentorResult = await db.query(mentorQuery, [userId]);

      if (mentorResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Mentor profile not found',
          code: 'MENTOR_NOT_FOUND'
        });
      }

      const mentorId = mentorResult.rows[0].id;

      // Build update query dynamically
      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;

      // Map frontend field names to database column names
      const fieldMapping = {
        bio: 'bio',
        years_experience: 'years_experience',
        current_role: 'current_role',
        current_company: 'current_company',
        hourly_rate: 'hourly_rate',
        min_session_duration: 'min_session_duration',
        max_session_duration: 'max_session_duration',
        session_buffer_minutes: 'session_buffer_minutes',
        advance_booking_days: 'advance_booking_days',
        timezone: 'timezone',
        instant_booking: 'instant_booking',
        specializations: 'specializations',
        languages: 'languages'
      };

      Object.keys(updates).forEach(key => {
        if (fieldMapping[key] && updates[key] !== undefined) {
          updateFields.push(`${fieldMapping[key]} = $${paramCount}`);
          updateValues.push(updates[key]);
          paramCount++;
        }
      });

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update',
          code: 'NO_UPDATES'
        });
      }

      // Add updated_at timestamp
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(mentorId); // Add mentor ID at the end

      const updateQuery = `
        UPDATE mentors
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const updateResult = await db.query(updateQuery, updateValues);

      if (updateResult.rows.length === 0) {
        throw new Error('UPDATE_FAILED');
      }

      // Update categories if provided
      if (updates.categories && Array.isArray(updates.categories)) {
        // Delete existing categories
        await db.query('DELETE FROM mentor_categories WHERE mentor_id = $1', [mentorId]);

        // Insert new categories
        if (updates.categories.length > 0) {
          const categoryValues = updates.categories.map(catId => `(${mentorId}, ${catId})`).join(', ');
          await db.query(`
            INSERT INTO mentor_categories (mentor_id, category_id)
            VALUES ${categoryValues}
            ON CONFLICT DO NOTHING
          `);
        }
      }

      // Update expertise if provided
      if (updates.expertise && Array.isArray(updates.expertise)) {
        // Delete existing expertise
        await db.query('DELETE FROM mentor_expertise WHERE mentor_id = $1', [mentorId]);

        // Insert new expertise
        if (updates.expertise.length > 0) {
          for (const expertise of updates.expertise) {
            if (expertise.tag_id && expertise.proficiency_level) {
              await db.query(`
                INSERT INTO mentor_expertise (mentor_id, tag_id, proficiency_level)
                VALUES ($1, $2, $3)
                ON CONFLICT DO NOTHING
              `, [mentorId, expertise.tag_id, expertise.proficiency_level]);
            }
          }
        }
      }

      console.log('✅ Mentor profile updated for user:', userId);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          mentor: updateResult.rows[0]
        }
      });

    } catch (error) {
      console.error('❌ Error updating mentor profile:', error);

      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'Some data conflicts with existing records',
          code: 'CONFLICT'
        });
      }

      if (error.code === '23514') {
        return res.status(422).json({
          success: false,
          message: 'Invalid data provided',
          code: 'VALIDATION_ERROR'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update profile',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);


// GET /api/mentors/earnings/summary - Get mentor earnings summary
router.get('/earnings/summary',
  auth,
  rateLimit(20, 15 * 60 * 1000), // 20 requests per 15 minutes
  async (req, res) => {
    try {
      const userId = req.user.userId;

      console.log('🔍 Fetching earnings summary for mentor:', userId);

      // Get mentor ID first
      const mentorQuery = 'SELECT id FROM mentors WHERE user_id = $1';
      const mentorResult = await db.query(mentorQuery, [userId]);

      if (mentorResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Mentor profile not found',
          code: 'MENTOR_NOT_FOUND'
        });
      }

      const mentorId = mentorResult.rows[0].id;

      // Get earnings data
      const earningsQuery = `
        SELECT
          SUM(CASE WHEN s.status = 'completed' AND DATE_TRUNC('month', s.scheduled_at) = DATE_TRUNC('month', CURRENT_DATE) THEN s.mentor_earnings ELSE 0 END) as this_month,
          SUM(CASE WHEN s.status = 'completed' AND DATE_TRUNC('month', s.scheduled_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') THEN s.mentor_earnings ELSE 0 END) as last_month,
          SUM(CASE WHEN s.status = 'completed' THEN s.mentor_earnings ELSE 0 END) as total_earnings,
          COUNT(CASE WHEN s.status = 'completed' AND DATE_TRUNC('month', s.scheduled_at) = DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as sessions_this_month,
          COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as total_sessions
        FROM sessions s
        WHERE s.mentor_id = $1
      `;

      const earningsResult = await db.query(earningsQuery, [mentorId]);
      const earnings = earningsResult.rows[0];

      // Calculate growth percentage
      const thisMonth = parseFloat(earnings.this_month || 0);
      const lastMonth = parseFloat(earnings.last_month || 0);
      const growth = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;

      const earningsSummary = {
        thisMonth,
        lastMonth,
        totalEarnings: parseFloat(earnings.total_earnings || 0),
        sessionsThisMonth: parseInt(earnings.sessions_this_month || 0),
        totalSessions: parseInt(earnings.total_sessions || 0),
        growth: Math.round(growth * 100) / 100, // Round to 2 decimal places
        currency: 'USD'
      };

      console.log('✅ Earnings summary retrieved for mentor:', userId);

      res.json({
        success: true,
        data: earningsSummary
      });

    } catch (error) {
      console.error('❌ Error fetching earnings summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch earnings summary',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);



// GET /api/mentors/meta/stats - Get mentor statistics (public stats)
router.get('/meta/stats',
  rateLimit(10, 60 * 60 * 1000), // 10 requests per hour
  async (req, res) => {
    try {
      console.log('🔍 Fetching mentor statistics');

      const statsQuery = `
        SELECT
          COUNT(*) as total_mentors,
          COUNT(*) FILTER (WHERE is_featured = true) as featured_mentors,
          COUNT(*) FILTER (WHERE badge_level = 'platinum') as platinum_mentors,
          COUNT(*) FILTER (WHERE badge_level = 'gold') as gold_mentors,
          COUNT(*) FILTER (WHERE instant_booking = true) as instant_booking_mentors,
          AVG(hourly_rate) as avg_hourly_rate,
          MIN(hourly_rate) as min_hourly_rate,
          MAX(hourly_rate) as max_hourly_rate,
          AVG(average_rating) as avg_rating,
          SUM(total_sessions) as total_sessions,
          COUNT(DISTINCT UNNEST(languages)) as unique_languages,
          COUNT(DISTINCT UNNEST(specializations)) as unique_specializations
        FROM mentors m
        JOIN users u ON m.user_id = u.id
        WHERE m.status = 'active'
          AND m.verification_status = 'verified'
          AND u.is_verified = true
      `;

      const result = await db.query(statsQuery);
      const stats = result.rows[0];

      res.json({
        success: true,
        data: {
          totalMentors: parseInt(stats.total_mentors),
          featuredMentors: parseInt(stats.featured_mentors),
          platinumMentors: parseInt(stats.platinum_mentors),
          goldMentors: parseInt(stats.gold_mentors),
          instantBookingMentors: parseInt(stats.instant_booking_mentors),
          pricing: {
            average: parseFloat(stats.avg_hourly_rate || 0),
            minimum: parseFloat(stats.min_hourly_rate || 0),
            maximum: parseFloat(stats.max_hourly_rate || 0)
          },
          averageRating: parseFloat(stats.avg_rating || 0),
          totalSessions: parseInt(stats.total_sessions || 0),
          uniqueLanguages: parseInt(stats.unique_languages || 0),
          uniqueSpecializations: parseInt(stats.unique_specializations || 0)
        }
      });

    } catch (error) {
      console.error('❌ Error fetching mentor stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// PUT /api/mentors/availability - Update mentor availability
router.put('/availability',
  auth,
  rateLimit(100, 15 * 60 * 1000), // Increased to 100 for better UX
  [
    body('availability')
      .isArray({ min: 0, max: 100 })
      .withMessage('Availability must be an array with max 100 slots'),
    body('availability.*.dayOfWeek')
      .optional()
      .isInt({ min: 0, max: 6 })
      .withMessage('Day of week must be 0-6 (Sunday=0)'),
    body('availability.*.startTime')
      .isString()
      .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('Start time must be in HH:MM format'),
    body('availability.*.endTime')
      .isString()
      .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('End time must be in HH:MM format'),
    body('availability.*.isAvailable')
      .isBoolean()
      .withMessage('isAvailable must be a boolean'),
    body('availability.*.slotDurationMinutes')
      .optional()
      .isInt({ min: 15, max: 480 })
      .withMessage('Slot duration must be between 15 and 480 minutes'),
    body('availability.*.notes')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Notes must be less than 500 characters'),
    body('availability.*.specificDate')
      .optional()
      .isISO8601()
      .withMessage('Specific date must be a valid ISO date')
  ],
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { availability } = req.body;

      console.log('🔄 Updating mentor availability for user:', userId, 'with', availability?.length || 0, 'slots');

      // Get mentor ID first
      const mentorQuery = 'SELECT id FROM mentors WHERE user_id = $1';
      const mentorResult = await db.query(mentorQuery, [userId]);

      if (mentorResult.rows.length === 0) {
        console.log('❌ Mentor not found for user:', userId);
        return res.status(404).json({
          success: false,
          message: 'Mentor profile not found',
          code: 'MENTOR_NOT_FOUND'
        });
      }

      const mentorId = mentorResult.rows[0].id;
      console.log('✅ Found mentor ID:', mentorId);

      // Start transaction
      await db.query('BEGIN');
      console.log('🔄 Started transaction');

      try {
        // Delete existing availability
        const deleteResult = await db.query('DELETE FROM mentor_availability WHERE mentor_id = $1', [mentorId]);
        console.log('🗑️ Deleted', deleteResult.rowCount, 'existing availability slots');

        // Insert new availability slots
        if (availability && availability.length > 0) {
          const insertQuery = `
            INSERT INTO mentor_availability (
              mentor_id, day_of_week, start_time, end_time,
              is_available, slot_duration_minutes, notes, specific_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `;

          console.log('📝 Inserting', availability.length, 'new slots');

          for (let i = 0; i < availability.length; i++) {
            const slot = availability[i];
            console.log(`📝 Inserting slot ${i + 1}:`, {
              dayOfWeek: slot.dayOfWeek,
              startTime: slot.startTime,
              endTime: slot.endTime,
              isAvailable: slot.isAvailable,
              slotDurationMinutes: slot.slotDurationMinutes,
              notes: slot.notes
            });

            try {
              await db.query(insertQuery, [
                mentorId,
                slot.dayOfWeek !== undefined ? slot.dayOfWeek : null,
                slot.startTime,
                slot.endTime,
                slot.isAvailable !== undefined ? slot.isAvailable : true,
                slot.slotDurationMinutes || 60,
                slot.notes || null,
                slot.specificDate || null
              ]);
              console.log(`✅ Inserted slot ${i + 1}`);
            } catch (insertError) {
              console.error(`❌ Failed to insert slot ${i + 1}:`, insertError);
              throw insertError;
            }
          }
        }

        await db.query('COMMIT');
        console.log('✅ Transaction committed');

        console.log('✅ Mentor availability updated for user:', userId);

        res.json({
          success: true,
          message: 'Availability updated successfully',
          data: {
            slotsUpdated: availability ? availability.length : 0
          }
        });

      } catch (error) {
        console.error('❌ Transaction error, rolling back:', error);
        await db.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error('❌ Error updating mentor availability:', {
        message: error.message,
        code: error.code,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });

      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'Some availability slots conflict with existing data',
          code: 'CONFLICT'
        });
      }

      if (error.code === '23514') {
        let specificMessage = 'Invalid availability data provided';
        if (error.message.includes('valid_time_range')) {
          specificMessage = 'Invalid time range: start time must be before end time, and day of week or specific date must be provided';
        }
        return res.status(422).json({
          success: false,
          message: specificMessage,
          code: 'VALIDATION_ERROR',
          details: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update availability',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/mentors/reviews - Get mentor's own reviews
router.get('/reviews',
  auth,
  rateLimit(20, 15 * 60 * 1000), // 20 requests per 15 minutes
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 10 } = req.query;

      console.log('🔍 Fetching mentor reviews for user:', userId);

      // Get mentor ID first
      const mentorQuery = 'SELECT id FROM mentors WHERE user_id = $1';
      const mentorResult = await db.query(mentorQuery, [userId]);

      if (mentorResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Mentor profile not found',
          code: 'MENTOR_NOT_FOUND'
        });
      }

      const mentorId = mentorResult.rows[0].id;

      let query = `
        SELECT
          r.id,
          r.overall_rating,
          r.communication_rating,
          r.knowledge_rating,
          r.helpfulness_rating,
          r.comment,
          r.created_at,
          r.is_featured,
          r.helpful_votes,
          r.mentor_response,
          r.mentor_response_at,
          u.first_name as mentee_first_name,
          u.last_name as mentee_last_name,
          u.avatar_url as mentee_avatar,
          s.title as session_title,
          s.duration_minutes as session_duration
        FROM reviews r
        JOIN users u ON r.mentee_id = u.id
        LEFT JOIN sessions s ON r.session_id = s.id
        WHERE r.mentor_id = $1
          AND r.is_hidden = false
      `;

      const params = [mentorId];
      let paramCount = 1;

      query += ` ORDER BY r.is_featured DESC, r.created_at DESC`;

      // Pagination
      const offset = (page - 1) * limit;
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));

      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(offset);

      const result = await db.query(query, params);

      // Get total count
      let countQuery = `
        SELECT COUNT(*) as total
        FROM reviews r
        WHERE r.mentor_id = $1 AND r.is_hidden = false
      `;

      const countResult = await db.query(countQuery, [mentorId]);
      const totalReviews = parseInt(countResult.rows[0].total);

      // Format reviews
      const reviews = result.rows.map(review => ({
        id: review.id,
        rating: {
          overall: review.overall_rating,
          communication: review.communication_rating,
          knowledge: review.knowledge_rating,
          helpfulness: review.helpfulness_rating
        },
        comment: review.comment,
        createdAt: review.created_at,
        isFeatured: review.is_featured,
        helpfulVotes: review.helpful_votes,
        mentorResponse: review.mentor_response,
        mentorResponseAt: review.mentor_response_at,
        mentee: {
          firstName: review.mentee_first_name,
          lastName: review.mentee_last_name,
          avatar: review.mentee_avatar
        },
        session: {
          title: review.session_title,
          duration: review.session_duration
        }
      }));

      res.json({
        success: true,
        data: {
          reviews,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalReviews / limit),
            totalReviews,
            limit: parseInt(limit)
          }
        }
      });

    } catch (error) {
      console.error('❌ Error fetching mentor reviews:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch reviews',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Mentors API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;
