const db = require('../config/database');
const { validationResult } = require('express-validator');

// Format mentor response data with comprehensive information
const formatMentorResponse = (mentor) => {
  return {
    id: mentor.id,
    userId: mentor.user_id,
    
    // User Information
    firstName: mentor.first_name,
    lastName: mentor.last_name,
    fullName: `${mentor.first_name} ${mentor.last_name}`.trim(),
    email: mentor.email,
    avatarUrl: mentor.avatar_url || mentor.profile_image,
    bio: mentor.user_bio || mentor.bio,
    
    // Professional Information
    specializations: mentor.specializations || [],
    industries: mentor.industries || [],
    skills: mentor.skills || [],
    languages: mentor.languages || ['en'],
    categories: mentor.categories || [],
    expertise: mentor.expertise || [],
    
    // Pricing & Experience
    hourlyRate: parseFloat(mentor.hourly_rate || 0),
    currency: mentor.currency || 'INR',
    yearsExperience: mentor.years_experience || 0,
    
    // Media
    profileImage: mentor.profile_image,
    videoIntroUrl: mentor.video_intro_url,
    portfolioUrls: mentor.portfolio_urls || [],
    
    // Status & Verification
    status: mentor.status,
    verificationStatus: mentor.verification_status,
    isVerified: mentor.is_verified,
    
    // Statistics
    totalSessions: mentor.total_sessions || 0,
    completedSessions: mentor.completed_sessions || mentor.session_count || 0,
    averageRating: parseFloat(mentor.calculated_rating || 0),
    totalReviews: mentor.total_reviews || mentor.review_count || 0,
    totalEarnings: parseFloat(mentor.calculated_earnings || mentor.total_earnings || 0),
    
    // Availability & Settings
    timezone: mentor.timezone || 'Asia/Calcutta',
    instantBooking: mentor.instant_booking || false,
    autoAcceptBookings: mentor.auto_accept_bookings || false,
    advanceBookingDays: mentor.advance_booking_days || 30,
    minSessionDuration: mentor.min_session_duration || 30,
    maxSessionDuration: mentor.max_session_duration || 120,
    sessionBufferMinutes: mentor.session_buffer_minutes || 15,
    
    // Quality Metrics
    responseRate: parseFloat(mentor.response_rate || 100),
    responseTimeHours: mentor.response_time_hours || 24,
    cancellationRate: parseFloat(mentor.cancellation_rate || 0),
    
    // Recognition
    badgeLevel: mentor.badge_level || 'bronze',
    isFeatured: mentor.is_featured || false,
    isTopMentor: mentor.is_top_mentor || false,
    
    // Training & Compliance
    completedTraining: mentor.completed_training || false,
    backgroundCheckStatus: mentor.background_check_status || 'pending',
    
    // Timestamps
    lastActive: mentor.last_active,
    profileCompletionPercentage: mentor.profile_completion_percentage || 0,
    createdAt: mentor.created_at,
    updatedAt: mentor.updated_at,
    verifiedAt: mentor.verified_at
  };
};

// Get all active mentors with advanced filtering and pagination
exports.getActiveMentors = async (req, res) => {
  const startTime = Date.now();
  console.log('🚀 Starting getActiveMentors at', new Date().toISOString());

  try {
    const {
      page = 1,
      limit = 12,
      sort = 'rating',
      languages,
      category,
      search,
      minPrice,
      maxPrice,
      minRating,
      badgeLevel,
      instantBooking,
      featured
    } = req.query;

    console.log('🔍 Fetching active mentors with filters:', {
      page, limit, sort, languages, category, search
    });

    let query = `
      SELECT
        m.*,
        u.first_name,
        u.last_name,
        u.email,
        u.avatar_url,
        u.bio as user_bio,
        u.is_verified,
        COALESCE(AVG(r.overall_rating), 0) as calculated_rating,
        COUNT(DISTINCT r.id) as review_count,
        COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'completed') as session_count,
        COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.mentor_earnings ELSE 0 END), 0) as calculated_earnings,
        ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as categories,
        ARRAY_AGG(DISTINCT et.name) FILTER (WHERE et.name IS NOT NULL) as expertise_tags
      FROM mentors m
      INNER JOIN users u ON m.user_id = u.id
      LEFT JOIN mentor_categories mc ON m.id = mc.mentor_id
      LEFT JOIN categories c ON mc.category_id = c.id
      LEFT JOIN reviews r ON m.id = r.mentor_id AND r.is_hidden = false AND r.reviewer_type = 'mentee'
      LEFT JOIN sessions s ON m.id = s.mentor_id
      LEFT JOIN mentor_expertise me ON m.id = me.mentor_id
      LEFT JOIN expertise_tags et ON me.tag_id = et.id
      WHERE m.status = 'active'
        AND m.verification_status = 'verified'
        AND u.is_active = true
        AND u.is_verified = true
    `;

    const params = [parseFloat(minRating || 0)];
    let paramCount = 1;

    // Language filter
    if (languages) {
      const langArray = languages.split(',').filter(Boolean);
      if (langArray.length > 0) {
        paramCount++;
        query += ` AND m.languages && $${paramCount}`;
        params.push(langArray);
      }
    }

    // Category filter
    if (category) {
      paramCount++;
      query += ` AND EXISTS (
        SELECT 1 FROM mentor_categories mc2 
        JOIN categories c2 ON mc2.category_id = c2.id 
        WHERE mc2.mentor_id = m.id AND (c2.name ILIKE $${paramCount} OR c2.slug ILIKE $${paramCount})
      )`;
      params.push(`%${category}%`);
    }

    // Search filter
    if (search) {
      paramCount++;
      query += ` AND (
        LOWER(u.first_name || ' ' || u.last_name) LIKE LOWER($${paramCount}) OR
        LOWER(m.specializations::text) LIKE LOWER($${paramCount}) OR
        LOWER(m.industries::text) LIKE LOWER($${paramCount}) OR
        LOWER(m.skills::text) LIKE LOWER($${paramCount})
      )`;
      params.push(`%${search}%`);
    }

    // Price range filters
    if (minPrice) {
      paramCount++;
      query += ` AND m.hourly_rate >= $${paramCount}`;
      params.push(parseFloat(minPrice));
    }

    if (maxPrice) {
      paramCount++;
      query += ` AND m.hourly_rate <= $${paramCount}`;
      params.push(parseFloat(maxPrice));
    }

    // Rating filter (moved to HAVING clause)

    // Badge level filter
    if (badgeLevel) {
      paramCount++;
      query += ` AND m.badge_level = $${paramCount}`;
      params.push(badgeLevel);
    }

    // Instant booking filter
    if (instantBooking === 'true') {
      query += ` AND m.instant_booking = true`;
    }

    // Featured filter
    if (featured === 'true') {
      query += ` AND m.is_featured = true`;
    }

    query += ` GROUP BY m.id, u.id`;

    // HAVING clause for minimum rating filter
    query += ` HAVING COALESCE(AVG(r.overall_rating) FILTER (WHERE r.reviewer_type = 'mentee'), 0) >= $1`;

    // Sorting
    switch (sort) {
      case 'rating':
        query += ` ORDER BY GREATEST(COALESCE(m.average_rating, 0), COALESCE(AVG(r.overall_rating), 0)) DESC, COUNT(DISTINCT r.id) DESC`;
        break;
      case 'price-low':
        query += ` ORDER BY m.hourly_rate ASC`;
        break;
      case 'price-high':
        query += ` ORDER BY m.hourly_rate DESC`;
        break;
      case 'popular':
        query += ` ORDER BY COUNT(DISTINCT s.id) DESC, GREATEST(COALESCE(m.average_rating, 0), COALESCE(AVG(r.overall_rating), 0)) DESC`;
        break;
      case 'newest':
        query += ` ORDER BY m.created_at DESC`;
        break;
      case 'featured':
        query += ` ORDER BY m.is_featured DESC, m.is_top_mentor DESC, GREATEST(COALESCE(m.average_rating, 0), COALESCE(AVG(r.overall_rating), 0)) DESC`;
        break;
      default:
        query += ` ORDER BY GREATEST(COALESCE(m.average_rating, 0), COALESCE(AVG(r.overall_rating), 0)) DESC`;
    }

    // Pagination
    const offset = (page - 1) * limit;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    console.log('🔍 Executing mentor query with params:', params.length);
    console.time('Main mentor query execution');

    const result = await db.query(query, params);

    console.timeEnd('Main mentor query execution');
    console.log(`📊 Main query returned ${result.rows.length} rows`);

    // If no mentors found in database, return empty array instead of error
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          mentors: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalMentors: 0,
            limit: parseInt(limit),
            hasNextPage: false,
            hasPreviousPage: false
          },
          filters: {
            sort,
            languages: languages ? languages.split(',') : [],
            category,
            search,
            minPrice,
            maxPrice,
            minRating,
            badgeLevel,
            instantBooking,
            featured
          }
        }
      });
    }

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(DISTINCT m.id) as total
      FROM mentors m
      INNER JOIN users u ON m.user_id = u.id
      LEFT JOIN reviews r ON m.id = r.mentor_id AND r.is_hidden = false AND r.reviewer_type = 'mentee'
      WHERE m.status = 'active'
        AND m.verification_status = 'verified'
        AND u.is_active = true
        AND u.is_verified = true
    `;

    const countParams = [parseFloat(minRating || 0)];
    let countParamCount = 1;

    // Apply same filters for count
    if (languages) {
      const langArray = languages.split(',').filter(Boolean);
      if (langArray.length > 0) {
        countParamCount++;
        countQuery += ` AND m.languages && $${countParamCount}`;
        countParams.push(langArray);
      }
    }

    if (category) {
      countParamCount++;
      countQuery += ` AND EXISTS (
        SELECT 1 FROM mentor_categories mc2
        JOIN categories c2 ON mc2.category_id = c2.id
        WHERE mc2.mentor_id = m.id AND (c2.name ILIKE $${countParamCount} OR c2.slug ILIKE $${countParamCount})
      )`;
      countParams.push(`%${category}%`);
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (
        LOWER(u.first_name || ' ' || u.last_name) LIKE LOWER($${countParamCount}) OR
        LOWER(m.specializations::text) LIKE LOWER($${countParamCount}) OR
        LOWER(m.industries::text) LIKE LOWER($${countParamCount}) OR
        LOWER(m.skills::text) LIKE LOWER($${countParamCount})
      )`;
      countParams.push(`%${search}%`);
    }

    if (minPrice) {
      countParamCount++;
      countQuery += ` AND m.hourly_rate >= $${countParamCount}`;
      countParams.push(parseFloat(minPrice));
    }

    if (maxPrice) {
      countParamCount++;
      countQuery += ` AND m.hourly_rate <= $${countParamCount}`;
      countParams.push(parseFloat(maxPrice));
    }

    countQuery += ` GROUP BY m.id HAVING COALESCE(AVG(r.overall_rating) FILTER (WHERE r.reviewer_type = 'mentee'), 0) >= $1`;

    if (badgeLevel) {
      countParamCount++;
      countQuery += ` AND m.badge_level = $${countParamCount}`;
      countParams.push(badgeLevel);
    }

    if (instantBooking === 'true') {
      countQuery += ` AND m.instant_booking = true`;
    }

    if (featured === 'true') {
      countQuery += ` AND m.is_featured = true`;
    }

    console.time('Count query execution');
    const countResult = await db.query(countQuery, countParams);
    console.timeEnd('Count query execution');
    const totalMentors = parseInt(countResult.rows[0].total);
    console.log(`📊 Count query returned total: ${totalMentors}`);

    // Format mentor data
    console.time('Mentor data formatting');
    const mentors = result.rows.map(mentor => ({
      ...formatMentorResponse(mentor),
      reviewCount: parseInt(mentor.review_count || 0),
      sessionCount: parseInt(mentor.session_count || 0),
      categories: mentor.categories || [],
      expertiseTags: mentor.expertise_tags || []
    }));
    console.timeEnd('Mentor data formatting');

    console.log(`✅ Found ${mentors.length} mentors, total: ${totalMentors}`);
    const totalTime = Date.now() - startTime;
    console.log(`⏱️ Total getActiveMentors execution time: ${totalTime}ms`);

    res.json({
      success: true,
      data: {
        mentors,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalMentors / limit),
          totalMentors,
          limit: parseInt(limit),
          hasNextPage: page < Math.ceil(totalMentors / limit),
          hasPreviousPage: page > 1
        },
        filters: {
          sort,
          languages: languages ? languages.split(',') : [],
          category,
          search,
          minPrice,
          maxPrice,
          minRating,
          badgeLevel,
          instantBooking,
          featured
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching active mentors:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch mentors',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get single mentor profile with comprehensive details
// Get single mentor profile with comprehensive details
// Get single mentor profile with comprehensive details
exports.getMentorProfile = async (req, res) => {
  try {
    const { mentorId } = req.params;

    console.log('🔍 Fetching mentor profile for mentorId:', mentorId, 'Type:', typeof mentorId);

    const query = `
      SELECT 
        m.*,
        u.first_name,
        u.last_name,
        u.email,
        u.avatar_url,
        u.bio as user_bio,
        u.location as user_location,
        u.social_links,
        u.is_verified,
        u.created_at as user_created_at,
        COALESCE(AVG(r.overall_rating), 0) as calculated_rating,
        COUNT(DISTINCT r.id) as review_count,
        COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'completed') as completed_session_count,
        ARRAY_AGG(DISTINCT jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'slug', c.slug,
          'color', c.color_hex,
          'isPrimary', mc.is_primary
        )) FILTER (WHERE c.id IS NOT NULL) as categories,
        ARRAY_AGG(DISTINCT jsonb_build_object(
          'id', et.id,
          'name', et.name,
          'category', et.category,
          'proficiency', me.proficiency_level
        )) FILTER (WHERE et.id IS NOT NULL) as expertise
      FROM mentors m
      INNER JOIN users u ON m.user_id = u.id
      LEFT JOIN mentor_categories mc ON m.id = mc.mentor_id
      LEFT JOIN categories c ON mc.category_id = c.id
      LEFT JOIN reviews r ON m.id = r.mentor_id AND r.is_hidden = false AND r.reviewer_type = 'mentee'
      LEFT JOIN sessions s ON m.id = s.mentor_id
      LEFT JOIN mentor_expertise me ON m.id = me.mentor_id
      LEFT JOIN expertise_tags et ON me.tag_id = et.id
      WHERE m.id = $1
        AND m.status = 'active'
        AND m.verification_status = 'verified'
        AND u.is_active = true
      GROUP BY m.id, u.id
    `;

    const result = await db.query(query, [mentorId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mentor not found or inactive',
        code: 'MENTOR_NOT_FOUND'
      });
    }

    const mentor = result.rows[0];

    // Get recent reviews separately with proper ordering
    const reviewsQuery = `
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'rating', r.overall_rating,
          'comment', r.comment,
          'createdAt', r.created_at,
          'mentee', jsonb_build_object(
            'firstName', u.first_name,
            'lastName', u.last_name,
            'avatar', u.avatar_url
          )
        ) ORDER BY r.created_at DESC
      ) as recent_reviews
      FROM reviews r
      JOIN users u ON r.mentee_id = u.id
      WHERE r.mentor_id = $1
        AND r.is_hidden = false
        AND r.reviewer_type = 'mentee'
      LIMIT 5
    `;

    const reviewsResult = await db.query(reviewsQuery, [mentorId]);

    // Get availability separately with proper ordering  
    const availabilityQuery = `
      SELECT jsonb_agg(
        jsonb_build_object(
          'dayOfWeek', ma.day_of_week,
          'startTime', ma.start_time,
          'endTime', ma.end_time,
          'specificDate', ma.specific_date,
          'isAvailable', ma.is_available,
          'slotDuration', ma.slot_duration_minutes
        ) ORDER BY ma.day_of_week, ma.start_time
      ) as availability_schedule
      FROM mentor_availability ma
      WHERE ma.mentor_id = $1
    `;

    const availabilityResult = await db.query(availabilityQuery, [mentorId]);

    // Format comprehensive mentor profile
    const mentorProfile = {
      ...formatMentorResponse(mentor),
      userBio: mentor.user_bio,
      userLocation: mentor.user_location || {},
      socialLinks: mentor.social_links || {},
      userCreatedAt: mentor.user_created_at,
      averageRating: parseFloat(mentor.calculated_rating || 0),
      reviewCount: parseInt(mentor.review_count || 0),
      completedSessionCount: parseInt(mentor.completed_session_count || 0),
      categories: mentor.categories || [],
      expertise: mentor.expertise || [],
      recentReviews: reviewsResult.rows[0]?.recent_reviews || [],
      availabilitySchedule: availabilityResult.rows[0]?.availability_schedule || []
    };

    console.log('✅ Mentor profile retrieved:', mentor.first_name, mentor.last_name);

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
};


// Register or update mentor profile
exports.registerMentor = async (req, res) => {
  try {
    // Validate request data
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      user_id,
      specializations = [],
      industries = [],
      skills = [],
      languages = ['en'],
      hourly_rate,
      currency = 'INR',
      years_experience = 0,
      profile_image = null,
      video_intro_url = null,
      portfolio_urls = [],
      timezone = 'Asia/Calcutta',
      instant_booking = false,
      auto_accept_bookings = false,
      advance_booking_days = 30,
      min_session_duration = 30,
      max_session_duration = 120,
      session_buffer_minutes = 15,
      categories = [],
      expertise_tags = []
    } = req.body;

    console.log('🔄 Registering/updating mentor for user:', user_id);

    // Use transaction for data consistency
    const result = await db.transaction(async (client) => {
      // Check if mentor already exists
      const existingMentor = await client.query(
        'SELECT id FROM mentors WHERE user_id = $1',
        [user_id]
      );

      let mentor;

      if (existingMentor.rows.length > 0) {
        // Update existing mentor
        const mentorId = existingMentor.rows[0].id;

        const updateQuery = `
          UPDATE mentors SET
            specializations = $2,
            industries = $3,
            skills = $4,
            languages = $5,
            hourly_rate = $6,
            currency = $7,
            years_experience = $8,
            profile_image = $9,
            video_intro_url = $10,
            portfolio_urls = $11,
            timezone = $12,
            instant_booking = $13,
            auto_accept_bookings = $14,
            advance_booking_days = $15,
            min_session_duration = $16,
            max_session_duration = $17,
            session_buffer_minutes = $18,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `;

        const updateValues = [
          mentorId,
          specializations,
          industries,
          skills,
          languages,
          hourly_rate,
          currency,
          years_experience,
          profile_image,
          video_intro_url,
          portfolio_urls,
          timezone,
          instant_booking,
          auto_accept_bookings,
          advance_booking_days,
          min_session_duration,
          max_session_duration,
          session_buffer_minutes
        ];

        const updateResult = await client.query(updateQuery, updateValues);
        mentor = updateResult.rows[0];

        console.log('✅ Updated existing mentor:', mentorId);

      } else {
        // Create new mentor
        const insertQuery = `
          INSERT INTO mentors (
            user_id, specializations, industries, skills, languages, hourly_rate, currency,
            years_experience, profile_image, video_intro_url, portfolio_urls, timezone,
            instant_booking, auto_accept_bookings, advance_booking_days, min_session_duration,
            max_session_duration, session_buffer_minutes, status, verification_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'active', 'pending')
          RETURNING *
        `;

        const insertValues = [
          user_id,
          specializations,
          industries,
          skills,
          languages,
          hourly_rate,
          currency,
          years_experience,
          profile_image,
          video_intro_url,
          portfolio_urls,
          timezone,
          instant_booking,
          auto_accept_bookings,
          advance_booking_days,
          min_session_duration,
          max_session_duration,
          session_buffer_minutes
        ];

        const insertResult = await client.query(insertQuery, insertValues);
        mentor = insertResult.rows[0];

        console.log('✅ Created new mentor:', mentor.id);
      }

      // Update mentor categories
      if (categories.length > 0) {
        // Delete existing categories
        await client.query('DELETE FROM mentor_categories WHERE mentor_id = $1', [mentor.id]);

        // Insert new categories
        for (const categoryId of categories) {
          await client.query(
            'INSERT INTO mentor_categories (mentor_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [mentor.id, categoryId]
          );
        }
      }

      // Update mentor expertise
      if (expertise_tags.length > 0) {
        // Delete existing expertise
        await client.query('DELETE FROM mentor_expertise WHERE mentor_id = $1', [mentor.id]);

        // Insert new expertise
        for (const expertiseTag of expertise_tags) {
          const { tag_id, proficiency_level = 3 } = expertiseTag;
          await client.query(
            'INSERT INTO mentor_expertise (mentor_id, tag_id, proficiency_level) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [mentor.id, tag_id, proficiency_level]
          );
        }
      }

      return mentor;
    });

    res.status(existingMentor.rows.length > 0 ? 200 : 201).json({
      success: true,
      message: existingMentor.rows.length > 0 ? 'Mentor profile updated successfully' : 'Mentor profile created successfully',
      data: {
        mentor: formatMentorResponse(result)
      }
    });

  } catch (error) {
    console.error('❌ Error registering mentor:', error);

    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        message: 'Mentor profile already exists for this user',
        code: 'MENTOR_EXISTS'
      });
    }

    if (error.code === '23514') { // Check constraint violation
      return res.status(422).json({
        success: false,
        message: 'Invalid data provided',
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to register mentor',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Request mentor verification (send email to admin)
exports.requestMentorVerification = async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log('🔍 Requesting mentor verification for user:', userId);

    // Get mentor and user data
    const mentorQuery = `
      SELECT
        m.id,
        m.verification_status,
        u.first_name,
        u.last_name,
        u.email,
        u.bio,
        m.specializations,
        m.languages,
        m.hourly_rate,
        m.years_experience
      FROM mentors m
      JOIN users u ON m.user_id = u.id
      WHERE m.user_id = $1 AND m.status = 'active'
    `;

    const mentorResult = await db.query(mentorQuery, [userId]);

    if (mentorResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mentor profile not found',
        code: 'MENTOR_NOT_FOUND'
      });
    }

    const mentor = mentorResult.rows[0];

    // Check if already approved
    if (mentor.verification_status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Mentor is already verified',
        code: 'ALREADY_VERIFIED'
      });
    }

    // Send verification request email to admin
    const { sendMentorVerificationRequestEmail } = require('../utils/emailService');

    await sendMentorVerificationRequestEmail({
      id: mentor.id,
      firstName: mentor.first_name,
      lastName: mentor.last_name,
      email: mentor.email,
      bio: mentor.bio,
      specializations: mentor.specializations,
      languages: mentor.languages,
      hourlyRate: mentor.hourly_rate,
      yearsExperience: mentor.years_experience
    });

    console.log('✅ Mentor verification request sent for user:', userId);

    res.json({
      success: true,
      message: 'Verification request sent to admin. You will be notified once reviewed.',
      data: {
        verificationStatus: mentor.verification_status
      }
    });

  } catch (error) {
    console.error('❌ Error requesting mentor verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Admin approve/reject mentor verification
exports.updateMentorVerificationStatus = async (req, res) => {
  try {
    const { mentorId } = req.params;
    const { action } = req.query; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "approve" or "reject"',
        code: 'INVALID_ACTION'
      });
    }

    const newStatus = action === 'approve' ? 'verified' : 'rejected';

    console.log(`🔄 ${action === 'approve' ? 'Approving' : 'Rejecting'} mentor verification for mentor:`, mentorId);

    // Update mentor verification status
    const updateQuery = `
      UPDATE mentors
      SET verification_status = $2, verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const updateResult = await db.query(updateQuery, [mentorId, newStatus]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mentor not found',
        code: 'MENTOR_NOT_FOUND'
      });
    }

    const mentor = updateResult.rows[0];

    // Get user data for email
    const userQuery = 'SELECT first_name, last_name, email FROM users WHERE id = $1';
    const userResult = await db.query(userQuery, [mentor.user_id]);
    const user = userResult.rows[0];

    // Send result email to mentor
    const { sendMentorVerificationResultEmail } = require('../utils/emailService');

    await sendMentorVerificationResultEmail({
      id: mentor.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email
    }, action === 'approve');

    console.log(`✅ Mentor verification ${newStatus} for mentor:`, mentorId);

    res.json({
      success: true,
      message: `Mentor verification ${newStatus} successfully`,
      data: {
        mentor: formatMentorResponse(mentor),
        action: action,
        newStatus: newStatus
      }
    });

  } catch (error) {
    console.error('❌ Error updating mentor verification status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update verification status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Update mentor status (for admin use)
exports.updateMentorStatus = async (req, res) => {
  try {
    const { mentorId } = req.params;
    const { status, verification_status } = req.body;

    const updateQuery = `
      UPDATE mentors 
      SET status = COALESCE($2, status),
          verification_status = COALESCE($3, verification_status),
          verified_at = CASE WHEN $3 = 'verified' THEN CURRENT_TIMESTAMP ELSE verified_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(updateQuery, [mentorId, status, verification_status]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mentor not found',
        code: 'MENTOR_NOT_FOUND'
      });
    }

    console.log('✅ Mentor status updated:', mentorId, status, verification_status);

    res.json({
      success: true,
      message: 'Mentor status updated successfully',
      data: {
        mentor: formatMentorResponse(result.rows[0])
      }
    });

  } catch (error) {
    console.error('❌ Error updating mentor status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update mentor status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};
// Get monthly session statistics for mentor dashboard chart
exports.getMentorSessionStats = async (req, res) => {
  try {
    const userId = req.user.userId;

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

    // Get sessions per month for the last 12 months
    const query = `
      SELECT
        DATE_TRUNC('month', s.scheduled_at) as month,
        COUNT(*) as session_count
      FROM sessions s
      WHERE s.mentor_id = $1
        AND s.status = 'completed'
        AND s.scheduled_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY DATE_TRUNC('month', s.scheduled_at)
      ORDER BY month ASC
    `;

    const result = await db.query(query, [mentorId]);

    // Format data for chart - fill in missing months with 0
    const data = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = monthDate.toISOString().slice(0, 7); // YYYY-MM format

      const existingData = result.rows.find(row =>
        row.month.toISOString().slice(0, 7) === monthKey
      );

      data.push({
        month: monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        sessions: existingData ? parseInt(existingData.session_count) : 0
      });
    }

    res.json({
      success: true,
      data: {
        monthlySessions: data
      }
    });

  } catch (error) {
    console.error('❌ Error fetching mentor session stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  getActiveMentors: exports.getActiveMentors,
  getMentorProfile: exports.getMentorProfile,
  registerMentor: exports.registerMentor,
  updateMentorStatus: exports.updateMentorStatus,
  getMentorSessionStats: exports.getMentorSessionStats,
  requestMentorVerification: exports.requestMentorVerification,
  updateMentorVerificationStatus: exports.updateMentorVerificationStatus,
  formatMentorResponse
};
