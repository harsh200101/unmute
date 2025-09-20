const express = require('express');
const { body, param, query } = require('express-validator');
const db = require('../config/database');
const auth = require('../middleware/auth');
const { rateLimit, requireEmailVerification } = require('../middleware/auth');
const sessionController = require('../controllers/sessionController');

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

// GET /api/sessions/:sessionId - Get single session details
router.get('/:sessionId',
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
          m.hourly_rate,
          m.badge_level,
          m.timezone as mentor_timezone,
          p.payment_status,
          p.amount as payment_amount,
          p.currency as payment_currency,
          r.overall_rating,
          r.communication_rating,
          r.knowledge_rating,
          r.helpfulness_rating,
          r.comment as review_comment,
          r.mentor_response,
          r.created_at as review_created_at
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
          communicationRating: session.communication_rating,
          knowledgeRating: session.knowledge_rating,
          helpfulnessRating: session.helpfulness_rating,
          comment: session.review_comment,
          mentorResponse: session.mentor_response,
          createdAt: session.review_created_at
        } : null,
        
        // Action Permissions
        canCancel: ['pending', 'confirmed'].includes(session.status) && 
                   new Date(session.scheduled_at) > new Date(Date.now() + 24 * 60 * 60 * 1000),
        canReschedule: ['pending', 'confirmed'].includes(session.status) && 
                       new Date(session.scheduled_at) > new Date(Date.now() + 48 * 60 * 60 * 1000),
        canReview: session.status === 'completed' && !session.overall_rating && session.mentee_id === userId,
        canStart: session.status === 'confirmed' && 
                  Math.abs(new Date(session.scheduled_at) - new Date()) < 15 * 60 * 1000, // 15 minutes window
        
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

// PUT /api/sessions/:sessionId/status - Update session status (for mentors)
router.put('/:sessionId/status',
  auth,
  rateLimit(20, 60 * 60 * 1000), // 20 status updates per hour
  updateSessionStatusValidation,
  sessionController.updateSessionStatus
);

// DELETE /api/sessions/:sessionId - Cancel session
router.delete('/:sessionId',
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

// POST /api/sessions/:sessionId/start - Mark session as started
router.post('/:sessionId/start',
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

        // Update session status to in_progress
        const updateQuery = `
          UPDATE sessions 
          SET status = 'in_progress',
              actual_start_time = CURRENT_TIMESTAMP,
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

// POST /api/sessions/:sessionId/complete - Mark session as completed
router.post('/:sessionId/complete',
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
        if (session.status !== 'in_progress') {
          throw new Error('INVALID_STATUS');
        }

        // Calculate actual duration
        const startTime = new Date(session.actual_start_time);
        const endTime = new Date();
        const actualDurationMinutes = Math.round((endTime - startTime) / (1000 * 60));

        // Update session status to completed
        const updateQuery = `
          UPDATE sessions 
          SET status = 'completed',
              actual_end_time = CURRENT_TIMESTAMP,
              actual_duration_minutes = $2,
              mentor_notes = COALESCE($3, mentor_notes),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `;

        const updateResult = await client.query(updateQuery, [sessionId, actualDurationMinutes, notes]);

        // Create notification for mentee
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
      const userId = req.user.userId;
      const { limit = 5 } = req.query;

      console.log('🔍 Fetching upcoming sessions:', { userId, limit });

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
          mentor_user.first_name as mentor_first_name,
          mentor_user.last_name as mentor_last_name,
          mentor_user.avatar_url as mentor_avatar,
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

      const result = await db.query(query, [userId, parseInt(limit)]);

      const upcomingSessions = result.rows.map(session => ({
        id: session.id,
        uuid: session.uuid,
        title: session.title,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
        sessionType: session.session_type,
        meetingUrl: session.meeting_url,
        status: session.status,
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

      res.json({
        success: true,
        data: {
          upcomingSessions,
          count: upcomingSessions.length
        }
      });

    } catch (error) {
      console.error('❌ Error fetching upcoming sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch upcoming sessions',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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
