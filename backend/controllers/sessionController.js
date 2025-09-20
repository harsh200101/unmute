const db = require('../config/database');
const { validationResult } = require('express-validator');
const crypto = require('crypto');

// Mock APIs for development (replace with real APIs in production)
const mockZoomAPI = {
  createMeeting: async ({ topic, start_time, duration }) => {
    return {
      id: `mock_meeting_${Date.now()}`,
      join_url: `https://zoom.us/j/mock${Math.random().toString(36).substr(2, 9)}`,
      topic,
      start_time,
      duration,
      password: crypto.randomBytes(3).toString('hex')
    };
  },
  
  updateMeeting: async (meetingId, updates) => {
    return { success: true, meetingId, updates };
  },
  
  deleteMeeting: async (meetingId) => {
    return { success: true, meetingId };
  }
};

const mockStripeAPI = {
  createPaymentIntent: async ({ amount, currency, metadata }) => {
    return {
      id: `pi_mock_${Date.now()}`,
      client_secret: `pi_mock_${Date.now()}_secret_mock`,
      amount,
      currency,
      status: 'requires_payment_method',
      metadata
    };
  },
  
  confirmPaymentIntent: async (paymentIntentId) => {
    return {
      id: paymentIntentId,
      status: 'succeeded',
      charges: {
        data: [{
          id: `ch_mock_${Date.now()}`,
          amount: 5000,
          currency: 'usd'
        }]
      }
    };
  }
};

// Format session response data
const formatSessionResponse = (session) => {
  return {
    id: session.id,
    uuid: session.uuid,
    mentorId: session.mentor_id,
    menteeId: session.mentee_id,
    title: session.title,
    description: session.description,
    sessionType: session.session_type,
    scheduledAt: session.scheduled_at,
    durationMinutes: session.duration_minutes,
    timezone: session.timezone,
    price: parseFloat(session.price || 0),
    currency: session.currency,
    platformFee: parseFloat(session.platform_fee || 0),
    mentorEarnings: parseFloat(session.mentor_earnings || 0),
    status: session.status,
    meetingPlatform: session.meeting_platform,
    meetingId: session.meeting_id,
    meetingUrl: session.meeting_url,
    meetingPassword: session.meeting_password,
    actualStartTime: session.actual_start_time,
    actualEndTime: session.actual_end_time,
    actualDurationMinutes: session.actual_duration_minutes,
    mentorNotes: session.mentor_notes,
    menteeNotes: session.mentee_notes,
    reminderSent24h: session.reminder_sent_24h,
    reminderSent1h: session.reminder_sent_1h,
    followUpSent: session.follow_up_sent,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    confirmedAt: session.confirmed_at,
    cancelledAt: session.cancelled_at,
    
    // Additional populated fields
    mentorName: session.mentor_first_name && session.mentor_last_name 
      ? `${session.mentor_first_name} ${session.mentor_last_name}` 
      : null,
    menteeName: session.mentee_first_name && session.mentee_last_name 
      ? `${session.mentee_first_name} ${session.mentee_last_name}` 
      : null,
    mentorAvatar: session.mentor_avatar,
    menteeAvatar: session.mentee_avatar
  };
};

// Create a new mentoring session with comprehensive validation
exports.createSession = async (req, res) => {
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
      mentorId,
      title,
      description,
      sessionType = 'video',
      scheduledAt,
      durationMinutes = 60,
      timezone = 'UTC',
      meetingPlatform = 'zoom'
    } = req.body;

    const menteeId = req.user.userId;

    console.log('🔄 Creating session:', { mentorId, menteeId, scheduledAt, durationMinutes });

    // Use transaction for data consistency
    const result = await db.transaction(async (client) => {
      // Get mentor details with pricing - FIXED: Use m.timezone instead of u.timezone
      const mentorQuery = `
        SELECT
          m.id,
          m.hourly_rate,
          m.currency,
          m.instant_booking,
          m.auto_accept_bookings,
          m.min_session_duration,
          m.max_session_duration,
          m.advance_booking_days,
          m.timezone as mentor_timezone,
          u.id as user_id,
          u.first_name,
          u.last_name
        FROM mentors m
        JOIN users u ON m.user_id = u.id
        WHERE m.id = $1 AND m.status = 'active' AND m.verification_status = 'verified'
      `;

      const mentorResult = await client.query(mentorQuery, [mentorId]);

      if (mentorResult.rows.length === 0) {
        throw new Error('MENTOR_NOT_FOUND');
      }

      const mentor = mentorResult.rows[0];

      // Validate session duration
      if (durationMinutes < mentor.min_session_duration || durationMinutes > mentor.max_session_duration) {
        throw new Error(`INVALID_DURATION: Duration must be between ${mentor.min_session_duration} and ${mentor.max_session_duration} minutes`);
      }

      // Check advance booking limits
      const scheduledDate = new Date(scheduledAt);
      const maxAdvanceDate = new Date();
      maxAdvanceDate.setDate(maxAdvanceDate.getDate() + mentor.advance_booking_days);

      if (scheduledDate > maxAdvanceDate) {
        throw new Error(`BOOKING_TOO_FAR: Cannot book more than ${mentor.advance_booking_days} days in advance`);
      }

      // Calculate pricing
      const hourlyRate = parseFloat(mentor.hourly_rate);
      const sessionPrice = (hourlyRate * durationMinutes) / 60;
      const platformFeeRate = parseFloat(process.env.PLATFORM_FEE_RATE || '0.1'); // 10% default
      const platformFee = sessionPrice * platformFeeRate;
      const mentorEarnings = sessionPrice - platformFee;

      // Create meeting if video session
      let meetingDetails = {};
      if (sessionType === 'video' || sessionType === 'voice') {
        try {
          const zoomMeeting = await mockZoomAPI.createMeeting({
            topic: title || `Mentoring Session with ${mentor.first_name} ${mentor.last_name}`,
            start_time: scheduledAt,
            duration: durationMinutes
          });

          meetingDetails = {
            meeting_id: zoomMeeting.id,
            meeting_url: zoomMeeting.join_url,
            meeting_password: zoomMeeting.password
          };
        } catch (error) {
          console.error('❌ Meeting creation failed:', error);
          throw new Error('MEETING_CREATION_FAILED');
        }
      }

      // Determine session status
      const sessionStatus = mentor.auto_accept_bookings ? 'confirmed' : 'scheduled';

      // Insert session
      const sessionQuery = `
        INSERT INTO sessions (
          mentor_id, mentee_id, title, description, session_type,
          scheduled_at, duration_minutes, timezone, price, currency,
          platform_fee, mentor_earnings, meeting_platform,
          meeting_id, meeting_url, meeting_password, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *
      `;

      const sessionValues = [
        mentorId,
        menteeId,
        title || `Mentoring Session with ${mentor.first_name} ${mentor.last_name}`,
        description,
        sessionType,
        scheduledAt,
        durationMinutes,
        timezone,
        sessionPrice,
        mentor.currency,
        platformFee,
        mentorEarnings,
        meetingPlatform,
        meetingDetails.meeting_id || null,
        meetingDetails.meeting_url || null,
        meetingDetails.meeting_password || null,
        sessionStatus
      ];

      const sessionResult = await client.query(sessionQuery, sessionValues);
      const session = sessionResult.rows[0];

      // Create payment intent
      const paymentIntent = await mockStripeAPI.createPaymentIntent({
        amount: Math.round(sessionPrice * 100), // Convert to cents
        currency: mentor.currency.toLowerCase(),
        metadata: {
          sessionId: session.id.toString(),
          sessionUuid: session.uuid,
          mentorId: mentorId.toString(),
          menteeId: menteeId.toString(),
          platform: 'unmute'
        }
      });

      // Insert payment record
      const paymentQuery = `
        INSERT INTO payments (
          session_id, amount, currency, platform_fee, processing_fee,
          mentor_earnings, payment_status, payment_method, payment_gateway,
          stripe_payment_intent_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const paymentValues = [
        session.id,
        sessionPrice,
        mentor.currency,
        platformFee,
        0, // processing fee - calculate based on payment method
        mentorEarnings,
        'pending',
        'stripe',
        'stripe',
        paymentIntent.id
      ];

      const paymentResult = await client.query(paymentQuery, paymentValues);

      // Create notifications - FIXED: Consistent column names
      const notifications = [
        // Notification for mentee
        {
          user_id: menteeId,
          title: 'Session Booking Confirmed',
          message: `Your session with ${mentor.first_name} ${mentor.last_name} has been ${sessionStatus === 'confirmed' ? 'confirmed' : 'submitted for approval'}.`,
          type: sessionStatus === 'confirmed' ? 'booking_confirmed' : 'booking_request',
          related_entity_type: 'session',
          related_entity_id: session.id
        }
      ];

      // Notification for mentor (if not auto-accept)
      if (!mentor.auto_accept_bookings) {
        notifications.push({
          user_id: mentor.user_id,
          title: 'New Session Request',
          message: `You have a new session request for ${new Date(scheduledAt).toLocaleDateString()}.`,
          type: 'booking_request',
          related_entity_type: 'session',
          related_entity_id: session.id
        });
      }

      // Insert notifications
      for (const notification of notifications) {
        await client.query(`
          INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          notification.user_id,
          notification.title,
          notification.message,
          notification.type,
          notification.related_entity_type,
          notification.related_entity_id
        ]);
      }

      return {
        session,
        payment: paymentResult.rows[0],
        paymentIntent
      };
    });

    console.log('✅ Session created successfully:', result.session.id);

    res.status(201).json({
      success: true,
      message: 'Session created successfully',
      data: {
        session: formatSessionResponse(result.session),
        payment: {
          id: result.payment.id,
          amount: result.payment.amount,
          currency: result.payment.currency,
          status: result.payment.payment_status
        },
        paymentIntent: {
          id: result.paymentIntent.id,
          client_secret: result.paymentIntent.client_secret,
          amount: result.paymentIntent.amount,
          currency: result.paymentIntent.currency
        }
      }
    });

  } catch (error) {
    console.error('❌ Error creating session:', error);

    // Handle specific errors
    if (error.message === 'MENTOR_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Mentor not found or unavailable',
        code: 'MENTOR_NOT_FOUND'
      });
    }

    if (error.message.startsWith('INVALID_DURATION')) {
      return res.status(422).json({
        success: false,
        message: error.message.split(': ')[1],
        code: 'INVALID_DURATION'
      });
    }

    if (error.message.startsWith('BOOKING_TOO_FAR')) {
      return res.status(422).json({
        success: false,
        message: error.message.split(': ')[1],
        code: 'BOOKING_TOO_FAR'
      });
    }

    if (error.message === 'MEETING_CREATION_FAILED') {
      return res.status(503).json({
        success: false,
        message: 'Failed to create video meeting. Please try again.',
        code: 'MEETING_CREATION_FAILED'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get user's sessions with comprehensive details
exports.getUserSessions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      status,
      type,
      upcoming = false,
      past = false,
      page = 1,
      limit = 20
    } = req.query;

    console.log('🔍 Fetching user sessions:', { userId, status, type, upcoming, past });

    let query = `
      SELECT 
        s.*,
        mentor_user.first_name as mentor_first_name,
        mentor_user.last_name as mentor_last_name,
        mentor_user.avatar_url as mentor_avatar,
        mentee_user.first_name as mentee_first_name,
        mentee_user.last_name as mentee_last_name,
        mentee_user.avatar_url as mentee_avatar,
        m.hourly_rate as mentor_hourly_rate,
        m.badge_level as mentor_badge_level,
        p.payment_status,
        p.amount as payment_amount,
        r.overall_rating as session_rating,
        r.comment as session_review
      FROM sessions s
      INNER JOIN mentors m ON s.mentor_id = m.id
      INNER JOIN users mentor_user ON m.user_id = mentor_user.id
      INNER JOIN users mentee_user ON s.mentee_id = mentee_user.id
      LEFT JOIN payments p ON s.id = p.session_id
      LEFT JOIN reviews r ON s.id = r.session_id
      WHERE (s.mentee_id = $1 OR mentor_user.id = $1)
    `;

    const params = [userId];
    let paramCount = 1;

    // Status filter
    if (status) {
      paramCount++;
      query += ` AND s.status = $${paramCount}`;
      params.push(status);
    }

    // Session type filter
    if (type) {
      paramCount++;
      query += ` AND s.session_type = $${paramCount}`;
      params.push(type);
    }

    // Upcoming sessions
    if (upcoming === 'true') {
      query += ` AND s.scheduled_at > CURRENT_TIMESTAMP`;
    }

    // Past sessions
    if (past === 'true') {
      query += ` AND s.scheduled_at < CURRENT_TIMESTAMP`;
    }

    query += ` ORDER BY s.scheduled_at DESC`;

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
      SELECT COUNT(DISTINCT s.id) as total
      FROM sessions s
      INNER JOIN mentors m ON s.mentor_id = m.id
      INNER JOIN users mentor_user ON m.user_id = mentor_user.id
      WHERE (s.mentee_id = $1 OR mentor_user.id = $1)
    `;

    const countParams = [userId];
    let countParamCount = 1;

    if (status) {
      countParamCount++;
      countQuery += ` AND s.status = $${countParamCount}`;
      countParams.push(status);
    }

    if (type) {
      countParamCount++;
      countQuery += ` AND s.session_type = $${countParamCount}`;
      countParams.push(type);
    }

    if (upcoming === 'true') {
      countQuery += ` AND s.scheduled_at > CURRENT_TIMESTAMP`;
    }

    if (past === 'true') {
      countQuery += ` AND s.scheduled_at < CURRENT_TIMESTAMP`;
    }

    const countResult = await db.query(countQuery, countParams);
    const totalSessions = parseInt(countResult.rows[0].total);

    // Format sessions with additional data
    const sessions = result.rows.map(session => ({
      ...formatSessionResponse(session),
      paymentStatus: session.payment_status,
      paymentAmount: parseFloat(session.payment_amount || 0),
      mentorHourlyRate: parseFloat(session.mentor_hourly_rate || 0),
      mentorBadgeLevel: session.mentor_badge_level,
      sessionRating: session.session_rating,
      sessionReview: session.session_review,
      isUpcoming: new Date(session.scheduled_at) > new Date(),
      isPast: new Date(session.scheduled_at) < new Date(),
      canCancel: ['pending', 'confirmed'].includes(session.status) && 
                 new Date(session.scheduled_at) > new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours notice
      canReview: session.status === 'completed' && !session.session_rating,
      canReschedule: ['pending', 'confirmed'].includes(session.status) && 
                     new Date(session.scheduled_at) > new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours notice
    }));

    console.log(`✅ Found ${sessions.length} sessions for user ${userId}`);

    res.json({
      success: true,
      data: {
        sessions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalSessions / limit),
          totalSessions,
          limit: parseInt(limit),
          hasNextPage: page < Math.ceil(totalSessions / limit),
          hasPreviousPage: page > 1
        },
        summary: {
          total: totalSessions,
          upcoming: sessions.filter(s => s.isUpcoming).length,
          past: sessions.filter(s => s.isPast).length,
          completed: sessions.filter(s => s.status === 'completed').length,
          pending: sessions.filter(s => s.status === 'pending').length
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching user sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sessions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Cancel a session
exports.cancelSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason } = req.body;
    const userId = req.user.userId;

    console.log('🔄 Cancelling session:', { sessionId, userId, reason });

    const result = await db.transaction(async (client) => {
      // Get session details
      const sessionQuery = `
        SELECT 
          s.*,
          m.user_id as mentor_user_id,
          mentor_user.first_name as mentor_first_name,
          mentor_user.last_name as mentor_last_name,
          mentee_user.first_name as mentee_first_name,
          mentee_user.last_name as mentee_last_name
        FROM sessions s
        JOIN mentors m ON s.mentor_id = m.id
        JOIN users mentor_user ON m.user_id = mentor_user.id
        JOIN users mentee_user ON s.mentee_id = mentee_user.id
        WHERE s.id = $1
      `;

      const sessionResult = await client.query(sessionQuery, [sessionId]);

      if (sessionResult.rows.length === 0) {
        throw new Error('SESSION_NOT_FOUND');
      }

      const session = sessionResult.rows[0];

      // Check if user has permission to cancel
      if (session.mentee_id !== userId && session.mentor_user_id !== userId) {
        throw new Error('UNAUTHORIZED');
      }

      // Check if session can be cancelled
      if (!['pending', 'confirmed'].includes(session.status)) {
        throw new Error('CANNOT_CANCEL');
      }

      // Check cancellation policy (24 hours notice)
      const scheduledAt = new Date(session.scheduled_at);
      const now = new Date();
      const hoursUntilSession = (scheduledAt - now) / (1000 * 60 * 60);

      if (hoursUntilSession < 24) {
        throw new Error('LATE_CANCELLATION');
      }

      // Determine cancellation type
      const isMentorCancelling = session.mentor_user_id === userId;
      const newStatus = isMentorCancelling ? 'cancelled_by_mentor' : 'cancelled_by_mentee';

      // Update session status
      const updateQuery = `
        UPDATE sessions 
        SET status = $2, 
            cancelled_at = CURRENT_TIMESTAMP,
            admin_notes = COALESCE(admin_notes || ' ', '') || $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const cancelReason = `Cancelled by ${isMentorCancelling ? 'mentor' : 'mentee'}: ${reason || 'No reason provided'}`;
      const updateResult = await client.query(updateQuery, [sessionId, newStatus, cancelReason]);

      // Update payment status to refunded
      await client.query(`
        UPDATE payments 
        SET payment_status = 'refunded',
            refund_amount = amount,
            refund_reason = $2,
            refunded_at = CURRENT_TIMESTAMP
        WHERE session_id = $1
      `, [sessionId, cancelReason]);

      // Delete meeting if exists
      if (session.meeting_id) {
        try {
          await mockZoomAPI.deleteMeeting(session.meeting_id);
        } catch (error) {
          console.warn('⚠️ Failed to delete meeting:', error.message);
        }
      }

      // Create notifications - FIXED: Consistent column names
      const notifications = [
        {
          user_id: isMentorCancelling ? session.mentee_id : session.mentor_user_id,
          title: 'Session Cancelled',
          message: `Your session scheduled for ${new Date(session.scheduled_at).toLocaleDateString()} has been cancelled.`,
          type: 'booking_cancelled'
        }
      ];

      for (const notification of notifications) {
        await client.query(`
          INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          notification.user_id,
          notification.title,
          notification.message,
          notification.type,
          'session',
          sessionId
        ]);
      }

      return updateResult.rows[0];
    });

    console.log('✅ Session cancelled successfully:', sessionId);

    res.json({
      success: true,
      message: 'Session cancelled successfully',
      data: {
        session: formatSessionResponse(result)
      }
    });

  } catch (error) {
    console.error('❌ Error cancelling session:', error);

    if (error.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    if (error.message === 'UNAUTHORIZED') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to cancel this session',
        code: 'UNAUTHORIZED'
      });
    }

    if (error.message === 'CANNOT_CANCEL') {
      return res.status(422).json({
        success: false,
        message: 'This session cannot be cancelled',
        code: 'CANNOT_CANCEL'
      });
    }

    if (error.message === 'LATE_CANCELLATION') {
      return res.status(422).json({
        success: false,
        message: 'Sessions must be cancelled at least 24 hours in advance',
        code: 'LATE_CANCELLATION'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to cancel session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Update session status (for mentors to confirm/reject)
exports.updateSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { status, notes } = req.body;
    const userId = req.user.userId;

    // Validate status
    const allowedStatuses = ['confirmed', 'cancelled_by_mentor', 'in_progress', 'completed'];
    if (!allowedStatuses.includes(status)) {
      return res.status(422).json({
        success: false,
        message: 'Invalid status',
        code: 'INVALID_STATUS'
      });
    }

    console.log('🔄 Updating session status:', { sessionId, status, userId });

    const result = await db.transaction(async (client) => {
      // Get session and verify mentor ownership
      const sessionQuery = `
        SELECT s.*, m.user_id as mentor_user_id
        FROM sessions s
        JOIN mentors m ON s.mentor_id = m.id
        WHERE s.id = $1
      `;

      const sessionResult = await client.query(sessionQuery, [sessionId]);

      if (sessionResult.rows.length === 0) {
        throw new Error('SESSION_NOT_FOUND');
      }

      const session = sessionResult.rows[0];

      if (session.mentor_user_id !== userId) {
        throw new Error('UNAUTHORIZED');
      }

      // Update session
      const updateQuery = `
        UPDATE sessions 
        SET status = $2,
            mentor_notes = COALESCE($3, mentor_notes),
            confirmed_at = CASE WHEN $2 = 'confirmed' THEN CURRENT_TIMESTAMP ELSE confirmed_at END,
            actual_start_time = CASE WHEN $2 = 'in_progress' THEN CURRENT_TIMESTAMP ELSE actual_start_time END,
            actual_end_time = CASE WHEN $2 = 'completed' THEN CURRENT_TIMESTAMP ELSE actual_end_time END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const updateResult = await client.query(updateQuery, [sessionId, status, notes]);

      // Create notification for mentee
      const notificationTitle = {
        'confirmed': 'Session Confirmed',
        'cancelled_by_mentor': 'Session Cancelled by Mentor',
        'in_progress': 'Session Started',
        'completed': 'Session Completed'
      }[status];

      await client.query(`
        INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        session.mentee_id,
        notificationTitle,
        `Your session status has been updated to: ${status}`,
        status === 'confirmed' ? 'booking_confirmed' : 'session_started',
        'session',
        sessionId
      ]);

      return updateResult.rows[0];
    });

    console.log('✅ Session status updated:', sessionId, status);

    res.json({
      success: true,
      message: 'Session status updated successfully',
      data: {
        session: formatSessionResponse(result)
      }
    });

  } catch (error) {
    console.error('❌ Error updating session status:', error);

    if (error.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    if (error.message === 'UNAUTHORIZED') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this session',
        code: 'UNAUTHORIZED'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update session status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  createSession: exports.createSession,
  getUserSessions: exports.getUserSessions,
  cancelSession: exports.cancelSession,
  updateSessionStatus: exports.updateSessionStatus,
  formatSessionResponse
};
