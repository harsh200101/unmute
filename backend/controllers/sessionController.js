const db = require('../config/database');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const agoraService = require('../utils/agora');
const { sendSessionRescheduledEmail, sendRescheduleRequestEmail, sendSessionCancelledEmail, sendMeetingInviteEmail } = require('../utils/emailService');

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
      status: 'succeeded', // Simulate successful payment for test environment
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
          u.first_name as mentor_first_name,
          u.last_name as mentor_last_name
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

      // Calculate pricing - mentee pays exact displayed price, platform fee deducted internally
      const hourlyRate = parseFloat(mentor.hourly_rate);
      const sessionPrice = (hourlyRate * durationMinutes) / 60;
      const platformFeeRate = parseFloat(process.env.PLATFORM_FEE_RATE || '0.1'); // 10% default
      const platformFee = sessionPrice * platformFeeRate;
      const mentorEarnings = sessionPrice - platformFee;

      // Create meeting if video session
      let meetingDetails = {};
      if (sessionType === 'video' || sessionType === 'voice') {
        // Agora meeting will be created after session insertion
        meetingDetails = {
          meeting_platform: 'agora'
        };
      }

      // All sessions start as pending until payment is completed
      const sessionStatus = 'pending';

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
        meetingDetails.meeting_platform || meetingPlatform,
        null, // meeting_id (will be set later for Agora)
        null, // meeting_url (will be set later for Agora)
        null, // meeting_password (not needed for Agora)
        sessionStatus
      ];

      const sessionResult = await client.query(sessionQuery, sessionValues);
      const session = sessionResult.rows[0];

      // Meeting will be created after payment confirmation
      // For now, just set placeholder values
      await client.query(`
        UPDATE sessions
        SET meeting_url = NULL, meeting_id = NULL
        WHERE id = $1
      `, [session.id]);

      // Create notifications - FIXED: Consistent column names
      const notifications = [
        // Notification for mentee
        {
          user_id: menteeId,
          title: 'Session Booking Created',
          message: `Your session with ${mentor.first_name} ${mentor.last_name} has been created. Please complete the payment to confirm.`,
          type: 'booking_pending',
          related_entity_type: 'session',
          related_entity_id: session.id
        }
      ];

      // Notification for mentor
      notifications.push({
        user_id: mentor.user_id,
        title: 'New Session Request',
        message: `You have a new session request for ${new Date(scheduledAt).toLocaleDateString()}. Awaiting payment confirmation.`,
        type: 'booking_pending',
        related_entity_type: 'session',
        related_entity_id: session.id
      });

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
        session
      };
    });

    console.log('✅ Session created successfully:', result.session.id);

    res.status(201).json({
      success: true,
      message: 'Session created successfully',
      data: {
        session: formatSessionResponse(result.session)
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
      LEFT JOIN reviews r ON s.id = r.session_id AND r.reviewer_type = 'mentee'
      WHERE ((s.mentee_id = $1 AND s.status != 'pending') OR mentor_user.id = $1)
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
      WHERE ((s.mentee_id = $1 AND s.status != 'pending') OR mentor_user.id = $1)
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
      canCancel: ['confirmed', 'in_progress'].includes(session.status) &&
                new Date(session.scheduled_at) > new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours notice
      canReview: session.status === 'completed' && !session.session_rating,
      canMentorReview: session.status === 'completed' && session.mentee_id === userId, // Mentor can review mentee
      canReschedule: ['pending', 'confirmed'].includes(session.status) &&
                    new Date(session.scheduled_at) > new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours notice for mentees
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

      // Check if user has permission to cancel (only mentee can cancel)
      if (session.mentee_id !== userId) {
        throw new Error('UNAUTHORIZED');
      }

      // Check if session can be cancelled
      if (!['confirmed', 'in_progress'].includes(session.status)) {
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

// Reschedule a session
exports.rescheduleSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { newScheduledAt, newDurationMinutes, timezone, reason } = req.body;
    const userId = req.user.userId;

    console.log('🔄 Rescheduling session:', { sessionId, userId, newScheduledAt, newDurationMinutes });

    const result = await db.transaction(async (client) => {
      // Get session details with mentor info
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

      // Check if user has permission to reschedule
      const isMentee = session.mentee_id === userId;
      const isMentor = session.mentor_user_id === userId;

      if (!isMentee && !isMentor) {
        throw new Error('UNAUTHORIZED');
      }

      // Check if session can be rescheduled
      if (!['confirmed', 'in_progress'].includes(session.status)) {
        throw new Error('CANNOT_RESCHEDULE');
      }

      // Check 24-hour rule for mentees
      const scheduledAt = new Date(session.scheduled_at);
      const now = new Date();
      const hoursUntilSession = (scheduledAt - now) / (1000 * 60 * 60);

      if (isMentee && hoursUntilSession < 24) {
        throw new Error('TOO_LATE_TO_RESCHEDULE');
      }

      // For mentees, status should remain confirmed after reschedule
      // Only change status if it's currently pending
      const shouldChangeStatus = isMentee && session.status === 'pending';

      // For mentors, create reschedule request instead of direct reschedule
      if (isMentor) {
        // Create reschedule request notification for mentee
        await client.query(`
          INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          session.mentee_id,
          'Reschedule Request from Mentor',
          `${session.mentor_user_first_name} ${session.mentor_user_last_name} would like to reschedule your session. Would you like to reschedule or cancel?`,
          'reschedule_request',
          'session',
          sessionId,
          JSON.stringify({
            requestedBy: 'mentor',
            reason: reason || 'No reason provided',
            originalScheduledAt: session.scheduled_at,
            newScheduledAt: newScheduledAt,
            newDurationMinutes: newDurationMinutes,
            timezone: timezone
          })
        ]);

        // Send email notification to mentee
        try {
          const menteeQuery = `SELECT email FROM users WHERE id = $1`;
          const menteeResult = await client.query(menteeQuery, [session.mentee_id]);

          if (menteeResult.rows.length > 0) {
            const sessionData = {
              title: session.title,
              scheduledAt: session.scheduled_at,
              durationMinutes: session.duration_minutes
            };
            const requesterName = `${session.mentor_user_first_name} ${session.mentor_user_last_name}`;
            await sendRescheduleRequestEmail(menteeResult.rows[0].email, sessionData, requesterName);
          }
        } catch (emailError) {
          console.warn('⚠️ Failed to send reschedule request email:', emailError.message);
        }

        return {
          session,
          action: 'request_sent',
          message: 'Reschedule request sent to mentee'
        };
      }

      // For mentees: direct reschedule
      // First, approve any existing pending reschedule requests since direct reschedule by mentee serves as approval
      await client.query(`
        UPDATE session_reschedule_requests
        SET status = 'approved', responded_at = CURRENT_TIMESTAMP, response_reason = 'Approved via direct reschedule by mentee'
        WHERE session_id = $1 AND status = 'pending'
      `, [sessionId]);

      // Validate new time is in the future and at least 12 hours from now
      const newScheduledDate = new Date(newScheduledAt);
      const hoursUntilNewSession = (newScheduledDate - now) / (1000 * 60 * 60);

      if (newScheduledDate <= now) {
        throw new Error('NEW_TIME_IN_PAST');
      }

      if (hoursUntilNewSession < 12) {
        throw new Error('NEW_TIME_TOO_SOON');
      }

      // Check mentor availability for the new time
      const newDate = new Date(newScheduledAt);
      const dayOfWeek = newDate.getDay();
      const timeString = newDate.toTimeString().substring(0, 5); // HH:MM format

      const availabilityQuery = `
        SELECT * FROM mentor_availability
        WHERE mentor_id = $1
          AND (
            (specific_date IS NULL AND day_of_week = $2) OR
            (specific_date = $3)
          )
          AND is_available = true
          AND start_time <= $4
          AND end_time > $4
      `;

      const availabilityResult = await client.query(availabilityQuery, [
        session.mentor_id,
        dayOfWeek,
        newScheduledAt.split('T')[0], // date part for specific date overrides
        timeString
      ]);

      if (availabilityResult.rows.length === 0) {
        throw new Error('MENTOR_NOT_AVAILABLE');
      }

      // Check for conflicts with existing sessions
      const conflictQuery = `
        SELECT id FROM sessions
        WHERE mentor_id = $1
          AND id != $2
          AND status IN ('scheduled', 'confirmed', 'in_progress')
          AND scheduled_at::date = $3::date
          AND (
            (scheduled_at <= $4 AND scheduled_at + (duration_minutes || ' minutes')::interval > $4) OR
            ($4 <= scheduled_at AND $4 + ($5 || ' minutes')::interval > scheduled_at)
          )
      `;

      const conflictResult = await client.query(conflictQuery, [
        session.mentor_id,
        sessionId,
        newScheduledAt.split('T')[0], // date part
        newScheduledAt,
        newDurationMinutes
      ]);

      if (conflictResult.rows.length > 0) {
        throw new Error('TIME_CONFLICT');
      }

      // Update meeting if video session
      let meetingUpdate = {};
      if (session.session_type === 'video' || session.session_type === 'voice') {
        try {
          const updateData = {
            topic: session.title || `Mentoring Session`,
            start_time: newScheduledAt,
            duration: newDurationMinutes || session.duration_minutes
          };

          meetingUpdate = await mockZoomAPI.updateMeeting(session.meeting_id, updateData);
        } catch (error) {
          console.warn('⚠️ Failed to update meeting:', error.message);
        }
      }

      // Update session - only change status if needed
      const updateFields = [
        'scheduled_at = $2',
        'duration_minutes = COALESCE($3, duration_minutes)',
        'timezone = COALESCE($4, timezone)',
        'updated_at = CURRENT_TIMESTAMP',
        'admin_notes = COALESCE(admin_notes || E\'\n\', \'\') || $5'
      ];

      const updateValues = [
        sessionId,
        newScheduledAt,
        newDurationMinutes,
        timezone,
        `Rescheduled by ${isMentee ? 'mentee' : 'mentor'}: ${reason || 'No reason provided'}`
      ];

      // Only change status to confirmed if it was pending
      if (shouldChangeStatus) {
        updateFields.push('status = \'confirmed\'');
      }

      const updateQuery = `
        UPDATE sessions
        SET ${updateFields.join(', ')}
        WHERE id = $1
        RETURNING *
      `;

      const updateResult = await client.query(updateQuery, updateValues);

      // Create notifications for both parties
      const notifications = [
        // Notification for the other party
        {
          user_id: isMentee ? session.mentor_user_id : session.mentee_id,
          title: 'Session Rescheduled',
          message: `Your session has been rescheduled to ${new Date(newScheduledAt).toLocaleString()}`,
          type: 'session_rescheduled',
          related_entity_type: 'session',
          related_entity_id: sessionId
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
          notification.related_entity_type,
          notification.related_entity_id
        ]);
      }

      // Send email notifications
      try {
        const sessionData = {
          title: updateResult.rows[0].title,
          scheduledAt: newScheduledAt,
          durationMinutes: newDurationMinutes || updateResult.rows[0].duration_minutes,
          sessionType: updateResult.rows[0].session_type,
          meetingUrl: updateResult.rows[0].meeting_url
        };

        // Get recipient email
        const recipientQuery = `SELECT email FROM users WHERE id = $1`;
        const recipientResult = await client.query(recipientQuery, [isMentee ? session.mentor_user_id : session.mentee_id]);

        if (recipientResult.rows.length > 0) {
          await sendSessionRescheduledEmail(recipientResult.rows[0].email, sessionData);
        }
      } catch (emailError) {
        console.warn('⚠️ Failed to send reschedule email:', emailError.message);
      }

      return {
        session: updateResult.rows[0],
        action: 'rescheduled',
        message: 'Session rescheduled successfully'
      };
    });

    console.log('✅ Session reschedule completed:', sessionId, result.action);

    res.json({
      success: true,
      message: result.message,
      data: {
        session: formatSessionResponse(result.session),
        action: result.action
      }
    });

  } catch (error) {
    console.error('❌ Error rescheduling session:', error);

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
        message: 'You are not authorized to reschedule this session',
        code: 'UNAUTHORIZED'
      });
    }

    if (error.message === 'CANNOT_RESCHEDULE') {
      return res.status(422).json({
        success: false,
        message: 'This session cannot be rescheduled',
        code: 'CANNOT_RESCHEDULE'
      });
    }

    if (error.message === 'TOO_LATE_TO_RESCHEDULE') {
      return res.status(422).json({
        success: false,
        message: 'Sessions can only be rescheduled at least 24 hours in advance',
        code: 'TOO_LATE_TO_RESCHEDULE'
      });
    }

    if (error.message === 'NEW_TIME_TOO_CLOSE') {
      return res.status(422).json({
        success: false,
        message: 'New session time must be at least 1 hour from now',
        code: 'NEW_TIME_TOO_CLOSE'
      });
    }

    if (error.message === 'NEW_TIME_IN_PAST') {
      return res.status(422).json({
        success: false,
        message: 'New session time cannot be in the past',
        code: 'NEW_TIME_IN_PAST'
      });
    }

    if (error.message === 'NEW_TIME_TOO_SOON') {
       return res.status(422).json({
         success: false,
         message: 'New session time must be at least 24 hours from now',
         code: 'NEW_TIME_TOO_SOON'
       });
     }

    if (error.message === 'MENTOR_NOT_AVAILABLE') {
      return res.status(422).json({
        success: false,
        message: 'Mentor is not available at the selected time. Please choose a different time.',
        code: 'MENTOR_NOT_AVAILABLE'
      });
    }

    if (error.message === 'TIME_CONFLICT') {
      return res.status(422).json({
        success: false,
        message: 'The selected time conflicts with another session. Please choose a different time.',
        code: 'TIME_CONFLICT'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to reschedule session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Respond to reschedule request (for mentees) - Simplified: mentee chooses new time
exports.respondToRescheduleRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action, newScheduledAt, newDuration, timezone, reason } = req.body;
    const userId = req.user.userId;

    console.log('🔄 Responding to reschedule request:', { requestId, action, userId });

    const result = await db.transaction(async (client) => {
      // Get reschedule request details
      const requestQuery = `
        SELECT rr.*, s.*, m.user_id as mentor_user_id,
                mentor_user.first_name as mentor_first_name, mentor_user.last_name as mentor_last_name,
                mentee_user.first_name as mentee_first_name, mentee_user.last_name as mentee_last_name
        FROM session_reschedule_requests rr
        JOIN sessions s ON rr.session_id = s.id
        JOIN mentors m ON s.mentor_id = m.id
        JOIN users mentor_user ON m.user_id = mentor_user.id
        JOIN users mentee_user ON s.mentee_id = mentee_user.id
        WHERE rr.id = $1 AND rr.status = 'pending'
      `;

      const requestResult = await client.query(requestQuery, [requestId]);

      if (requestResult.rows.length === 0) {
        throw new Error('REQUEST_NOT_FOUND');
      }

      const request = requestResult.rows[0];

      if (request.mentee_id !== userId) {
        throw new Error('UNAUTHORIZED');
      }

      if (action === 'accept') {
        // Accept the reschedule - update session time
        if (!newScheduledAt) {
          throw new Error('NEW_SCHEDULED_AT_REQUIRED');
        }

        const newScheduledDateTime = new Date(newScheduledAt);

        // Validate the new time is not in the past and at least 24 hours from now
        const now = new Date();
        const hoursUntilNewSession = (newScheduledDateTime - now) / (1000 * 60 * 60);
 
        if (newScheduledDateTime <= now) {
          throw new Error('NEW_TIME_IN_PAST');
        }
 
        if (hoursUntilNewSession < 24) {
          throw new Error('NEW_TIME_TOO_SOON');
        }

        // Update session
        const updateFields = ['scheduled_at = $2'];
        const updateValues = [request.session_id, newScheduledDateTime];
        let paramCount = 2;

        if (newDuration) {
          paramCount++;
          updateFields.push(`duration_minutes = $${paramCount}`);
          updateValues.push(newDuration);
        }

        if (timezone) {
          paramCount++;
          updateFields.push(`timezone = $${paramCount}`);
          updateValues.push(timezone);
        }

        const updateQuery = `
          UPDATE sessions
          SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `;

        await client.query(updateQuery, updateValues);

        // Update request status
        await client.query(`
          UPDATE session_reschedule_requests
          SET status = 'approved', responded_by = $2, response_reason = $3, responded_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [requestId, userId, reason || 'Accepted by mentee']);

        // Create notifications
        await client.query(`
          INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          request.mentor_user_id,
          'Reschedule Request Approved',
          `Your reschedule request for the session with ${request.mentee_first_name} ${request.mentee_last_name} has been approved.`,
          'reschedule_approved',
          'session',
          request.session_id
        ]);

        return { action: 'approved', sessionId: request.session_id };

      } else if (action === 'decline') {
        // Decline the reschedule - cancel session and process refund
        await client.query(`
          UPDATE sessions
          SET status = 'cancelled_by_mentee', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [request.session_id]);

        // Update request status
        await client.query(`
          UPDATE session_reschedule_requests
          SET status = 'declined', responded_by = $2, response_reason = $3, responded_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [requestId, userId, reason || 'Declined by mentee']);

        // Process refund
        await client.query(`
          UPDATE payments
          SET payment_status = 'refunded', refund_amount = amount, refund_reason = $2, refunded_at = CURRENT_TIMESTAMP
          WHERE session_id = $1
        `, [request.session_id, 'Session rescheduled and cancelled by mentee']);

        // Create notifications
        await client.query(`
          INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          request.mentor_user_id,
          'Reschedule Request Declined',
          `Your reschedule request for the session with ${request.mentee_first_name} ${request.mentee_last_name} has been declined. The session has been cancelled.`,
          'reschedule_declined',
          'session',
          request.session_id
        ]);

        return { action: 'declined', sessionId: request.session_id };
      }

      throw new Error('INVALID_ACTION');
    });

    console.log('✅ Reschedule request response processed:', result);

    res.json({
      success: true,
      message: `Reschedule request ${result.action} successfully`,
      data: result
    });

  } catch (error) {
    console.error('❌ Error responding to reschedule request:', error);

    if (error.message === 'REQUEST_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Reschedule request not found',
        code: 'REQUEST_NOT_FOUND'
      });
    }

    if (error.message === 'UNAUTHORIZED') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to respond to this request',
        code: 'UNAUTHORIZED'
      });
    }

    if (error.message === 'INVALID_ACTION') {
      return res.status(422).json({
        success: false,
        message: 'Invalid action. Must be "accept" or "decline"',
        code: 'INVALID_ACTION'
      });
    }

    if (error.message === 'NEW_SCHEDULED_AT_REQUIRED') {
      return res.status(422).json({
        success: false,
        message: 'New scheduled time is required for reschedule',
        code: 'NEW_SCHEDULED_AT_REQUIRED'
      });
    }

    if (error.message === 'NEW_TIME_IN_PAST') {
      return res.status(422).json({
        success: false,
        message: 'New session time cannot be in the past',
        code: 'NEW_TIME_IN_PAST'
      });
    }

    if (error.message === 'NEW_TIME_TOO_SOON') {
      return res.status(422).json({
        success: false,
        message: 'New session time must be at least 24 hours from now',
        code: 'NEW_TIME_TOO_SOON'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to process reschedule response',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Submit reschedule request (for mentors)
exports.submitRescheduleRequest = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason, preferredDate, preferredTime } = req.body;
    const userId = req.user.userId;

    console.log('🔄 Submitting reschedule request:', { sessionId, userId, reason });

    const result = await db.transaction(async (client) => {
      // Get session details and verify mentor ownership
      const sessionQuery = `
        SELECT s.*, m.user_id as mentor_user_id, mentor_user.first_name as mentor_first_name, mentor_user.last_name as mentor_last_name,
               u.first_name as mentee_first_name, u.last_name as mentee_last_name
        FROM sessions s
        JOIN mentors m ON s.mentor_id = m.id
        JOIN users mentor_user ON m.user_id = mentor_user.id
        JOIN users u ON s.mentee_id = u.id
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

      // Check if session can be rescheduled (not too close to session time)
      const scheduledAt = new Date(session.scheduled_at);
      const now = new Date();
      const hoursUntilSession = (scheduledAt - now) / (1000 * 60 * 60);

      if (hoursUntilSession < 24) {
        throw new Error('TOO_CLOSE_TO_SESSION');
      }

      // Create reschedule request record
      const requestQuery = `
        INSERT INTO session_reschedule_requests (
          session_id, requested_by, reason, preferred_date, preferred_time, status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, 'pending', CURRENT_TIMESTAMP)
        RETURNING *
      `;

      const requestValues = [
        sessionId,
        'mentor',
        reason || 'Mentor requested reschedule',
        preferredDate ? new Date(preferredDate) : null,
        preferredTime || null
      ];

      const requestResult = await client.query(requestQuery, requestValues);
      const rescheduleRequest = requestResult.rows[0];

      // Create notification for mentee
      const notificationQuery = `
        INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      `;

      await client.query(notificationQuery, [
        session.mentee_id,
        'Reschedule Request from Mentor',
        `${session.mentor_first_name} ${session.mentor_last_name} has requested to reschedule your session. Please review and respond.`,
        'reschedule_request',
        'session_reschedule_request',
        rescheduleRequest.id
      ]);

      return {
        session,
        rescheduleRequest
      };
    });

    console.log('✅ Reschedule request submitted successfully:', result.rescheduleRequest.id);

    res.json({
      success: true,
      message: 'Reschedule request submitted successfully',
      data: {
        rescheduleRequest: result.rescheduleRequest
      }
    });

  } catch (error) {
    console.error('❌ Error submitting reschedule request:', error);

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
        message: 'You are not authorized to request reschedule for this session',
        code: 'UNAUTHORIZED'
      });
    }

    if (error.message === 'TOO_CLOSE_TO_SESSION') {
      return res.status(422).json({
        success: false,
        message: 'Cannot request reschedule less than 24 hours before the session',
        code: 'TOO_CLOSE_TO_SESSION'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit reschedule request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get pending reschedule requests for mentee
exports.getPendingRescheduleRequests = async (req, res) => {
  try {
    const userId = req.user.userId;

    const query = `
      SELECT
        r.*,
        s.id as session_id,
        s.title,
        s.scheduled_at,
        s.duration_minutes,
        s.price,
        s.currency,
        mentor_user.first_name as mentor_first_name,
        mentor_user.last_name as mentor_last_name,
        u.first_name as mentee_first_name,
        u.last_name as mentee_last_name
      FROM session_reschedule_requests r
      JOIN sessions s ON r.session_id = s.id
      JOIN mentors ment ON s.mentor_id = ment.id
      JOIN users m ON ment.user_id = m.id
      JOIN users u ON s.mentee_id = u.id
      WHERE s.mentee_id = $1 AND r.status = 'pending'
      ORDER BY r.created_at DESC
    `;

    const result = await db.query(query, [userId]);

    res.json({
      success: true,
      data: {
        requests: result.rows
      }
    });

  } catch (error) {
    console.error('❌ Error fetching reschedule requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reschedule requests',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Respond to reschedule request (mentee)
exports.respondToRescheduleRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action, newScheduledAt, reason } = req.body; // action: 'reschedule' or 'cancel'
    const userId = req.user.userId;

    console.log('🔄 Responding to reschedule request:', { requestId, action, userId });

    const result = await db.transaction(async (client) => {
      // Get request details and verify ownership
      const requestQuery = `
        SELECT r.*, s.*, m.user_id as mentor_user_id,
               ment.first_name as mentor_first_name, ment.last_name as mentor_last_name,
               u.first_name as mentee_first_name, u.last_name as mentee_last_name
        FROM session_reschedule_requests r
        JOIN sessions s ON r.session_id = s.id
        JOIN mentors ment_profile ON s.mentor_id = ment_profile.id
        JOIN users ment ON ment_profile.user_id = ment.id
        JOIN users u ON s.mentee_id = u.id
        WHERE r.id = $1
      `;

      const requestResult = await client.query(requestQuery, [requestId]);

      if (requestResult.rows.length === 0) {
        throw new Error('REQUEST_NOT_FOUND');
      }

      const request = requestResult.rows[0];

      if (request.mentee_id !== userId) {
        throw new Error('UNAUTHORIZED');
      }

      if (request.status !== 'pending') {
        throw new Error('REQUEST_ALREADY_RESPONDED');
      }

      // Update request status
      await client.query(
        'UPDATE session_reschedule_requests SET status = $1, responded_at = CURRENT_TIMESTAMP WHERE id = $2',
        [action === 'reschedule' ? 'approved' : 'cancelled', requestId]
      );

      if (action === 'reschedule') {
        // Reschedule the session
        if (!newScheduledAt) {
          throw new Error('NEW_TIME_REQUIRED');
        }

        // Check 24-hour rule for new time
        const newDateTime = new Date(newScheduledAt);
        const now = new Date();
        const hoursUntilNewSession = (newDateTime - now) / (1000 * 60 * 60);

        if (hoursUntilNewSession < 24) {
          throw new Error('INVALID_NEW_TIME');
        }

        // Update session time
        await client.query(
          'UPDATE sessions SET scheduled_at = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [new Date(newScheduledAt), request.session_id]
        );

        // Update meeting if exists
        if (request.meeting_id) {
          try {
            await mockZoomAPI.updateMeeting(request.meeting_id, {
              start_time: newScheduledAt
            });
          } catch (error) {
            console.warn('⚠️ Failed to update meeting:', error.message);
          }
        }

        // Notify mentor of approval
        await client.query(`
          INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          request.mentor_user_id,
          'Reschedule Request Approved',
          `${request.mentee_first_name} ${request.mentee_last_name} has approved your reschedule request. The session has been moved to ${new Date(newScheduledAt).toLocaleString()}.`,
          'reschedule_approved',
          'session',
          request.session_id
        ]);

      } else if (action === 'cancel') {
        // Cancel the session and process refund
        await client.query(
          'UPDATE sessions SET status = $1, cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['cancelled_by_mentee', request.session_id]
        );

        // Process refund
        await client.query(`
          UPDATE payments
          SET payment_status = 'refunded',
              refund_amount = amount,
              refund_reason = $2,
              refunded_at = CURRENT_TIMESTAMP
          WHERE session_id = $1
        `, [request.session_id, reason || 'Mentee cancelled due to reschedule request']);

        // Delete meeting if exists
        if (request.meeting_id) {
          try {
            await mockZoomAPI.deleteMeeting(request.meeting_id);
          } catch (error) {
            console.warn('⚠️ Failed to delete meeting:', error.message);
          }
        }

        // Notify mentor of cancellation
        await client.query(`
          INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          request.mentor_user_id,
          'Session Cancelled',
          `${request.mentee_first_name} ${request.mentee_last_name} has cancelled the session due to your reschedule request. A full refund has been processed.`,
          'session_cancelled',
          'session',
          request.session_id
        ]);
      }

      return { request, action };
    });

    console.log('✅ Reschedule request response processed:', action);

    res.json({
      success: true,
      message: `Reschedule request ${action === 'reschedule' ? 'approved' : 'cancelled'} successfully`,
      data: {
        action,
        request: result.request
      }
    });

  } catch (error) {
    console.error('❌ Error responding to reschedule request:', error);

    if (error.message === 'REQUEST_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Reschedule request not found',
        code: 'REQUEST_NOT_FOUND'
      });
    }

    if (error.message === 'UNAUTHORIZED') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to respond to this request',
        code: 'UNAUTHORIZED'
      });
    }

    if (error.message === 'REQUEST_ALREADY_RESPONDED') {
      return res.status(422).json({
        success: false,
        message: 'This request has already been responded to',
        code: 'REQUEST_ALREADY_RESPONDED'
      });
    }

    if (error.message === 'NEW_TIME_REQUIRED') {
      return res.status(422).json({
        success: false,
        message: 'New session time is required for reschedule',
        code: 'NEW_TIME_REQUIRED'
      });
    }

    if (error.message === 'INVALID_NEW_TIME') {
       return res.status(422).json({
         success: false,
         message: 'New session time must be at least 24 hours from now',
         code: 'INVALID_NEW_TIME'
       });
     }

    res.status(500).json({
      success: false,
      message: 'Failed to respond to reschedule request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Submit reschedule request (for mentors) - Simplified: mentor requests, mentee chooses time
exports.submitRescheduleRequest = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason } = req.body;
    const userId = req.user.userId;

    console.log('🔄 Submitting reschedule request:', { sessionId, userId, reason });

    const result = await db.transaction(async (client) => {
      // Get session details and verify mentor ownership
      const sessionQuery = `
        SELECT s.*, m.user_id as mentor_user_id,
                mentor_user.first_name as mentor_first_name, mentor_user.last_name as mentor_last_name,
                u.first_name as mentee_first_name, u.last_name as mentee_last_name, u.email as mentee_email
        FROM sessions s
        JOIN mentors m ON s.mentor_id = m.id
        JOIN users mentor_user ON m.user_id = mentor_user.id
        JOIN users u ON s.mentee_id = u.id
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

      // Check if session can be rescheduled
      if (!['confirmed', 'in_progress'].includes(session.status)) {
        throw new Error('CANNOT_RESCHEDULE');
      }

      // Check if there's already a pending reschedule request
      const existingRequestQuery = `
        SELECT id FROM session_reschedule_requests
        WHERE session_id = $1 AND status = 'pending'
      `;

      const existingRequest = await client.query(existingRequestQuery, [sessionId]);

      if (existingRequest.rows.length > 0) {
        throw new Error('PENDING_REQUEST_EXISTS');
      }

      // Insert reschedule request
      const insertQuery = `
        INSERT INTO session_reschedule_requests (
          session_id, requested_by, reason
        )
        VALUES ($1, $2, $3)
        RETURNING *
      `;

      const insertResult = await client.query(insertQuery, [
        sessionId,
        'mentor',
        reason
      ]);

      const rescheduleRequest = insertResult.rows[0];

      // Create notification for mentee
      await client.query(`
        INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        session.mentee_id,
        'Reschedule Request from Mentor',
        `${session.mentor_first_name} ${session.mentor_last_name} wants to reschedule your session. Please choose a new time or decline.`,
        'reschedule_request',
        'session',
        sessionId,
        JSON.stringify({
          rescheduleRequestId: rescheduleRequest.id,
          reason
        })
      ]);

      return rescheduleRequest;
    });

    console.log('✅ Reschedule request submitted successfully:', result.id);

    // Send email notification
    try {
      const sessionData = {
        title: session.title,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes
      };
      const requesterName = `${session.mentor_first_name} ${session.mentor_last_name}`;
      await sendRescheduleRequestEmail(session.mentee_email, sessionData, requesterName);
    } catch (emailError) {
      console.warn('⚠️ Failed to send reschedule request email:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Reschedule request submitted successfully',
      data: {
        rescheduleRequest: result
      }
    });

  } catch (error) {
    console.error('❌ Error submitting reschedule request:', error);

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
        message: 'You are not authorized to reschedule this session',
        code: 'UNAUTHORIZED'
      });
    }

    if (error.message === 'CANNOT_RESCHEDULE') {
      return res.status(422).json({
        success: false,
        message: 'This session cannot be rescheduled',
        code: 'CANNOT_RESCHEDULE'
      });
    }

    if (error.message === 'PENDING_REQUEST_EXISTS') {
      return res.status(422).json({
        success: false,
        message: 'A reschedule request is already pending for this session',
        code: 'PENDING_REQUEST_EXISTS'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit reschedule request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get pending reschedule requests (for mentees)
exports.getPendingRescheduleRequests = async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log('🔍 Fetching pending reschedule requests for user:', userId);

    const query = `
      SELECT
        rr.*,
        s.id as session_id,
        s.title as session_title,
        s.scheduled_at,
        s.duration_minutes,
        m.first_name as mentor_first_name,
        m.last_name as mentor_last_name,
        m.email as mentor_email
      FROM session_reschedule_requests rr
      JOIN sessions s ON rr.session_id = s.id
      JOIN mentors mt ON s.mentor_id = mt.id
      JOIN users m ON mt.user_id = m.id
      WHERE s.mentee_id = $1 AND rr.status = 'pending'
      ORDER BY rr.created_at DESC
    `;

    const result = await db.query(query, [userId]);

    const requests = result.rows.map(request => ({
      id: request.id,
      sessionId: request.session_id,
      sessionTitle: request.session_title,
      scheduledAt: request.scheduled_at,
      durationMinutes: request.duration_minutes,
      requestedBy: request.requested_by,
      reason: request.reason,
      status: request.status,
      createdAt: request.created_at,
      mentor: {
        firstName: request.mentor_first_name,
        lastName: request.mentor_last_name,
        email: request.mentor_email
      }
    }));

    console.log(`✅ Found ${requests.length} pending reschedule requests for user ${userId}`);

    res.json({
      success: true,
      data: {
        requests,
        count: requests.length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching pending reschedule requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending reschedule requests',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Respond to reschedule request (for mentees)
exports.respondToRescheduleRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action, newScheduledAt, newDuration, timezone, reason } = req.body;
    const userId = req.user.userId;

    console.log('🔄 Responding to reschedule request:', { requestId, action, userId });

    const result = await db.transaction(async (client) => {
      // Get reschedule request details
      const requestQuery = `
        SELECT rr.*, s.*, m.user_id as mentor_user_id,
               mentor_user.first_name as mentor_first_name, mentor_user.last_name as mentor_last_name,
               mentee_user.first_name as mentee_first_name, mentee_user.last_name as mentee_last_name
        FROM session_reschedule_requests rr
        JOIN sessions s ON rr.session_id = s.id
        JOIN mentors m ON s.mentor_id = m.id
        JOIN users mentor_user ON m.user_id = mentor_user.id
        JOIN users mentee_user ON s.mentee_id = mentee_user.id
        WHERE rr.id = $1 AND rr.status = 'pending'
      `;

      const requestResult = await client.query(requestQuery, [requestId]);

      if (requestResult.rows.length === 0) {
        throw new Error('REQUEST_NOT_FOUND');
      }

      const request = requestResult.rows[0];

      if (request.mentee_id !== userId) {
        throw new Error('UNAUTHORIZED');
      }

      if (action === 'accept') {
        // Accept the reschedule - update session time
        if (!newScheduledAt) {
          throw new Error('NEW_SCHEDULED_AT_REQUIRED');
        }

        const newScheduledDateTime = new Date(newScheduledAt);

        // Validate the new time is not in the past and at least 24 hours from now
        const now = new Date();
        const hoursUntilNewSession = (newScheduledDateTime - now) / (1000 * 60 * 60);

        if (newScheduledDateTime <= now) {
          throw new Error('NEW_TIME_IN_PAST');
        }

        if (hoursUntilNewSession < 24) {
          throw new Error('NEW_TIME_TOO_SOON');
        }

        // Update session
        const updateFields = ['scheduled_at = $2'];
        const updateValues = [request.session_id, newScheduledDateTime];
        let paramCount = 2;

        if (newDuration) {
          paramCount++;
          updateFields.push(`duration_minutes = $${paramCount}`);
          updateValues.push(newDuration);
        }

        if (timezone) {
          paramCount++;
          updateFields.push(`timezone = $${paramCount}`);
          updateValues.push(timezone);
        }

        const updateQuery = `
          UPDATE sessions
          SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `;

        await client.query(updateQuery, updateValues);

        // Update request status
        await client.query(`
          UPDATE session_reschedule_requests
          SET status = 'approved', responded_by = $2, response_reason = $3, responded_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [requestId, userId, reason || 'Accepted by mentee']);

        // Create notifications
        await client.query(`
          INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          request.mentor_user_id,
          'Reschedule Request Approved',
          `Your reschedule request for the session with ${request.mentee_first_name} ${request.mentee_last_name} has been approved.`,
          'reschedule_approved',
          'session',
          request.session_id
        ]);

        return { action: 'approved', sessionId: request.session_id };

      } else if (action === 'decline') {
        // Decline the reschedule - cancel session and process refund
        await client.query(`
          UPDATE sessions
          SET status = 'cancelled_by_mentee', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [request.session_id]);

        // Update request status
        await client.query(`
          UPDATE session_reschedule_requests
          SET status = 'declined', responded_by = $2, response_reason = $3, responded_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [requestId, userId, reason || 'Declined by mentee']);

        // Process refund
        await client.query(`
          UPDATE payments
          SET payment_status = 'refunded', refund_amount = amount, refund_reason = $2, refunded_at = CURRENT_TIMESTAMP
          WHERE session_id = $1
        `, [request.session_id, 'Session rescheduled and cancelled by mentee']);

        // Create notifications
        await client.query(`
          INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          request.mentor_user_id,
          'Reschedule Request Declined',
          `Your reschedule request for the session with ${request.mentee_first_name} ${request.mentee_last_name} has been declined. The session has been cancelled.`,
          'reschedule_declined',
          'session',
          request.session_id
        ]);

        return { action: 'declined', sessionId: request.session_id };
      }

      throw new Error('INVALID_ACTION');
    });

    console.log('✅ Reschedule request response processed:', result);

    res.json({
      success: true,
      message: `Reschedule request ${result.action} successfully`,
      data: result
    });

  } catch (error) {
    console.error('❌ Error responding to reschedule request:', error);

    if (error.message === 'REQUEST_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Reschedule request not found',
        code: 'REQUEST_NOT_FOUND'
      });
    }

    if (error.message === 'UNAUTHORIZED') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to respond to this request',
        code: 'UNAUTHORIZED'
      });
    }

    if (error.message === 'INVALID_ACTION') {
      return res.status(422).json({
        success: false,
        message: 'Invalid action. Must be "accept" or "decline"',
        code: 'INVALID_ACTION'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to process reschedule response',
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

// Submit session review (mentee to mentor)
exports.submitSessionReview = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    const {
      overall_rating,
      comment
    } = req.body;

    // Validate rating if provided (optional now)
    if (overall_rating !== undefined && (typeof overall_rating !== 'number' || overall_rating < 1 || overall_rating > 5)) {
      return res.status(422).json({
        success: false,
        message: 'Rating must be between 1 and 5',
        code: 'INVALID_RATING'
      });
    }

    console.log('🔄 Submitting session review:', { sessionId, userId, overall_rating });

    const result = await db.transaction(async (client) => {
      // Verify session exists and user is the mentee
      const sessionQuery = `
        SELECT s.*, m.user_id as mentor_user_id, u.first_name as mentee_first_name, u.last_name as mentee_last_name
        FROM sessions s
        JOIN mentors m ON s.mentor_id = m.id
        JOIN users u ON s.mentee_id = u.id
        WHERE s.id = $1 AND s.status = 'completed'
      `;

      const sessionResult = await client.query(sessionQuery, [sessionId]);

      if (sessionResult.rows.length === 0) {
        throw new Error('SESSION_NOT_FOUND');
      }

      const session = sessionResult.rows[0];

      // Check if user is the mentee
      if (session.mentee_id !== userId) {
        throw new Error('UNAUTHORIZED');
      }

      // Check if mentee already reviewed this session
      const existingReviewQuery = `
        SELECT id FROM reviews
        WHERE session_id = $1 AND reviewer_type = 'mentee'
      `;

      const existingReview = await client.query(existingReviewQuery, [sessionId]);

      if (existingReview.rows.length > 0) {
        throw new Error('REVIEW_ALREADY_EXISTS');
      }

      // Insert mentee review
      const reviewQuery = `
        INSERT INTO reviews (
          session_id, mentor_id, mentee_id, reviewer_type, review_target,
          overall_rating, comment, created_at, updated_at
        )
        VALUES ($1, $2, $3, 'mentee', 'mentor', $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `;

      const reviewValues = [
        sessionId,
        session.mentor_id,
        session.mentee_id,
        overall_rating || null,
        comment || null
      ];

      console.log('Inserting review with values:', reviewValues);

      const reviewResult = await client.query(reviewQuery, reviewValues);
      const review = reviewResult.rows[0];

      // Create notification for mentor
      await client.query(`
        INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        session.mentor_user_id,
        'New Review from Mentee',
        `${session.mentee_first_name} ${session.mentee_last_name} has left a review for your session.`,
        'review_received',
        'review',
        review.id
      ]);

      return review;
    });

    console.log('✅ Session review submitted successfully:', result.id);

    res.json({
      success: true,
      message: 'Review submitted successfully',
      data: {
        review: {
          id: result.id,
          sessionId: result.session_id,
          reviewerType: result.reviewer_type,
          reviewTarget: result.review_target,
          overallRating: result.overall_rating,
          comment: result.comment,
          createdAt: result.created_at
        }
      }
    });

  } catch (error) {
    console.error('❌ Error submitting session review:', error);

    if (error.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Session not found or not completed',
        code: 'SESSION_NOT_FOUND'
      });
    }

    if (error.message === 'UNAUTHORIZED') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to review this session',
        code: 'UNAUTHORIZED'
      });
    }

    if (error.message === 'REVIEW_ALREADY_EXISTS') {
      return res.status(422).json({
        success: false,
        message: 'You have already reviewed this session',
        code: 'REVIEW_ALREADY_EXISTS'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit review',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Submit mentor-to-mentee review
exports.submitMentorReview = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    const {
      overall_rating,
      comment
    } = req.body;

    console.log('🔄 Submitting mentor review:', { sessionId, userId, overall_rating });

    const result = await db.transaction(async (client) => {
      // Verify session exists and user is the mentor
      const sessionQuery = `
        SELECT s.*, m.user_id as mentor_user_id, u.first_name as mentee_first_name, u.last_name as mentee_last_name
        FROM sessions s
        JOIN mentors m ON s.mentor_id = m.id
        JOIN users u ON s.mentee_id = u.id
        WHERE s.id = $1 AND s.status = 'completed'
      `;

      const sessionResult = await client.query(sessionQuery, [sessionId]);

      if (sessionResult.rows.length === 0) {
        throw new Error('SESSION_NOT_FOUND');
      }

      const session = sessionResult.rows[0];

      // Check if user is the mentor
      if (session.mentor_user_id !== userId) {
        throw new Error('UNAUTHORIZED');
      }

      // Check if mentor already reviewed this session
      const existingReviewQuery = `
        SELECT id FROM reviews
        WHERE session_id = $1 AND reviewer_type = 'mentor'
      `;

      const existingReview = await client.query(existingReviewQuery, [sessionId]);

      if (existingReview.rows.length > 0) {
        throw new Error('REVIEW_ALREADY_EXISTS');
      }

      // Insert mentor review with proper reviewer_type and review_target (only overall rating and comment, no detailed ratings)
      const reviewQuery = `
        INSERT INTO reviews (
          session_id, mentor_id, mentee_id, reviewer_type, review_target,
          overall_rating, comment, created_at, updated_at
        )
        VALUES ($1, $2, $3, 'mentor', 'mentee', $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `;

      const reviewValues = [
        sessionId,
        session.mentor_id,
        session.mentee_id,
        overall_rating || null,
        comment || null
      ];

      const reviewResult = await client.query(reviewQuery, reviewValues);
      const review = reviewResult.rows[0];

      // Create notification for mentee
      await client.query(`
        INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        session.mentee_id,
        'New Review from Mentor',
        `${session.mentor_first_name} ${session.mentor_last_name} has left a review for your session.`,
        'review_received',
        'review',
        review.id
      ]);

      return review;
    });

    console.log('✅ Mentor review submitted successfully:', result.id);

    res.json({
      success: true,
      message: 'Mentor review submitted successfully',
      data: {
        review: {
          id: result.id,
          sessionId: result.session_id,
          reviewerType: result.reviewer_type,
          reviewTarget: result.review_target,
          overallRating: result.overall_rating,
          comment: result.comment,
          createdAt: result.created_at
        }
      }
    });

  } catch (error) {
    console.error('❌ Error submitting mentor review:', error);

    if (error.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Session not found or not completed',
        code: 'SESSION_NOT_FOUND'
      });
    }

    if (error.message === 'UNAUTHORIZED') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to review this session',
        code: 'UNAUTHORIZED'
      });
    }

    if (error.message === 'REVIEW_ALREADY_EXISTS') {
      return res.status(422).json({
        success: false,
        message: 'You have already reviewed this session',
        code: 'REVIEW_ALREADY_EXISTS'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit mentor review',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  createSession: exports.createSession,
  getUserSessions: exports.getUserSessions,
  cancelSession: exports.cancelSession,
  rescheduleSession: exports.rescheduleSession,
  respondToRescheduleRequest: exports.respondToRescheduleRequest,
  submitRescheduleRequest: exports.submitRescheduleRequest,
  getPendingRescheduleRequests: exports.getPendingRescheduleRequests,
  updateSessionStatus: exports.updateSessionStatus,
  submitSessionReview: exports.submitSessionReview,
  submitMentorReview: exports.submitMentorReview,
  formatSessionResponse
};
