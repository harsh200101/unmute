const express = require('express');
const { query, param } = require('express-validator');
const db = require('../config/database');
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

// GET /api/mentors/:mentorId - Get single mentor profile
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
  rateLimit(30, 15 * 60 * 1000),
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

// GET /api/mentors/stats - Get mentor statistics
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
