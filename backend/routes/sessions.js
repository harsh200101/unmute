const express = require('express');
const { body, param, query } = require('express-validator');
const db = require('../config/database');
const auth = require('../middleware/auth');
const { rateLimit, requireEmailVerification } = require('../middleware/auth');
const sessionController = require('../controllers/sessionController');
const { endSession } = require('../services/billingEngine');

const router = express.Router();

// Enhanced validation middleware for session operations
const createSessionValidation = [
  body('mentorId')
    .isInt({ min: 1 })
    .withMessage('Valid mentor ID is required'),
  
  body('title')
    .optional()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  
  body('sessionType')
    .optional()
    .isIn(['video', 'voice', 'chat', 'in_person'])
    .withMessage('Invalid session type'),
  
  body('scheduledAt')
    .isISO8601()
    .withMessage('Valid scheduled date and time is required')
    .custom((value) => {
      const scheduledDate = new Date(value);
      const now = new Date();
      if (scheduledDate <= now) {
        throw new Error('Scheduled time must be in the future');
      }
      return true;
    }),
  
  body('durationMinutes')
    .isInt({ min: 15, max: 480 })
    .withMessage('Duration must be between 15 and 480 minutes'),
  
  body('timezone')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Invalid timezone'),
  
  body('meetingPlatform')
    .optional()
    .isIn(['zoom', 'google_meet', 'teams', 'custom'])
    .withMessage('Invalid meeting platform')
];

const updateSessionStatusValidation = [
  param('sessionId')
    .isInt({ min: 1 })
    .withMessage('Valid session ID is required'),
  
  body('status')
    .isIn(['confirmed', 'cancelled_by_mentor', 'cancelled_by_mentee', 'in_progress', 'completed'])
    .withMessage('Invalid status'),
  
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes must be less than 1000 characters')
];

const sessionQueryValidation = [
  query('status')
    .optional()
    .isIn(['pending', 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled_by_mentee', 'cancelled_by_mentor', 'no_show_mentee', 'no_show_mentor', 'disputed', 'refunded'])
    .withMessage('Invalid status filter'),
  
  query('type')
    .optional()
    .isIn(['video', 'voice', 'chat', 'in_person'])
    .withMessage('Invalid session type filter'),
  
  query('upcoming')
    .optional()
    .isBoolean()
    .withMessage('Upcoming must be a boolean'),
  
  query('past')
    .optional()
    .isBoolean()
    .withMessage('Past must be a boolean'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

// ==========================================
// SESSION MANAGEMENT ROUTES
// ==========================================

// POST /api/sessions - Create a new session
router.post('/',
  auth,
  requireEmailVerification,
  rateLimit(10, 60 * 60 * 1000), // 10 session bookings per hour
  createSessionValidation,
  sessionController.createSession
);




// GET /api/sessions/my-sessions - Get user's sessions with comprehensive details
router.get('/my-sessions',
  auth,
  rateLimit(100, 15 * 60 * 1000), // 100 requests per 15 minutes
  sessionQueryValidation,
  sessionController.getUserSessions
);

// GET /api/sessions/details/:sessionId - Get single session details
router.get('/details/:sessionId',
  auth,
  rateLimit(50, 15 * 60 * 1000),
  [
    param('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid session ID is required')
  ],
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user.userId;

      console.log('🔍 Fetching session details:', { sessionId, userId });

      const query = `
        SELECT 
          s.*,
          mentor_user.first_name as mentor_first_name,
          mentor_user.last_name as mentor_last_name,
          mentor_user.avatar_url as mentor_avatar,
          mentor_user.email as mentor_email,
          mentee_user.first_name as mentee_first_name,
          mentee_user.last_name as mentee_last_name,
          mentee_user.avatar_url as mentee_avatar,
          mentee_user.email as mentee_email,
          m.per_minute_rate * 60 as hourly_rate,
          m.badge_level,
          m.timezone as mentor_timezone,
          p.payment_status,
          p.amount as payment_amount,
          p.currency as payment_currency,
          r.overall_rating,
          r.comment as review_comment,
          r.target_response as mentor_response,
          r.created_at as review_created_at,
          r.reviewer_type
        FROM sessions s
        INNER JOIN mentors m ON s.mentor_id = m.id
        INNER JOIN users mentor_user ON m.user_id = mentor_user.id
        INNER JOIN users mentee_user ON s.mentee_id = mentee_user.id
        LEFT JOIN payments p ON s.id = p.session_id
        LEFT JOIN reviews r ON s.id = r.session_id
        WHERE s.id = $1
          AND (s.mentee_id = $2 OR mentor_user.id = $2)
      `;

      const result = await db.query(query, [sessionId, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Session not found or access denied',
          code: 'SESSION_NOT_FOUND'
        });
      }

      const session = result.rows[0];

      // Format comprehensive session data
      const sessionData = {
        id: session.id,
        uuid: session.uuid,
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
        actualBilledAmount: parseFloat(session.actual_billed_amount || 0),
        status: session.status,
        
        // Meeting Details
        meetingPlatform: session.meeting_platform,
        meetingId: session.meeting_id,
        meetingUrl: session.meeting_url,
        meetingPassword: session.meeting_password,
        
        // Timing
        actualStartTime: session.actual_start_time,
        actualEndTime: session.actual_end_time,
        actualDurationMinutes: session.actual_duration_minutes,
        
        // Notes
        mentorNotes: session.mentor_notes,
        menteeNotes: session.mentee_notes,
        adminNotes: session.admin_notes,
        
        // Participants
        mentor: {
          id: session.mentor_id,
          firstName: session.mentor_first_name,
          lastName: session.mentor_last_name,
          fullName: `${session.mentor_first_name} ${session.mentor_last_name}`.trim(),
          avatar: session.mentor_avatar,
          email: session.mentor_email,
          hourlyRate: parseFloat(session.hourly_rate || 0),
          badgeLevel: session.badge_level,
          timezone: session.mentor_timezone
        },
        
        mentee: {
          id: session.mentee_id,
          firstName: session.mentee_first_name,
          lastName: session.mentee_last_name,
          fullName: `${session.mentee_first_name} ${session.mentee_last_name}`.trim(),
          avatar: session.mentee_avatar,
          email: session.mentee_email
        },
        
        // Payment Information
        payment: {
          status: session.payment_status,
          amount: parseFloat(session.payment_amount || 0),
          currency: session.payment_currency
        },
        
        // Review Information
        review: session.overall_rating ? {
          overallRating: session.overall_rating,
          comment: session.review_comment,
          mentorResponse: session.mentor_response,
          createdAt: session.review_created_at,
          reviewerType: session.reviewer_type
        } : null,
        
        // Action Permissions
        canCancel: ['pending', 'confirmed'].includes(session.status) &&
                    new Date(session.scheduled_at) > new Date(Date.now() + 24 * 60 * 60 * 1000),
        canReschedule: ['pending', 'confirmed', 'scheduled'].includes(session.status) &&
                        new Date(session.scheduled_at) > new Date(Date.now() + 24 * 60 * 60 * 1000),
        canReview: session.status === 'completed' && !session.overall_rating && session.mentee_id === userId,
        canStart: session.status === 'confirmed' &&
                   Math.abs(new Date(session.scheduled_at) - new Date()) < 15 * 60 * 1000, // 15 minutes window

        // Existing bookings for conflict checking (for rescheduling)
        existingBookings: [],

        // Timestamps
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        confirmedAt: session.confirmed_at,
        cancelledAt: session.cancelled_at
      };

      res.json({
        success: true,
        data: {
          session: sessionData
        }
      });

    } catch (error) {
      console.error('❌ Error fetching session details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch session details',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// PUT /api/sessions/details/:sessionId/status - Update session status (for mentors)
router.put('/details/:sessionId/status',
  auth,
  rateLimit(20, 60 * 60 * 1000), // 20 status updates per hour
  updateSessionStatusValidation,
  sessionController.updateSessionStatus
);

// DELETE /api/sessions/details/:sessionId - Cancel session
router.delete('/details/:sessionId',
  auth,
  rateLimit(10, 60 * 60 * 1000), // 10 cancellations per hour
  [
    param('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid session ID is required'),

    body('reason')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Cancellation reason must be less than 500 characters')
  ],
  sessionController.cancelSession
);

// POST /api/sessions/:sessionId/reschedule-request - Submit reschedule request (mentor)
router.post('/:sessionId/reschedule-request',
  auth,
  rateLimit(5, 60 * 60 * 1000), // 5 reschedule requests per hour
  [
    param('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid session ID is required'),

    body('reason')
      .isLength({ min: 1, max: 1000 })
      .withMessage('Reason must be between 1 and 1000 characters'),

    body('preferredDate')
      .isISO8601()
      .withMessage('Valid preferred date is required'),

    body('preferredTime')
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('Valid preferred time is required')
  ],
  sessionController.submitRescheduleRequest
);

// GET /api/sessions/reschedule-requests/pending - Get pending reschedule requests (mentee)
router.get('/reschedule-requests/pending',
  auth,
  rateLimit(30, 15 * 60 * 1000),
  sessionController.getPendingRescheduleRequests
);

// POST /api/sessions/reschedule-requests/:requestId/respond - Respond to reschedule request (mentee)
router.post('/reschedule-requests/:requestId/respond',
  auth,
  rateLimit(10, 60 * 60 * 1000),
  [
    param('requestId')
      .isInt({ min: 1 })
      .withMessage('Valid request ID is required'),

    body('action')
      .isIn(['accept', 'decline'])
      .withMessage('Action must be "accept" or "decline"'),

    body('reason')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Response reason must be less than 500 characters')
  ],
  sessionController.respondToRescheduleRequest
);

// POST /api/sessions/details/:sessionId/reschedule-request - Submit reschedule request (mentor)
router.post('/details/:sessionId/reschedule-request',
  auth,
  rateLimit(5, 60 * 60 * 1000), // 5 reschedule requests per hour
  [
    param('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid session ID is required'),

    body('reason')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Reason must be less than 500 characters'),

    body('preferredDate')
      .optional()
      .isISO8601()
      .withMessage('Valid preferred date required'),

    body('preferredTime')
      .optional()
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('Valid preferred time required (HH:MM format)')
  ],
  sessionController.submitRescheduleRequest
);

// GET /api/sessions/reschedule-requests/pending - Get pending reschedule requests (mentee)
router.get('/reschedule-requests/pending',
  auth,
  rateLimit(30, 15 * 60 * 1000), // 30 requests per 15 minutes
  sessionController.getPendingRescheduleRequests
);

// PUT /api/sessions/details/:sessionId/reschedule - Direct reschedule for mentees
router.put('/details/:sessionId/reschedule',
  auth,
  rateLimit(5, 60 * 60 * 1000), // 5 reschedules per hour
  [
    param('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid session ID is required'),

    body('newScheduledAt')
      .isISO8601()
      .withMessage('Valid new scheduled time is required'),

    body('newDurationMinutes')
      .optional()
      .isInt({ min: 15, max: 480 })
      .withMessage('Duration must be between 15 and 480 minutes'),

    body('timezone')
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage('Invalid timezone'),

    body('reason')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Reason must be less than 500 characters')
  ],
  sessionController.rescheduleSession
);



// POST /api/sessions/details/:sessionId/start - Mark session as started
router.post('/details/:sessionId/start',
  auth,
  rateLimit(20, 60 * 60 * 1000),
  [
    param('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid session ID is required')
  ],
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user.userId;

      console.log('🔄 Starting session:', { sessionId, userId });

      const result = await db.transaction(async (client) => {
        // Verify session and permissions
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

        // Check permissions (only mentor or mentee can start)
        if (session.mentee_id !== userId && session.mentor_user_id !== userId) {
          throw new Error('UNAUTHORIZED');
        }

        // Check if session can be started
        if (session.status !== 'confirmed') {
          throw new Error('INVALID_STATUS');
        }

        // Check timing (allow starting 15 minutes before/after scheduled time)
        const scheduledAt = new Date(session.scheduled_at);
        const now = new Date();
        const timeDifference = Math.abs(scheduledAt - now);
        const fifteenMinutes = 15 * 60 * 1000;

        if (timeDifference > fifteenMinutes) {
          throw new Error('NOT_TIME_YET');
        }

        // Update session status to in_progress (actual_start_time will be set when video meeting starts)
        const updateQuery = `
          UPDATE sessions
          SET status = 'in_progress',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `;

        const updateResult = await client.query(updateQuery, [sessionId]);

        // Create notification for the other party
        const isStartedByMentor = session.mentor_user_id === userId;
        const recipientId = isStartedByMentor ? session.mentee_id : session.mentor_user_id;

        await client.query(`
          INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          recipientId,
          'Session Started',
          `Your mentoring session has started. Join the meeting now!`,
          'session_started',
          'session',
          sessionId
        ]);

        return updateResult.rows[0];
      });

      console.log('✅ Session started successfully:', sessionId);

      res.json({
        success: true,
        message: 'Session started successfully',
        data: {
          sessionId: parseInt(sessionId),
          status: 'in_progress',
          actualStartTime: result.actual_start_time
        }
      });

    } catch (error) {
      console.error('❌ Error starting session:', error);

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
          message: 'You are not authorized to start this session',
          code: 'UNAUTHORIZED'
        });
      }

      if (error.message === 'INVALID_STATUS') {
        return res.status(422).json({
          success: false,
          message: 'Session cannot be started in current status',
          code: 'INVALID_STATUS'
        });
      }

      if (error.message === 'NOT_TIME_YET') {
        return res.status(422).json({
          success: false,
          message: 'Session can only be started within 15 minutes of scheduled time',
          code: 'NOT_TIME_YET'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to start session',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// POST /api/sessions/details/:sessionId/complete - Mark session as completed
router.post('/details/:sessionId/complete',
  auth,
  rateLimit(20, 60 * 60 * 1000),
  [
    param('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid session ID is required'),

    body('notes')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Notes must be less than 1000 characters')
  ],
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { notes } = req.body;
      const userId = req.user.userId;

      console.log('🔄 Completing session:', { sessionId, userId });

      const result = await db.transaction(async (client) => {
        // Verify session and permissions
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

        // Check permissions (only mentor can mark as completed)
        if (session.mentor_user_id !== userId) {
          throw new Error('UNAUTHORIZED');
        }

        // Check if session can be completed
        if (!['in_progress', 'confirmed'].includes(session.status)) {
          throw new Error('INVALID_STATUS');
        }

        // If session is still in progress, end the meeting and finalize billing
        if (session.status === 'in_progress' && session.billing_status !== 'finalized') {
          console.log('🔄 Session still in progress, ending meeting and finalizing billing...');
          console.log('🔍 Billing status before finalization:', session.billing_status);
          try {
            await endSession(sessionId, 'completed_by_mentor');
            console.log('✅ Meeting ended and billing finalized');
          } catch (billingError) {
            console.error('❌ Error ending meeting:', billingError);
            // Continue with completion even if billing fails
          }
        }

        // Calculate actual duration (use existing value if already set)
        let actualDurationMinutes = session.actual_duration_minutes;
        if (!actualDurationMinutes && session.actual_start_time) {
          const startTime = new Date(session.actual_start_time);
          const endTime = new Date();
          actualDurationMinutes = Math.round((endTime - startTime) / (1000 * 60));
        }

        // Update session status to completed
        const updateQuery = `
          UPDATE sessions
          SET status = 'completed',
              actual_end_time = COALESCE(actual_end_time, CURRENT_TIMESTAMP),
              actual_duration_minutes = COALESCE(actual_duration_minutes, $2),
              mentor_notes = COALESCE($3, mentor_notes),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `;

        const updateResult = await client.query(updateQuery, [sessionId, actualDurationMinutes, notes]);

        // Create notification for mentee
        console.log(`[SessionComplete] Creating notification for mentee ${session.mentee_id}`);
        await client.query(`
          INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          session.mentee_id,
          'Session Completed',
          `Your mentoring session has been completed. Please leave a review!`,
          'session_completed',
          'session',
          sessionId
        ]);
        console.log(`[SessionComplete] Notification created successfully for mentee`);

        return updateResult.rows[0];
      });

      console.log('✅ Session completed successfully:', sessionId);

      res.json({
        success: true,
        message: 'Session completed successfully',
        data: {
          sessionId: parseInt(sessionId),
          status: 'completed',
          actualEndTime: result.actual_end_time,
          actualDurationMinutes: result.actual_duration_minutes
        }
      });

    } catch (error) {
      console.error('❌ Error completing session:', error);

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
          message: 'Only mentors can mark sessions as completed',
          code: 'UNAUTHORIZED'
        });
      }

      if (error.message === 'INVALID_STATUS') {
        return res.status(422).json({
          success: false,
          message: 'Only in-progress sessions can be completed',
          code: 'INVALID_STATUS'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to complete session',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// POST /api/sessions/:sessionId/review - Submit mentee-to-mentor review
router.post('/:sessionId/review',
  auth,
  rateLimit(10, 60 * 60 * 1000), // 10 reviews per hour
  [
    param('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid session ID is required'),

    body('overall_rating')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('Overall rating must be between 1 and 5'),

    body('comment')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Comment must be less than 1000 characters'),

    body('is_anonymous')
      .optional()
      .isBoolean()
      .withMessage('is_anonymous must be a boolean')
  ],
  sessionController.submitSessionReview
);

// POST /api/sessions/:sessionId/mentor-review - Submit mentor-to-mentee review
router.post('/:sessionId/mentor-review',
  auth,
  rateLimit(10, 60 * 60 * 1000), // 10 reviews per hour
  [
    param('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid session ID is required'),

    body('overall_rating')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('Overall rating must be between 1 and 5'),

    body('comment')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Comment must be less than 1000 characters'),

    body('is_anonymous')
      .optional()
      .isBoolean()
      .withMessage('is_anonymous must be a boolean')
  ],
  sessionController.submitMentorReview
);

// POST /api/sessions/:sessionId/notes - Add notes for a completed session (mentor only)
router.post('/:sessionId/notes',
  auth,
  rateLimit(20, 60 * 60 * 1000), // 20 notes per hour
  [
    param('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid session ID is required'),

    body('discussionSummary')
      .optional()
      .isLength({ max: 2000 })
      .withMessage('Discussion summary must be less than 2000 characters'),

    body('keyTakeaways')
      .optional()
      .isLength({ max: 2000 })
      .withMessage('Key takeaways must be less than 2000 characters'),

    body('additionalNotes')
      .optional()
      .isLength({ max: 2000 })
      .withMessage('Additional notes must be less than 2000 characters')
  ],
  sessionController.addSessionNotes
);

// GET /api/sessions/:sessionId/notes - Get mentee notes history (mentor access)
router.get('/:sessionId/notes',
  auth,
  rateLimit(50, 15 * 60 * 1000), // 50 requests per 15 minutes
  [
    param('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid session ID is required')
  ],
  sessionController.getMenteeNotesHistory
);
// GET /api/sessions/my-sessions/stats - Get session statistics for user
router.get('/my-sessions/stats',
  auth,
  rateLimit(30, 15 * 60 * 1000),
  [
    query('timeframe')
      .optional()
      .isIn(['week', 'month', 'quarter', 'year'])
      .withMessage('Timeframe must be week, month, quarter, or year')
  ],
  async (req, res) => {
    try {
      console.log('🔍 [DEBUG] Session stats route hit');
      console.log('🔍 [DEBUG] Request headers:', {
        authorization: req.headers.authorization ? 'Bearer token present' : 'No token',
        'content-type': req.headers['content-type']
      });
      console.log('🔍 [DEBUG] User object:', req.user);

      const userId = req.user?.userId;
      const { timeframe = 'month' } = req.query;

      console.log('🔍 [DEBUG] Extracted values:', { userId, timeframe, userIdType: typeof userId });

      if (!userId) {
        console.log('❌ [DEBUG] userId is undefined or null');
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          code: 'AUTH_REQUIRED'
        });
      }

      console.log('🔍 Fetching session stats:', { userId, timeframe, userIdType: typeof userId });

      // Calculate date range based on timeframe
      const now = new Date();
      let startDate;

      switch (timeframe) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'quarter':
          const quarterStart = Math.floor(now.getMonth() / 3) * 3;
          startDate = new Date(now.getFullYear(), quarterStart, 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      console.log('🔍 Date range:', { startDate: startDate.toISOString(), endDate: now.toISOString() });

      // Get session statistics
      console.log('🔍 [DEBUG] Executing stats query with params:', [userId, startDate.toISOString()]);
      console.log('🔍 [DEBUG] userId type:', typeof userId, 'value:', userId);
      console.log('🔍 [DEBUG] startDate type:', typeof startDate.toISOString(), 'value:', startDate.toISOString());

      const statsQuery = `
        SELECT
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_sessions,
          COUNT(CASE WHEN s.status IN ('scheduled', 'confirmed') AND s.scheduled_at > CURRENT_TIMESTAMP THEN 1 END) as upcoming_sessions,
          COUNT(CASE WHEN s.status LIKE 'cancelled%' THEN 1 END) as cancelled_sessions,
          COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_sessions_count,
          ROUND(AVG(CASE WHEN s.status = 'completed' THEN s.duration_minutes END), 2) as avg_session_duration,
          COALESCE((
            SELECT SUM(wt.amount)
            FROM wallet_transactions wt
            JOIN wallets w ON wt.wallet_id = w.id
            WHERE w.user_id = $1
              AND wt.transaction_type = 'debit'
              AND wt.reference_type = 'session'
              AND wt.created_at >= $2
          ), 0) as total_spent,
          COALESCE((
            SELECT SUM(me.amount)
            FROM mentor_earnings me
            INNER JOIN mentors m2 ON me.mentor_id = m2.id
            WHERE m2.user_id = $1
              AND me.status IN ('paid', 'pending')
              AND me.created_at >= $2
          ), 0) as total_mentor_earnings
        FROM sessions s
        INNER JOIN mentors m ON s.mentor_id = m.id
        INNER JOIN users mentor_user ON m.user_id = mentor_user.id
        WHERE (s.mentee_id = $1 OR mentor_user.id = $1)
          AND s.created_at >= $2
      `;

      console.log('🔍 [DEBUG] About to execute stats query...');
      const statsResult = await db.query(statsQuery, [userId, startDate.toISOString()]);
      const stats = statsResult.rows[0] || {};

      console.log('🔍 [DEBUG] Stats query executed successfully');
      console.log('🔍 Stats query result:', { rowCount: statsResult.rows.length, stats });
      console.log('🔍 Raw stats:', stats);

      // Get recent sessions for additional insights
      console.log('🔍 [DEBUG] About to execute recent sessions query...');
      const recentSessionsQuery = `
        SELECT
          s.id, s.title, s.status, s.scheduled_at, s.session_type,
          CASE
            WHEN mentor_user.id = $1 THEN 'mentor'
            ELSE 'mentee'
          END as user_role,
          mentor_user.first_name as mentor_first_name,
          mentor_user.last_name as mentor_last_name
        FROM sessions s
        INNER JOIN mentors m ON s.mentor_id = m.id
        INNER JOIN users mentor_user ON m.user_id = mentor_user.id
        WHERE (s.mentee_id = $1 OR mentor_user.id = $1)
          AND s.created_at >= $2
        ORDER BY s.created_at DESC
        LIMIT 10
      `;

      const recentSessions = await db.query(recentSessionsQuery, [userId, startDate.toISOString()]);
      console.log('🔍 [DEBUG] Recent sessions query executed successfully, rows:', recentSessions.rows.length);

      console.log('🔍 [DEBUG] Processing stats data...');
      const processedStats = {
        totalSessions: parseInt(stats.total_sessions || 0) || 0,
        completedSessions: parseInt(stats.completed_sessions || 0) || 0,
        upcomingSessions: parseInt(stats.upcoming_sessions || 0) || 0,
        cancelledSessions: parseInt(stats.cancelled_sessions || 0) || 0,
        averageSessionDuration: parseFloat(stats.avg_session_duration || 0) || 0,
        totalSpent: parseFloat(stats.total_spent || 0) || 0,
        totalMentorEarnings: parseFloat(stats.total_mentor_earnings || 0) || 0,
        completionRate: (stats.total_sessions && parseInt(stats.total_sessions) > 0)
          ? Math.round((parseInt(stats.completed_sessions || 0) / parseInt(stats.total_sessions)) * 100)
          : 0,
        timeframe,
        dateRange: {
          start: startDate.toISOString(),
          end: now.toISOString()
        },
        recentSessions: recentSessions.rows
      };

      console.log('🔍 [DEBUG] Stats processing completed successfully');
      console.log('✅ Successfully fetched session stats:', processedStats);

      res.json({
        success: true,
        data: processedStats
      });

    } catch (error) {
      console.error('❌ Error fetching session stats:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
        userId: req.user?.userId,
        timeframe: req.query.timeframe
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch session statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/sessions/mentor/upcoming - Get upcoming sessions for mentor dashboard
router.get('/mentor/upcoming',
  auth,
  rateLimit(50, 15 * 60 * 1000),
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
  ],
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { limit = 20, page = 1 } = req.query;

      console.log('🔍 Fetching upcoming sessions for mentor:', userId);

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

      // Get total count of upcoming sessions
      const countQuery = `
        SELECT COUNT(*) as total_count
        FROM sessions s
        WHERE s.mentor_id = $1
          AND s.scheduled_at IS NOT NULL
          AND s.scheduled_at > CURRENT_TIMESTAMP
          AND s.status IN ('scheduled', 'confirmed')
      `;

      const countResult = await db.query(countQuery, [mentorId]);
      const totalCount = parseInt(countResult.rows[0].total_count);

      // Get upcoming sessions for this mentor with pagination
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const query = `
        SELECT
          s.id,
          s.uuid,
          s.title,
          s.description,
          s.scheduled_at,
          s.duration_minutes,
          s.session_type,
          s.currency,
          COALESCE(me.amount, 0) as mentor_earnings,
          s.status,
          s.meeting_url,
          s.meeting_id,
          u.first_name as mentee_first_name,
          u.last_name as mentee_last_name,
          u.avatar_url as mentee_avatar,
          u.email as mentee_email
        FROM sessions s
        LEFT JOIN mentor_earnings me ON s.id = me.session_id AND me.status = 'completed'
        INNER JOIN users u ON s.mentee_id = u.id
        WHERE s.mentor_id = $1
          AND s.scheduled_at IS NOT NULL
          AND s.scheduled_at > CURRENT_TIMESTAMP
          AND s.status IN ('scheduled', 'confirmed')
        ORDER BY s.scheduled_at ASC
        LIMIT $2 OFFSET $3
      `;

      const result = await db.query(query, [mentorId, parseInt(limit), offset]);

      const sessions = result.rows.map(session => ({
        id: session.id,
        uuid: session.uuid,
        title: session.title,
        description: session.description,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
        sessionType: session.session_type,
        price: parseFloat(session.price || 0),
        currency: session.currency,
        mentorEarnings: parseFloat(session.mentor_earnings || 0),
        actualBilledAmount: parseFloat(session.actual_billed_amount || 0),
        status: session.status,
        meetingUrl: session.meeting_url,
        meetingId: session.meeting_id,
        mentee: {
          firstName: session.mentee_first_name,
          lastName: session.mentee_last_name,
          fullName: `${session.mentee_first_name} ${session.mentee_last_name}`.trim(),
          avatar: session.mentee_avatar,
          email: session.mentee_email
        }
      }));

      console.log('✅ Upcoming sessions retrieved for mentor:', userId, 'Count:', sessions.length, 'Total:', totalCount);

      res.json({
        success: true,
        data: {
          sessions,
          count: sessions.length,
          totalCount
        },
        pagination: {
          totalItems: totalCount,
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });

    } catch (error) {
      console.error('❌ Error fetching mentor upcoming sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch upcoming sessions',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/sessions/mentor/all - Get all mentor sessions with comprehensive filtering
router.get('/mentor/all',
  auth,
  rateLimit(50, 15 * 60 * 1000),
  [
    query('status')
      .optional()
      .isIn(['pending', 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled_by_mentee', 'cancelled_by_mentor', 'no_show_mentee', 'no_show_mentor', 'disputed', 'refunded'])
      .withMessage('Invalid status filter'),

    query('type')
      .optional()
      .isIn(['video', 'voice', 'chat', 'in_person'])
      .withMessage('Invalid session type filter'),

    query('upcoming')
      .optional()
      .isBoolean()
      .withMessage('Upcoming must be a boolean'),

    query('past')
      .optional()
      .isBoolean()
      .withMessage('Past must be a boolean'),

    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  async (req, res) => {
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

      console.log('🔍 Fetching all mentor sessions:', { userId, status, type, upcoming, past });

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

      // Fixed query to prevent duplicates by using subqueries for related data
      // Default to showing only confirmed and active sessions for mentors (not pending)
      let query = `
        SELECT DISTINCT
          s.*,
          u.first_name as mentee_first_name,
          u.last_name as mentee_last_name,
          u.avatar_url as mentee_avatar,
          u.email as mentee_email,
          p.payment_status,
          p.amount as payment_amount,
          r.overall_rating,
          r.comment as review_comment,
          rr.id as reschedule_request_id,
          rr.status as reschedule_request_status,
          rr.reason as reschedule_request_reason
        FROM sessions s
        INNER JOIN users u ON s.mentee_id = u.id
        LEFT JOIN payments p ON s.id = p.session_id
        LEFT JOIN reviews r ON s.id = r.session_id AND r.is_hidden = false AND r.reviewer_type = 'mentee'
        LEFT JOIN session_reschedule_requests rr ON s.id = rr.session_id AND rr.status = 'pending'
        WHERE s.mentor_id = $1
          AND s.status IN ('confirmed', 'in_progress', 'completed', 'cancelled_by_mentee', 'cancelled_by_mentor')
      `;

      const params = [mentorId];
      let paramCount = 1;

      // Status filter - handle multiple statuses
      if (status) {
        // Split by comma and handle multiple statuses
        const statusArray = status.split(',').map(s => s.trim());
        if (statusArray.length > 1) {
          const placeholders = statusArray.map((_, i) => `$${paramCount + i + 1}`).join(',');
          query += ` AND s.status IN (${placeholders})`;
          params.push(...statusArray);
          paramCount += statusArray.length;
        } else {
          paramCount++;
          query += ` AND s.status = $${paramCount}`;
          params.push(status);
        }
      }

      // Session type filter
      if (type) {
        paramCount++;
        query += ` AND s.session_type = $${paramCount}`;
        params.push(type);
      }

      // Upcoming sessions
      if (upcoming === 'true') {
        query += ` AND s.scheduled_at > CURRENT_TIMESTAMP AND s.status IN ('scheduled', 'confirmed')`;
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

      // Get total count (without duplicates)
      let countQuery = `
        SELECT COUNT(DISTINCT s.id) as total
        FROM sessions s
        WHERE s.mentor_id = $1
          AND s.scheduled_at IS NOT NULL
          AND s.status IN ('confirmed', 'in_progress', 'completed', 'cancelled_by_mentee', 'cancelled_by_mentor')
      `;

      const countParams = [mentorId];
      let countParamCount = 1;

      if (status) {
        // Split by comma and handle multiple statuses for count query too
        const statusArray = status.split(',').map(s => s.trim());
        if (statusArray.length > 1) {
          const placeholders = statusArray.map((_, i) => `$${countParamCount + i + 1}`).join(',');
          countQuery += ` AND s.status IN (${placeholders})`;
          countParams.push(...statusArray);
          countParamCount += statusArray.length;
        } else {
          countParamCount++;
          countQuery += ` AND s.status = $${countParamCount}`;
          countParams.push(status);
        }
      }

      if (type) {
        countParamCount++;
        countQuery += ` AND s.session_type = $${countParamCount}`;
        countParams.push(type);
      }

      if (upcoming === 'true') {
        countQuery += ` AND s.scheduled_at > CURRENT_TIMESTAMP AND s.status IN ('scheduled', 'confirmed')`;
      }

      if (past === 'true') {
        countQuery += ` AND s.scheduled_at < CURRENT_TIMESTAMP`;
      }

      const countResult = await db.query(countQuery, countParams);
      const totalSessions = parseInt(countResult.rows[0].total);

      const sessions = result.rows.map(session => ({
        id: session.id,
        uuid: session.uuid,
        title: session.title,
        description: session.description,
        sessionType: session.session_type,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
        timezone: session.timezone,
        currency: session.currency,
        mentorEarnings: parseFloat(session.mentor_earnings || 0),
        actualBilledAmount: parseFloat(session.actual_billed_amount || 0),
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

        // Mentee info
        mentee: {
          id: session.mentee_id,
          firstName: session.mentee_first_name,
          lastName: session.mentee_last_name,
          fullName: `${session.mentee_first_name} ${session.mentee_last_name}`.trim(),
          avatar: session.mentee_avatar,
          email: session.mentee_email
        },

        // Payment info
        payment: {
          status: session.payment_status,
          amount: parseFloat(session.payment_amount || 0)
        },

        // Review info
        review: session.overall_rating ? {
          overallRating: session.overall_rating,
          comment: session.review_comment
        } : null,

        // Reschedule request info
        rescheduleRequest: session.reschedule_request_id ? {
          id: session.reschedule_request_id,
          status: session.reschedule_request_status,
          reason: session.reschedule_request_reason
        } : null,

        // Action permissions for mentors
        canReschedule: ['confirmed', 'in_progress'].includes(session.status) &&
                         new Date(session.scheduled_at) > new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours notice for mentors
        canCancel: ['confirmed', 'in_progress'].includes(session.status) &&
                     new Date(session.scheduled_at) > new Date(Date.now() + 24 * 60 * 60 * 1000),
        canStart: session.status === 'confirmed' &&
                   Math.abs(new Date(session.scheduled_at) - new Date()) < 15 * 60 * 1000,
        canComplete: session.status === 'in_progress',
        canReview: false, // Mentors don't review, they receive reviews

        isUpcoming: new Date(session.scheduled_at) > new Date(),
        isPast: new Date(session.scheduled_at) < new Date()
      }));

      console.log(`✅ Found ${sessions.length} mentor sessions for user ${userId}`);

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
            pending: sessions.filter(s => s.status === 'pending').length,
            confirmed: sessions.filter(s => s.status === 'confirmed').length,
            cancelled: sessions.filter(s => s.status.includes('cancelled')).length
          }
        }
      });

    } catch (error) {
      console.error('❌ Error fetching mentor sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch mentor sessions',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/sessions/mentee/recent - Get recent sessions for mentee dashboard
router.get('/mentee/recent',
  auth,
  rateLimit(30, 15 * 60 * 1000),
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('Limit must be between 1 and 20')
  ],
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { limit = 3 } = req.query;

      console.log('🔍 Fetching recent sessions for mentee:', userId);

      // Get recent sessions for this mentee
      const query = `
        SELECT
          s.id,
          s.uuid,
          s.title,
          s.scheduled_at,
          s.actual_end_time as completed_at,
          s.status,
          s.actual_billed_amount,
          (m.per_minute_rate * s.duration_minutes) as price,
          s.actual_duration_minutes,
          m.per_minute_rate * 60 as hourly_rate,
          mentor_user.first_name as mentor_first_name,
          mentor_user.last_name as mentor_last_name,
          mentor_user.avatar_url as mentor_avatar,
          r.overall_rating,
          r.comment as review_comment
        FROM sessions s
        INNER JOIN mentors m ON s.mentor_id = m.id
        INNER JOIN users mentor_user ON m.user_id = mentor_user.id
        LEFT JOIN reviews r ON s.id = r.session_id AND r.is_hidden = false AND r.reviewer_type = 'mentee'
        WHERE s.mentee_id = $1
          AND s.scheduled_at IS NOT NULL
          AND s.status IN ('completed', 'cancelled_by_mentee', 'cancelled_by_mentor')
        ORDER BY s.scheduled_at DESC
        LIMIT $2
      `;

      const result = await db.query(query, [userId, parseInt(limit)]);

      const sessions = result.rows.map(session => ({
        id: session.id,
        uuid: session.uuid,
        title: session.title,
        scheduledAt: session.scheduled_at,
        completedAt: session.completed_at,
        status: session.status,
        price: parseFloat(session.price || 0),
        actualBilledAmount: parseFloat(session.actual_billed_amount || 0),
        actualDurationMinutes: session.actual_duration_minutes,
        mentor: {
          firstName: session.mentor_first_name,
          lastName: session.mentor_last_name,
          fullName: `${session.mentor_first_name} ${session.mentor_last_name}`.trim(),
          avatar: session.mentor_avatar,
          hourlyRate: parseFloat(session.hourly_rate || 0)
        },
        review: session.overall_rating ? {
          overallRating: session.overall_rating,
          comment: session.review_comment,
          reviewerType: 'mentee'
        } : null
      }));

      console.log('✅ Recent sessions retrieved for mentee:', userId, 'Count:', sessions.length);

      res.json({
        success: true,
        data: {
          sessions,
          count: sessions.length
        }
      });

    } catch (error) {
      console.error('❌ Error fetching mentee recent sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch recent sessions',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/sessions/mentor/recent - Get recent sessions for mentor dashboard
router.get('/mentor/recent',
  auth,
  rateLimit(30, 15 * 60 * 1000),
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('Limit must be between 1 and 20')
  ],
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { limit = 3 } = req.query;

      console.log('🔍 Fetching recent sessions for mentor:', userId);

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

      // Get recent sessions for this mentor
      const query = `
        SELECT
          s.id,
          s.uuid,
          s.title,
          s.scheduled_at,
          s.actual_end_time as completed_at,
          s.status,
          s.actual_billed_amount,
          COALESCE(me.amount, 0) as mentor_earnings,
          s.actual_duration_minutes,
          u.first_name as mentee_first_name,
          u.last_name as mentee_last_name,
          u.avatar_url as mentee_avatar,
          r.overall_rating,
          r.comment as review_comment
        FROM sessions s
        LEFT JOIN mentor_earnings me ON s.id = me.session_id AND me.status = 'completed'
        INNER JOIN users u ON s.mentee_id = u.id
        LEFT JOIN reviews r ON s.id = r.session_id AND r.is_hidden = false
        WHERE s.mentor_id = $1
          AND s.scheduled_at IS NOT NULL
          AND s.status IN ('completed', 'cancelled_by_mentee', 'cancelled_by_mentor')
        ORDER BY s.scheduled_at DESC
        LIMIT $2
      `;

      const result = await db.query(query, [mentorId, parseInt(limit)]);

      const sessions = result.rows.map(session => ({
        id: session.id,
        uuid: session.uuid,
        title: session.title,
        scheduledAt: session.scheduled_at,
        completedAt: session.completed_at,
        status: session.status,
        mentorEarnings: parseFloat(session.mentor_earnings || 0),
        actualBilledAmount: parseFloat(session.actual_billed_amount || 0),
        actualDurationMinutes: session.actual_duration_minutes,
        mentee: {
          firstName: session.mentee_first_name,
          lastName: session.mentee_last_name,
          fullName: `${session.mentee_first_name} ${session.mentee_last_name}`.trim(),
          avatar: session.mentee_avatar
        },
        review: session.overall_rating ? {
          overallRating: session.overall_rating,
          comment: session.review_comment,
          reviewerType: session.reviewer_type
        } : null
      }));

      console.log('✅ Recent sessions retrieved for mentor:', userId, 'Count:', sessions.length);

      res.json({
        success: true,
        data: {
          sessions,
          count: sessions.length
        }
      });

    } catch (error) {
      console.error('❌ Error fetching mentor recent sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch recent sessions',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/sessions/mentor/all - Get all mentor sessions with filtering and pagination
router.get('/mentor/all',
  auth,
  rateLimit(50, 15 * 60 * 1000),
  [
    query('status')
      .optional()
      .isIn(['pending', 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled_by_mentee', 'cancelled_by_mentor', 'no_show_mentee', 'no_show_mentor', 'disputed', 'refunded'])
      .withMessage('Invalid status filter'),

    query('type')
      .optional()
      .isIn(['video', 'voice', 'chat', 'in_person'])
      .withMessage('Invalid session type filter'),

    query('upcoming')
      .optional()
      .isBoolean()
      .withMessage('Upcoming must be a boolean'),

    query('past')
      .optional()
      .isBoolean()
      .withMessage('Past must be a boolean'),

    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { status, type, upcoming, past, page = 1, limit = 10 } = req.query;

      console.log('🔍 Fetching mentor sessions:', { userId, status, type, upcoming, past });

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

      // Build query for mentor sessions
      let query = `
        SELECT
          s.*,
          u.first_name as mentee_first_name,
          u.last_name as mentee_last_name,
          u.avatar_url as mentee_avatar,
          u.email as mentee_email,
          p.payment_status,
          p.amount as payment_amount,
          r.overall_rating as session_rating,
          r.comment as session_review
        FROM sessions s
        INNER JOIN users u ON s.mentee_id = u.id
        LEFT JOIN payments p ON s.id = p.session_id
        LEFT JOIN reviews r ON s.id = r.session_id
        WHERE s.mentor_id = $1
          AND s.scheduled_at IS NOT NULL
      `;

      const params = [mentorId];
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
      const offset = (parseInt(page) - 1) * parseInt(limit);
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
        FROM sessions s
        WHERE s.mentor_id = $1
          AND s.scheduled_at IS NOT NULL
      `;

      const countParams = [mentorId];
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

      // Format sessions
      const sessions = result.rows.map(session => ({
        id: session.id,
        uuid: session.uuid,
        title: session.title,
        description: session.description,
        sessionType: session.session_type,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
        timezone: session.timezone,
        currency: session.currency,
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

        // Mentee info
        mentee: {
          firstName: session.mentee_first_name,
          lastName: session.mentee_last_name,
          fullName: `${session.mentee_first_name} ${session.mentee_last_name}`.trim(),
          avatar: session.mentee_avatar,
          email: session.mentee_email
        },

        // Payment info
        payment: {
          status: session.payment_status,
          amount: parseFloat(session.payment_amount || 0)
        },

        // Review info
        review: session.session_rating ? {
          overallRating: session.session_rating,
          comment: session.session_review,
          reviewerType: session.review_reviewer_type
        } : null,

        // Computed fields
        isUpcoming: new Date(session.scheduled_at) > new Date(),
        isPast: new Date(session.scheduled_at) < new Date(),
        canCancel: ['pending', 'confirmed'].includes(session.status) &&
                  new Date(session.scheduled_at) > new Date(Date.now() + 24 * 60 * 60 * 1000),
        canReschedule: ['pending', 'confirmed'].includes(session.status) &&
                      new Date(session.scheduled_at) > new Date(Date.now() + 12 * 60 * 60 * 1000),
        canReview: session.status === 'completed' && !session.session_rating,
        canStart: session.status === 'confirmed' &&
                  Math.abs(new Date(session.scheduled_at) - new Date()) < 15 * 60 * 1000
      }));

      console.log(`✅ Found ${sessions.length} mentor sessions for user ${userId}`);

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
      console.error('❌ Error fetching mentor sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch mentor sessions',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/sessions/upcoming - Get upcoming sessions for dashboard
router.get('/upcoming',
  auth,
  rateLimit(50, 15 * 60 * 1000),
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('Limit must be between 1 and 20')
  ],
  async (req, res) => {
    try {
      console.log('🚀 UPCOMING SESSIONS ROUTE HIT');
      console.log('📋 Request headers:', {
        authorization: req.headers.authorization ? 'Bearer token present' : 'No token',
        'user-agent': req.headers['user-agent'],
        origin: req.headers.origin
      });

      const userId = req.user?.userId;
      const { limit = 5 } = req.query;

      console.log('🔍 User authentication details:', {
        userId,
        user: req.user,
        isAuthenticated: !!req.user
      });

      console.log('🔍 Request parameters:', { userId, limit, query: req.query });

      // Step 1: Check if user exists and is active
      console.log('🔍 Step 1: Checking if user exists...');
      const userCheckQuery = `
        SELECT id, first_name, last_name, email, role, is_active
        FROM users
        WHERE id = $1 AND is_active = true
      `;
      const userCheck = await db.query(userCheckQuery, [userId]);
      console.log('🔍 Step 1 Result:', {
        userFound: userCheck.rows.length > 0,
        userData: userCheck.rows[0]
      });

      if (userCheck.rows.length === 0) {
        console.log('❌ User not found or inactive');
        return res.status(404).json({
          success: false,
          message: 'User not found or inactive'
        });
      }

      // Step 2: Check total sessions count for this user
      console.log('🔍 Step 2: Checking total sessions count...');
      const totalSessionsQuery = `
        SELECT COUNT(*) as total_sessions
        FROM sessions s
        INNER JOIN mentors m ON s.mentor_id = m.id
        INNER JOIN users mentor_user ON m.user_id = mentor_user.id
        WHERE (s.mentee_id = $1 OR mentor_user.id = $1)
      `;
      const totalSessions = await db.query(totalSessionsQuery, [userId]);
      console.log('🔍 Step 2 Result:', {
        totalSessions: totalSessions.rows[0].total_sessions
      });

      // Step 3: Check upcoming sessions specifically
      console.log('🔍 Step 3: Checking upcoming sessions...');
      const upcomingCountQuery = `
        SELECT COUNT(*) as upcoming_count
        FROM sessions s
        INNER JOIN mentors m ON s.mentor_id = m.id
        INNER JOIN users mentor_user ON m.user_id = mentor_user.id
        WHERE (s.mentee_id = $1 OR mentor_user.id = $1)
          AND s.scheduled_at > CURRENT_TIMESTAMP
          AND s.status IN ('scheduled', 'confirmed')
      `;
      const upcomingCount = await db.query(upcomingCountQuery, [userId]);
      console.log('🔍 Step 3 Result:', {
        upcomingCount: upcomingCount.rows[0].upcoming_count
      });

      // Step 4: Get current timestamp for debugging
      console.log('🔍 Step 4: Current database timestamp...');
      const currentTimeQuery = `SELECT CURRENT_TIMESTAMP as current_time, NOW() as now_time`;
      const currentTime = await db.query(currentTimeQuery);
      console.log('🔍 Step 4 Result:', {
        currentTimestamp: currentTime.rows[0].current_time,
        nowTime: currentTime.rows[0].now_time
      });

      // Step 5: Execute the main query with detailed logging
      console.log('🔍 Step 5: Executing main upcoming sessions query...');
      const query = `
        SELECT
          s.id,
          s.uuid,
          s.title,
          s.scheduled_at,
          s.duration_minutes,
          s.session_type,
          s.meeting_url,
          s.status,
          s.actual_billed_amount,
          s.created_at,
          mentor_user.id as mentor_user_id,
          mentor_user.first_name as mentor_first_name,
          mentor_user.last_name as mentor_last_name,
          mentor_user.avatar_url as mentor_avatar,
          mentee_user.id as mentee_user_id,
          mentee_user.first_name as mentee_first_name,
          mentee_user.last_name as mentee_last_name,
          mentee_user.avatar_url as mentee_avatar,
          CASE
            WHEN mentor_user.id = $1 THEN 'mentor'
            ELSE 'mentee'
          END as user_role
        FROM sessions s
        INNER JOIN mentors m ON s.mentor_id = m.id
        INNER JOIN users mentor_user ON m.user_id = mentor_user.id
        INNER JOIN users mentee_user ON s.mentee_id = mentee_user.id
        WHERE (s.mentee_id = $1 OR mentor_user.id = $1)
          AND s.scheduled_at > CURRENT_TIMESTAMP
          AND s.status IN ('scheduled', 'confirmed')
        ORDER BY s.scheduled_at ASC
        LIMIT $2
      `;

      console.log('🔍 Step 5: Query parameters:', [userId, parseInt(limit)]);
      console.log('🔍 Step 5: Executing query...');

      const result = await db.query(query, [userId, parseInt(limit)]);

      console.log('🔍 Step 5 Result:', {
        rowCount: result.rows.length,
        command: result.command,
        rowMode: result.rowMode,
        fields: result.fields?.map(f => f.name)
      });

      // Log each session found
      result.rows.forEach((session, index) => {
        console.log(`🔍 Session ${index + 1}:`, {
          id: session.id,
          title: session.title,
          scheduledAt: session.scheduled_at,
          status: session.status,
          userRole: session.user_role,
          mentorId: session.mentor_user_id,
          menteeId: session.mentee_user_id
        });
      });

      const upcomingSessions = result.rows.map(session => ({
        id: session.id,
        uuid: session.uuid,
        title: session.title,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
        sessionType: session.session_type,
        meetingUrl: session.meeting_url,
        status: session.status,
        actualBilledAmount: parseFloat(session.actual_billed_amount || 0),
        userRole: session.user_role,
        participant: session.user_role === 'mentor' ? {
          firstName: session.mentee_first_name,
          lastName: session.mentee_last_name,
          avatar: session.mentee_avatar,
          role: 'mentee'
        } : {
          firstName: session.mentor_first_name,
          lastName: session.mentor_last_name,
          avatar: session.mentor_avatar,
          role: 'mentor'
        },
        timeUntilSession: Math.round((new Date(session.scheduled_at) - new Date()) / (1000 * 60)), // minutes
        canJoin: Math.abs(new Date(session.scheduled_at) - new Date()) < 15 * 60 * 1000 // 15 minutes window
      }));

      console.log('✅ Successfully processed', upcomingSessions.length, 'upcoming sessions for user', userId);
      console.log('📊 Final response data:', {
        success: true,
        count: upcomingSessions.length,
        sessions: upcomingSessions.map(s => ({
          id: s.id,
          title: s.title,
          scheduledAt: s.scheduledAt,
          status: s.status
        }))
      });

      res.json({
        success: true,
        data: {
          upcomingSessions,
          count: upcomingSessions.length
        }
      });

    } catch (error) {
      console.error('❌ CRITICAL ERROR in upcoming sessions route:');
      console.error('❌ Error message:', error.message);
      console.error('❌ Error code:', error.code);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ Full error object:', error);

      res.status(500).json({
        success: false,
        message: 'Failed to fetch upcoming sessions',
        error: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          code: error.code,
          stack: error.stack
        } : 'Internal server error'
      });
    }
  }
);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Sessions API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;
