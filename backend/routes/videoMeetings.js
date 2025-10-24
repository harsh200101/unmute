const express = require('express');
const router = express.Router();
const videoMeetingController = require('../controllers/videoMeetingController');
const auth = require('../middleware/auth');
const { body } = require('express-validator');

// All routes require authentication
router.use(auth);

// Create video meeting for a session
router.post('/:sessionId/create', videoMeetingController.createVideoMeeting);

// Get meeting credentials for joining
router.get('/:sessionId/credentials', videoMeetingController.getMeetingCredentials);

// Log meeting events
router.post('/:sessionId/events', [
  body('eventType').isIn(['user_joined', 'user_left', 'quality_issue', 'error_occurred', 'meeting_started', 'meeting_ended']).withMessage('Invalid event type'),
  body('eventData').optional().isObject()
], videoMeetingController.logMeetingEvent);

// Send meeting invites
router.post('/:sessionId/invites', videoMeetingController.sendMeetingInvites);

// Get meeting status
router.get('/:sessionId/status', videoMeetingController.getMeetingStatus);

module.exports = router;