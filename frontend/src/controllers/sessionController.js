import { apiClient } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

/**
 * Session Controller - Handles all session-related API operations
 * Integrates with backend API endpoints for comprehensive session management
 */
class SessionController {
  constructor() {
    this.pendingRequests = new Map(); // Track pending requests to prevent duplicates
  }

  /**
   * Prevent duplicate requests within a time window
   * @param {string} requestKey - Unique key for the request
   * @param {number} ttl - Time to live in milliseconds (default: 3000ms)
   * @param {boolean} force - Force the request even if duplicate (for retries)
   * @returns {boolean} - True if request should proceed, false if duplicate
   */
  shouldMakeRequest(requestKey, ttl = 3000, force = false) {
    const now = Date.now();
    const lastRequest = this.pendingRequests.get(requestKey);

    if (!force && lastRequest && (now - lastRequest) < ttl) {
      console.log(`🚫 DUPLICATE REQUEST BLOCKED: ${requestKey} (${now - lastRequest}ms ago)`);
      return false;
    }

    this.pendingRequests.set(requestKey, now);

    // Clean up old entries after TTL + buffer
    setTimeout(() => {
      this.pendingRequests.delete(requestKey);
    }, ttl + 1000);

    return true;
  }
  
  /**
   * Create a new session booking
   * @param {Object} sessionData - Session booking data
   * @returns {Promise<Object>} Created session with payment intent
   */
  async createSession(sessionData) {
    try {
      const response = await apiClient.post('/sessions', {
        mentorId: sessionData.mentorId,
        title: sessionData.title,
        description: sessionData.description,
        sessionType: sessionData.sessionType || 'video',
        scheduledAt: sessionData.scheduledAt,
        durationMinutes: sessionData.durationMinutes,
        timezone: sessionData.timezone || 'UTC',
        menteeNotes: sessionData.notes
      });

      const session = response.data.data;
      toast.success('Session booked successfully!');
      return {
        success: true,
        session,
        paymentIntent: session.payment_intent
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to book session';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Get user's sessions with filtering and pagination
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Sessions array with pagination
   */
  async getMySessions(filters = {}) {
    try {
      const params = new URLSearchParams();
      
      // Add filters to params
      if (filters.status) params.append('status', filters.status);
      if (filters.type) params.append('type', filters.type);
      if (filters.upcoming) params.append('upcoming', filters.upcoming);
      if (filters.past) params.append('past', filters.past);
      if (filters.page) params.append('page', filters.page);
      if (filters.limit) params.append('limit', filters.limit);

      const response = await apiClient.get(`/sessions/my-sessions?${params}`);
      return {
        success: true,
        sessions: response.data.data,
        pagination: response.data.pagination
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to fetch sessions';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Get detailed session information
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Detailed session data
   */
  async getSessionDetails(sessionId) {
    try {
      const response = await apiClient.get(`/sessions/${sessionId}`);
      return {
        success: true,
        session: response.data.data
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to fetch session details';
      console.error('Session details error:', errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Update session status (mentor only)
   * @param {string} sessionId - Session ID
   * @param {string} status - New status
   * @param {Object} additionalData - Additional update data
   * @returns {Promise<Object>} Updated session
   */
  async updateSessionStatus(sessionId, status, additionalData = {}) {
    try {
      const response = await apiClient.put(`/sessions/${sessionId}/status`, {
        status,
        ...additionalData
      });

      const session = response.data.data;
      toast.success(`Session status updated to ${status.replace(/_/g, ' ')}`);
      return {
        success: true,
        session
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to update session status';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Cancel a session
   * @param {string} sessionId - Session ID
   * @param {string} reason - Cancellation reason
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelSession(sessionId, reason = '') {
    try {
      const response = await apiClient.delete(`/sessions/${sessionId}`, {
        data: { reason }
      });

      toast.success('Session cancelled successfully');
      return {
        success: true,
        refundInfo: response.data.refundInfo,
        session: response.data.data
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to cancel session';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Start a session (mentor only)
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Started session data
   */
  async startSession(sessionId) {
    try {
      const response = await apiClient.post(`/sessions/${sessionId}/start`);
      const session = response.data.data;
      
      toast.success('Session started! Participants have been notified.');
      return {
        success: true,
        session,
        meetingUrl: session.meeting_url
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to start session';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Complete a session (mentor only)
   * @param {string} sessionId - Session ID
   * @param {Object} completionData - Session completion data
   * @returns {Promise<Object>} Completed session data
   */
  async completeSession(sessionId, completionData = {}) {
    try {
      const response = await apiClient.post(`/sessions/${sessionId}/complete`, {
        mentor_notes: completionData.mentorNotes,
        actual_duration_minutes: completionData.actualDuration,
        session_summary: completionData.summary
      });

      const session = response.data.data;
      toast.success('Session completed successfully!');
      return {
        success: true,
        session
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to complete session';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Join a session
   * @param {string} sessionId - Session ID
   * @param {string} meetingUrl - Meeting URL
   * @returns {Promise<Object>} Join session result
   */
  async joinSession(sessionId, meetingUrl) {
    try {
      // Track session join
      await apiClient.post(`/sessions/${sessionId}/join`);
      
      // Open meeting in new tab
      window.open(meetingUrl, '_blank', 'noopener,noreferrer');
      
      toast.success('Joining session...');
      return {
        success: true,
        message: 'Redirected to meeting'
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to join session';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Reschedule a session
   * @param {string} sessionId - Session ID
   * @param {Object} rescheduleData - New scheduling data
   * @returns {Promise<Object>} Rescheduled session
   */
  async rescheduleSession(sessionId, rescheduleData) {
    try {
      const response = await apiClient.put(`/sessions/${sessionId}/reschedule`, {
        new_scheduled_at: rescheduleData.newScheduledAt,
        new_duration_minutes: rescheduleData.newDuration,
        timezone: rescheduleData.timezone,
        reason: rescheduleData.reason
      });

      const session = response.data.data;
      toast.success('Session rescheduled successfully!');
      return {
        success: true,
        session
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to reschedule session';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Add or update session notes
   * @param {string} sessionId - Session ID
   * @param {Object} notesData - Notes data
   * @returns {Promise<Object>} Updated session
   */
  async updateSessionNotes(sessionId, notesData) {
    try {
      const response = await apiClient.put(`/sessions/${sessionId}/notes`, {
        mentor_notes: notesData.mentorNotes,
        mentee_notes: notesData.menteeNotes
      });

      const session = response.data.data;
      toast.success('Session notes updated successfully!');
      return {
        success: true,
        session
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to update session notes';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Get upcoming sessions for dashboard
   * @param {number} limit - Number of sessions to fetch
   * @returns {Promise<Object>} Upcoming sessions
   */
  async getUpcomingSessions(limit = 5, force = false) {
    const requestKey = `upcoming-${limit}`;

    // Prevent duplicate requests unless forced
    if (!force && !this.shouldMakeRequest(requestKey, 2000)) {
      console.log('🚫 FRONTEND: Duplicate upcoming sessions request blocked');
      throw new Error('Request already in progress');
    }

    // Force the request if needed
    if (force) {
      this.shouldMakeRequest(requestKey, 2000, true);
    }

    try {
      console.log('🚀 FRONTEND: Calling getUpcomingSessions with limit:', limit);
      console.log('🚀 FRONTEND: API URL:', `/sessions/upcoming?limit=${limit}`);
      console.log('🚀 FRONTEND: Full API endpoint:', `${apiClient.defaults.baseURL}/sessions/upcoming?limit=${limit}`);

      const response = await apiClient.get(`/sessions/upcoming?limit=${limit}`);

      console.log('✅ FRONTEND: API Response received');
      console.log('✅ FRONTEND: Response status:', response.status);
      console.log('✅ FRONTEND: Response data:', response.data);
      console.log('✅ FRONTEND: Sessions data:', response.data.data);

      // Fix: Extract the upcomingSessions array from the response
      const sessionsData = response.data.data;
      console.log('🔍 FRONTEND: Raw sessions data:', sessionsData);
      const upcomingSessions = sessionsData?.upcomingSessions || [];
      console.log('🔍 FRONTEND: Extracted upcoming sessions:', upcomingSessions);
      console.log('🔍 FRONTEND: Sessions count:', upcomingSessions.length);

      return {
        success: true,
        sessions: upcomingSessions,
        count: sessionsData?.count || 0
      };
    } catch (error) {
      console.error('❌ FRONTEND: Upcoming sessions error');
      console.error('❌ FRONTEND: Error message:', error.message);
      console.error('❌ FRONTEND: Error response:', error.response);
      console.error('❌ FRONTEND: Error status:', error.response?.status);
      console.error('❌ FRONTEND: Error data:', error.response?.data);
      console.error('❌ FRONTEND: Error config:', error.config);

      const errorMessage = error.response?.data?.message || 'Failed to fetch upcoming sessions';
      console.error('❌ FRONTEND: Final error message:', errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Get session history with analytics
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Session history and stats
   */
  async getSessionHistory(filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('start_date', filters.startDate);
      if (filters.endDate) params.append('end_date', filters.endDate);
      if (filters.mentorId) params.append('mentor_id', filters.mentorId);
      if (filters.status) params.append('status', filters.status);
      if (filters.page) params.append('page', filters.page);
      if (filters.limit) params.append('limit', filters.limit);

      const response = await apiClient.get(`/sessions/history?${params}`);
      return {
        success: true,
        sessions: response.data.data,
        analytics: response.data.analytics,
        pagination: response.data.pagination
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to fetch session history';
      console.error('Session history error:', errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Submit session review
   * @param {string} sessionId - Session ID
   * @param {Object} reviewData - Review data
   * @returns {Promise<Object>} Created review
   */
  async submitSessionReview(sessionId, reviewData) {
    try {
      const response = await apiClient.post(`/sessions/${sessionId}/review`, {
        overall_rating: reviewData.overallRating,
        communication_rating: reviewData.communicationRating,
        knowledge_rating: reviewData.knowledgeRating,
        helpfulness_rating: reviewData.helpfulnessRating,
        comment: reviewData.comment,
        is_anonymous: reviewData.isAnonymous || false
      });

      const review = response.data.data;
      toast.success('Review submitted successfully!');
      return {
        success: true,
        review
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to submit review';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Request session refund
   * @param {string} sessionId - Session ID
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>} Refund request result
   */
  async requestRefund(sessionId, reason) {
    try {
      const response = await apiClient.post(`/sessions/${sessionId}/refund`, {
        reason
      });

      toast.success('Refund request submitted successfully');
      return {
        success: true,
        refundRequest: response.data.data
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to request refund';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Report a session issue
   * @param {string} sessionId - Session ID
   * @param {Object} reportData - Report data
   * @returns {Promise<Object>} Report submission result
   */
  async reportSessionIssue(sessionId, reportData) {
    try {
      const response = await apiClient.post(`/sessions/${sessionId}/report`, {
        issue_type: reportData.issueType,
        description: reportData.description,
        severity: reportData.severity || 'medium'
      });

      toast.success('Issue reported successfully. We will investigate promptly.');
      return {
        success: true,
        report: response.data.data
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to report issue';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Get session statistics for mentor/mentee
   * @param {string} timeframe - Time frame (week, month, quarter, year)
   * @returns {Promise<Object>} Session statistics
   */
  async getSessionStats(timeframe = 'month') {
    const requestKey = `stats-${timeframe}`;

    // Prevent duplicate requests
    if (!this.shouldMakeRequest(requestKey, 2000)) {
      console.log('🚫 FRONTEND: Duplicate session stats request blocked');
      throw new Error('Request already in progress');
    }

    try {
      console.log('🚀 FRONTEND: Calling getSessionStats with timeframe:', timeframe);
      const response = await apiClient.get(`/sessions/my-sessions/stats?timeframe=${timeframe}`);
      console.log('✅ FRONTEND: Session stats response:', response.data.data);

      return {
        success: true,
        stats: response.data.data
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to fetch session statistics';
      console.error('❌ FRONTEND: Session stats error:', errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Check mentor availability for booking
   * @param {string} mentorId - Mentor ID
   * @param {string} date - Date to check
   * @param {string} timezone - Timezone
   * @returns {Promise<Object>} Available time slots
   */
  async checkMentorAvailability(mentorId, date, timezone = 'UTC') {
    try {
      const response = await apiClient.get(
        `/mentors/${mentorId}/availability?date=${date}&timezone=${timezone}`
      );
      return {
        success: true,
        availability: response.data.data
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to check availability';
      console.error('Availability check error:', errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Send session reminder
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Reminder result
   */
  async sendSessionReminder(sessionId) {
    try {
      const response = await apiClient.post(`/sessions/${sessionId}/reminder`);
      toast.success('Reminder sent successfully!');
      return {
        success: true,
        result: response.data.data
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to send reminder';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Validate session timing constraints
   * @param {string} mentorId - Mentor ID
   * @param {string} scheduledAt - Scheduled time
   * @param {number} durationMinutes - Duration in minutes
   * @returns {Promise<Object>} Validation result
   */
  async validateSessionTiming(mentorId, scheduledAt, durationMinutes) {
    try {
      const response = await apiClient.post('/sessions/validate-timing', {
        mentor_id: mentorId,
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes
      });

      return {
        success: true,
        isValid: response.data.data.isValid,
        conflicts: response.data.data.conflicts,
        suggestions: response.data.data.suggestions
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to validate timing';
      throw new Error(errorMessage);
    }
  }
}

// Create singleton instance
const sessionController = new SessionController();

// Export individual methods for easier imports
export const {
  createSession,
  getMySessions,
  getSessionDetails,
  updateSessionStatus,
  cancelSession,
  startSession,
  completeSession,
  joinSession,
  rescheduleSession,
  updateSessionNotes,
  getUpcomingSessions,
  getSessionHistory,
  submitSessionReview,
  requestRefund,
  reportSessionIssue,
  getSessionStats,
  checkMentorAvailability,
  sendSessionReminder,
  validateSessionTiming
} = sessionController;

// Export the controller instance as default
export default sessionController;

// Utility functions for session management
export const sessionUtils = {
  /**
   * Check if session can be joined
   * @param {Object} session - Session object
   * @returns {boolean} Can join status
   */
  canJoinSession(session) {
    if (session.status !== 'confirmed') return false;
    const now = new Date();
    const sessionTime = new Date(session.scheduled_at);
    const timeDiff = sessionTime - now;
    // Allow joining 15 minutes before and during session
    return timeDiff <= 15 * 60 * 1000 && timeDiff >= -session.duration_minutes * 60 * 1000;
  },

  /**
   * Check if session can be cancelled
   * @param {Object} session - Session object
   * @returns {boolean} Can cancel status
   */
  canCancelSession(session) {
    const now = new Date();
    const sessionTime = new Date(session.scheduled_at);
    const hoursUntilSession = (sessionTime - now) / (1000 * 60 * 60);
    return ['pending', 'scheduled', 'confirmed'].includes(session.status) && hoursUntilSession > 24;
  },

  /**
   * Get session status color
   * @param {string} status - Session status
   * @returns {Object} Status styling
   */
  getStatusStyle(status) {
    const statusStyles = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: '⏳' },
      scheduled: { bg: 'bg-blue-100', text: 'text-blue-800', icon: '📅' },
      confirmed: { bg: 'bg-green-100', text: 'text-green-800', icon: '✅' },
      in_progress: { bg: 'bg-purple-100', text: 'text-purple-800', icon: '🔴' },
      completed: { bg: 'bg-gray-100', text: 'text-gray-800', icon: '✨' },
      cancelled_by_mentee: { bg: 'bg-red-100', text: 'text-red-800', icon: '❌' },
      cancelled_by_mentor: { bg: 'bg-red-100', text: 'text-red-800', icon: '❌' },
      no_show_mentee: { bg: 'bg-orange-100', text: 'text-orange-800', icon: '👻' },
      no_show_mentor: { bg: 'bg-orange-100', text: 'text-orange-800', icon: '👻' },
      disputed: { bg: 'bg-red-100', text: 'text-red-800', icon: '⚠️' },
      refunded: { bg: 'bg-gray-100', text: 'text-gray-800', icon: '💰' }
    };
    return statusStyles[status] || statusStyles.pending;
  },

  /**
   * Calculate refund amount based on cancellation policy
   * @param {Object} session - Session object
   * @returns {Object} Refund calculation
   */
  calculateRefund(session) {
    const now = new Date();
    const sessionTime = new Date(session.scheduled_at);
    const hoursUntilSession = (sessionTime - now) / (1000 * 60 * 60);

    let refundPercentage = 0;
    if (hoursUntilSession >= 24) {
      refundPercentage = 100; // Full refund
    } else if (hoursUntilSession >= 2) {
      refundPercentage = 50; // 50% refund
    } else {
      refundPercentage = 0; // No refund
    }

    const refundAmount = (session.price * refundPercentage) / 100;

    return {
      refundPercentage,
      refundAmount,
      hoursUntilSession
    };
  }
};
