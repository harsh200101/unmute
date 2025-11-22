const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const {
  handleUserJoin,
  handleUserLeave,
  endSession
} = require('../services/billingEngine');

const router = express.Router();

// POST /api/billing/call-started - Handle call start events (webhook from video API)
router.post('/call-started', (req, res) => {
    console.log('Received deprecated /call-started webhook. Logic is now handled by user join events.');
    res.status(200).json({ success: true, message: 'This webhook is deprecated and will be removed. Call start is now handled by the first user_joined event.' });
});

// POST /api/billing/call-ended - Handle call end events with duration (webhook from video API)
router.post('/call-ended', (req, res) => {
    console.log('Received deprecated /call-ended webhook. Logic is now handled by timers and the /end-meeting endpoint.');
    res.status(200).json({ success: true, message: 'This webhook is deprecated and will be removed. Call end is handled by timers or the mentor-initiated end endpoint.' });
});

// POST /api/billing/meeting-started - Handle meeting start (when video call begins)
router.post(
  '/meeting-started',
  [
    body('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid sessionId is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { sessionId: rawSessionId } = req.body;
      const sessionId = parseInt(rawSessionId, 10);

      console.log(`🎥 Meeting started webhook received for session ${sessionId}`);

      // Verify session exists and is confirmed
      const sessionQuery = await db.query(
        `SELECT id, status FROM sessions WHERE id = $1`,
        [sessionId]
      );

      if (sessionQuery.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      const session = sessionQuery.rows[0];

      if (session.status !== 'confirmed') {
        return res.status(400).json({
          success: false,
          message: 'Session is not in confirmed state'
        });
      }

      // Start meeting
      const result = await handleCallStarted(sessionId);

      console.log(`✅ Meeting started successfully for session ${sessionId}:`, result);

      return res.json({
        success: true,
        message: 'Meeting started successfully',
        data: result
      });

    } catch (error) {
      console.error('❌ Meeting started webhook error:', error);

      if (error.message.includes('Session not found')) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      if (error.message.includes('already started')) {
        return res.status(409).json({
          success: false,
          message: 'Meeting already started'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to start meeting',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// POST /api/billing/user-joined - Handle user join events
router.post(
  '/user-joined',
  [
    body('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid sessionId is required'),
    body('userType')
      .isIn(['mentee', 'mentor'])
      .withMessage('userType must be either mentee or mentor'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { sessionId: rawSessionId, userType } = req.body;
      const sessionId = parseInt(rawSessionId, 10);

      console.log(`👤 User ${userType} joined session ${sessionId}`);

      // Handle join
      const result = await handleUserJoin(sessionId, userType);

      console.log(`✅ User join processed for session ${sessionId}:`, result);

      return res.json({
        success: true,
        message: 'User join processed successfully',
        data: result
      });

    } catch (error) {
      console.error('❌ User join webhook error:', error);

      if (error.message.includes('Session not found')) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to process user join',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// POST /api/billing/user-left - Handle user leave events
router.post(
  '/user-left',
  [
    body('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid sessionId is required'),
    body('userType')
      .isIn(['mentee', 'mentor'])
      .withMessage('userType must be either mentee or mentor'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { sessionId: rawSessionId, userType } = req.body;
      const sessionId = parseInt(rawSessionId, 10);

      console.log(`👋 User ${userType} left session ${sessionId}`);

      // Handle leave
      const result = await handleUserLeave(sessionId, userType);

      console.log(`✅ User leave processed for session ${sessionId}:`, result);

      return res.json({
        success: true,
        message: 'User leave processed successfully',
        data: result
      });

    } catch (error) {
      console.error('❌ User leave webhook error:', error);

      if (error.message.includes('Session not found')) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to process user leave',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// POST /api/billing/meeting-ended - Handle meeting end events
router.post(
  '/meeting-ended',
  [
    body('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid sessionId is required'),
    body('reason')
      .optional()
      .isIn(['completed', 'timeout', 'both_left'])
      .withMessage('reason must be completed, timeout, or both_left'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { sessionId: rawSessionId, reason = 'completed' } = req.body;
      const sessionId = parseInt(rawSessionId, 10);

      console.log(`🏁 Meeting ended webhook received for session ${sessionId}, reason: ${reason}`);

      // Verify session exists and is in progress
      const sessionQuery = await db.query(
        `SELECT id, status, actual_billed_amount FROM sessions WHERE id = $1`,
        [sessionId]
      );

      if (sessionQuery.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      const session = sessionQuery.rows[0];

      if (session.status !== 'in_progress') {
        return res.status(400).json({
          success: false,
          message: 'Session is not in progress'
        });
      }

      if (session.actual_billed_amount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Session already billed'
        });
      }

      // End meeting
      const result = await endSession(sessionId, reason);

      console.log(`✅ Meeting ended successfully for session ${sessionId}:`, result);

      return res.json({
        success: true,
        message: 'Meeting ended successfully',
        data: result
      });

    } catch (error) {
      console.error('❌ Meeting ended webhook error:', error);

      if (error.message.includes('Session not found')) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      if (error.message.includes('already billed')) {
        return res.status(409).json({
          success: false,
          message: 'Session already billed'
        });
      }

      if (error.message.includes('Insufficient balance')) {
        return res.status(402).json({
          success: false,
          message: 'Insufficient balance for billing'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to end meeting',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Health check for billing route
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Billing API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

module.exports = router;