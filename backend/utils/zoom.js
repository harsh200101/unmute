const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');

class ZoomAPI {
  constructor() {
    // Validate required environment variables
    this.validateConfig();

    // Zoom API configuration
    this.config = {
      apiKey: process.env.ZOOM_API_KEY,
      apiSecret: process.env.ZOOM_API_SECRET,
      accountId: process.env.ZOOM_ACCOUNT_ID,
      baseURL: process.env.ZOOM_API_URL || 'https://api.zoom.us/v2',
      webhookSecret: process.env.ZOOM_WEBHOOK_SECRET,
      defaultUserId: process.env.ZOOM_DEFAULT_USER || 'me'
    };

    // API client configuration
    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Unmute-Platform/1.0'
      }
    });

    // Request interceptor for automatic token injection
    this.client.interceptors.request.use(
      (config) => {
        config.headers.Authorization = `Bearer ${this.generateAccessToken()}`;
        console.log('🔄 Zoom API Request:', config.method?.toUpperCase(), config.url);
        return config;
      },
      (error) => {
        console.error('❌ Zoom API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        console.log('✅ Zoom API Response:', response.status, response.config.url);
        return response;
      },
      (error) => {
        console.error('❌ Zoom API Response Error:', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url
        });
        return Promise.reject(this.handleAPIError(error));
      }
    );

    console.log('✅ Zoom API initialized successfully');
  }

  /**
   * Validate Zoom API configuration
   */
  validateConfig() {
    const required = ['ZOOM_API_KEY', 'ZOOM_API_SECRET'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required Zoom environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Generate JWT access token for Zoom API authentication
   * @returns {string} JWT token
   */
  generateAccessToken() {
    try {
      const payload = {
        iss: this.config.apiKey,
        exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour expiry
        iat: Math.floor(Date.now() / 1000),
        aud: 'zoom',
        appKey: this.config.apiKey,
        tokenExp: Math.floor(Date.now() / 1000) + (60 * 60),
        alg: 'HS256'
      };

      return jwt.sign(payload, this.config.apiSecret, { algorithm: 'HS256' });

    } catch (error) {
      console.error('❌ Error generating Zoom JWT token:', error);
      throw new Error('Failed to generate Zoom access token');
    }
  }

  /**
   * Handle and format API errors
   * @param {Object} error - Axios error object
   * @returns {Error} Formatted error
   */
  handleAPIError(error) {
    if (error.response) {
      const { status, data } = error.response;
      const message = data?.message || data?.error || `HTTP ${status} Error`;
      
      // Map common Zoom error codes
      const errorMap = {
        400: 'Bad Request - Invalid parameters',
        401: 'Unauthorized - Invalid API credentials',
        403: 'Forbidden - Insufficient permissions',
        404: 'Not Found - Resource does not exist',
        409: 'Conflict - Resource already exists',
        429: 'Rate Limited - Too many requests',
        500: 'Internal Server Error'
      };

      const friendlyMessage = errorMap[status] || message;
      const formattedError = new Error(friendlyMessage);
      formattedError.status = status;
      formattedError.code = data?.code;
      formattedError.details = data;
      
      return formattedError;
    }

    return error;
  }

  // ==========================================
  // MEETING MANAGEMENT
  // ==========================================

  /**
   * Create a Zoom meeting with comprehensive settings
   * @param {Object} meetingData - Meeting configuration
   * @returns {Promise<Object>} Created meeting details
   */
  async createMeeting({
    topic,
    start_time,
    duration = 60,
    timezone = 'UTC',
    description = '',
    agenda = '',
    password = null,
    settings = {},
    userId = this.config.defaultUserId
  }) {
    try {
      console.log('🔄 Creating Zoom meeting:', { topic, start_time, duration });

      // Generate secure meeting password if not provided
      if (!password) {
        password = crypto.randomBytes(4).toString('hex').toUpperCase();
      }

      // Enhanced meeting settings
      const defaultSettings = {
        // Security settings
        join_before_host: false,
        mute_upon_entry: true,
        waiting_room: true,
        watermark: true,
        use_pmi: false,
        
        // Audio/Video settings
        audio: 'both',
        video: true,
        
        // Recording settings
        auto_recording: process.env.ZOOM_AUTO_RECORDING || 'none',
        cloud_recording: true,
        
        // Access control
        approval_type: 0, // Automatically approve
        enforce_login: false,
        enforce_login_domains: '',
        
        // Participant settings
        participant_video: true,
        host_video: true,
        cn_meeting: false,
        in_meeting: false,
        
        // Meeting options
        allow_multiple_devices: true,
        breakout_room: {
          enable: true,
          rooms: []
        },
        
        // Advanced settings
        jbh_time: 0,
        global_dial_in_countries: ['US', 'GB', 'IN'],
        contact_name: 'Unmute Platform',
        contact_email: process.env.SUPPORT_EMAIL,
        
        // Custom settings
        ...settings
      };

      const meetingPayload = {
        topic: topic || 'Unmute Mentoring Session',
        type: 2, // Scheduled meeting
        start_time: start_time,
        duration: parseInt(duration),
        timezone: timezone,
        password: password,
        agenda: agenda || description,
        settings: defaultSettings,
        
        // Additional metadata
        tracking_fields: [
          {
            field: 'Platform',
            value: 'Unmute'
          },
          {
            field: 'Created',
            value: new Date().toISOString()
          }
        ]
      };

      const response = await this.client.post(`/users/${userId}/meetings`, meetingPayload);
      const meeting = response.data;

      // Enhanced meeting response
      const formattedMeeting = {
        id: meeting.id,
        uuid: meeting.uuid,
        host_id: meeting.host_id,
        topic: meeting.topic,
        type: meeting.type,
        status: meeting.status,
        start_time: meeting.start_time,
        duration: meeting.duration,
        timezone: meeting.timezone,
        agenda: meeting.agenda,
        
        // Join information
        join_url: meeting.join_url,
        password: meeting.password,
        h323_password: meeting.h323_password,
        pstn_password: meeting.pstn_password,
        encrypted_password: meeting.encrypted_password,
        
        // Meeting URLs
        start_url: meeting.start_url,
        
        // Dial-in numbers
        global_dial_in_numbers: meeting.global_dial_in_numbers,
        
        // Settings
        settings: meeting.settings,
        
        // Platform metadata
        platform: 'zoom',
        created_at: new Date().toISOString()
      };

      console.log('✅ Zoom meeting created:', meeting.id);
      return formattedMeeting;

    } catch (error) {
      console.error('❌ Error creating Zoom meeting:', error);
      throw new Error(`Failed to create Zoom meeting: ${error.message}`);
    }
  }

  /**
   * Get meeting details
   * @param {string} meetingId - Meeting ID
   * @returns {Promise<Object>} Meeting details
   */
  async getMeeting(meetingId) {
    try {
      console.log('🔍 Fetching Zoom meeting:', meetingId);

      const response = await this.client.get(`/meetings/${meetingId}`);
      const meeting = response.data;

      return {
        id: meeting.id,
        uuid: meeting.uuid,
        host_id: meeting.host_id,
        topic: meeting.topic,
        status: meeting.status,
        start_time: meeting.start_time,
        duration: meeting.duration,
        timezone: meeting.timezone,
        join_url: meeting.join_url,
        start_url: meeting.start_url,
        password: meeting.password,
        settings: meeting.settings,
        participants: meeting.participants || []
      };

    } catch (error) {
      console.error('❌ Error fetching Zoom meeting:', error);
      throw new Error(`Failed to fetch Zoom meeting: ${error.message}`);
    }
  }

  /**
   * Update meeting details
   * @param {string} meetingId - Meeting ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Update result
   */
  async updateMeeting(meetingId, updateData) {
    try {
      console.log('🔄 Updating Zoom meeting:', meetingId);

      const response = await this.client.patch(`/meetings/${meetingId}`, updateData);
      
      console.log('✅ Zoom meeting updated:', meetingId);
      return { success: true, meetingId, updatedAt: new Date().toISOString() };

    } catch (error) {
      console.error('❌ Error updating Zoom meeting:', error);
      throw new Error(`Failed to update Zoom meeting: ${error.message}`);
    }
  }

  /**
   * Delete a meeting
   * @param {string} meetingId - Meeting ID
   * @param {string} scheduleForReminder - Send reminder email
   * @returns {Promise<Object>} Deletion result
   */
  async deleteMeeting(meetingId, scheduleForReminder = false) {
    try {
      console.log('🔄 Deleting Zoom meeting:', meetingId);

      const params = scheduleForReminder ? '?schedule_for_reminder=true' : '';
      await this.client.delete(`/meetings/${meetingId}${params}`);
      
      console.log('✅ Zoom meeting deleted:', meetingId);
      return { success: true, meetingId, deletedAt: new Date().toISOString() };

    } catch (error) {
      console.error('❌ Error deleting Zoom meeting:', error);
      throw new Error(`Failed to delete Zoom meeting: ${error.message}`);
    }
  }

  // ==========================================
  // RECORDING MANAGEMENT
  // ==========================================

  /**
   * Get meeting recordings
   * @param {string} meetingId - Meeting ID
   * @returns {Promise<Object>} Recording details
   */
  async getMeetingRecordings(meetingId) {
    try {
      console.log('🔍 Fetching Zoom recordings:', meetingId);

      const response = await this.client.get(`/meetings/${meetingId}/recordings`);
      
      return {
        uuid: response.data.uuid,
        id: response.data.id,
        topic: response.data.topic,
        start_time: response.data.start_time,
        duration: response.data.duration,
        recording_files: response.data.recording_files?.map(file => ({
          id: file.id,
          meeting_id: file.meeting_id,
          recording_start: file.recording_start,
          recording_end: file.recording_end,
          file_type: file.file_type,
          file_size: file.file_size,
          play_url: file.play_url,
          download_url: file.download_url,
          status: file.status,
          recording_type: file.recording_type
        })) || []
      };

    } catch (error) {
      console.error('❌ Error fetching Zoom recordings:', error);
      throw new Error(`Failed to fetch Zoom recordings: ${error.message}`);
    }
  }

  /**
   * Delete meeting recordings
   * @param {string} meetingId - Meeting ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteMeetingRecordings(meetingId) {
    try {
      console.log('🔄 Deleting Zoom recordings:', meetingId);

      await this.client.delete(`/meetings/${meetingId}/recordings`);
      
      console.log('✅ Zoom recordings deleted:', meetingId);
      return { success: true, meetingId, deletedAt: new Date().toISOString() };

    } catch (error) {
      console.error('❌ Error deleting Zoom recordings:', error);
      throw new Error(`Failed to delete Zoom recordings: ${error.message}`);
    }
  }

  // ==========================================
  // PARTICIPANT MANAGEMENT
  // ==========================================

  /**
   * Get meeting participants
   * @param {string} meetingId - Meeting ID
   * @returns {Promise<Object>} Participants list
   */
  async getMeetingParticipants(meetingId) {
    try {
      console.log('🔍 Fetching Zoom participants:', meetingId);

      const response = await this.client.get(`/past_meetings/${meetingId}/participants`);
      
      return {
        page_count: response.data.page_count,
        page_size: response.data.page_size,
        total_records: response.data.total_records,
        participants: response.data.participants?.map(participant => ({
          id: participant.id,
          user_id: participant.user_id,
          name: participant.name,
          user_email: participant.user_email,
          join_time: participant.join_time,
          leave_time: participant.leave_time,
          duration: participant.duration,
          attentiveness_score: participant.attentiveness_score,
          status: participant.status
        })) || []
      };

    } catch (error) {
      console.error('❌ Error fetching Zoom participants:', error);
      throw new Error(`Failed to fetch Zoom participants: ${error.message}`);
    }
  }

  // ==========================================
  // WEBHOOK HANDLING
  // ==========================================

  /**
   * Verify Zoom webhook signature
   * @param {string} payload - Raw request body
   * @param {string} signature - Zoom signature header
   * @returns {boolean} Verification result
   */
  verifyWebhook(payload, signature) {
    try {
      if (!this.config.webhookSecret) {
        console.warn('⚠️ Zoom webhook secret not configured');
        return false;
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(payload)
        .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      console.log('🔍 Zoom webhook verification:', isValid ? 'VALID' : 'INVALID');
      return isValid;

    } catch (error) {
      console.error('❌ Zoom webhook verification error:', error);
      return false;
    }
  }

  /**
   * Handle Zoom webhook events
   * @param {Object} event - Zoom webhook event
   * @returns {Promise<boolean>} Processing success
   */
  async handleWebhookEvent(event) {
    try {
      console.log('🔄 Processing Zoom webhook:', event.event);

      switch (event.event) {
        case 'meeting.started':
          await this.handleMeetingStarted(event.payload);
          break;

        case 'meeting.ended':
          await this.handleMeetingEnded(event.payload);
          break;

        case 'meeting.participant_joined':
          await this.handleParticipantJoined(event.payload);
          break;

        case 'meeting.participant_left':
          await this.handleParticipantLeft(event.payload);
          break;

        case 'recording.completed':
          await this.handleRecordingCompleted(event.payload);
          break;

        default:
          console.log('ℹ️ Unhandled Zoom webhook event:', event.event);
      }

      return true;

    } catch (error) {
      console.error('❌ Zoom webhook processing error:', error);
      return false;
    }
  }

  /**
   * Handle meeting started event
   * @param {Object} payload - Event payload
   */
  async handleMeetingStarted(payload) {
    try {
      const meetingId = payload.object.id;
      
      // Update session status in database
      await db.query(`
        UPDATE sessions 
        SET status = 'in_progress',
            actual_start_time = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE meeting_id = $1 AND status = 'confirmed'
      `, [meetingId]);

      console.log('✅ Meeting started event processed:', meetingId);

    } catch (error) {
      console.error('❌ Error processing meeting started:', error);
      throw error;
    }
  }

  /**
   * Handle meeting ended event
   * @param {Object} payload - Event payload
   */
  async handleMeetingEnded(payload) {
    try {
      const meetingId = payload.object.id;
      const duration = payload.object.duration;
      
      // Update session status in database
      await db.query(`
        UPDATE sessions 
        SET status = 'completed',
            actual_end_time = CURRENT_TIMESTAMP,
            actual_duration_minutes = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE meeting_id = $1 AND status = 'in_progress'
      `, [meetingId, duration]);

      console.log('✅ Meeting ended event processed:', meetingId);

    } catch (error) {
      console.error('❌ Error processing meeting ended:', error);
      throw error;
    }
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Get Zoom account information
   * @returns {Promise<Object>} Account details
   */
  async getAccountInfo() {
    try {
      const response = await this.client.get('/accounts/me');
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching Zoom account info:', error);
      throw error;
    }
  }

  /**
   * Health check for Zoom API
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const account = await this.getAccountInfo();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        account: {
          id: account.id,
          account_name: account.account_name,
          account_type: account.account_type,
          status: account.status
        },
        config: {
          baseURL: this.config.baseURL,
          hasWebhookSecret: !!this.config.webhookSecret
        }
      };

    } catch (error) {
      console.error('❌ Zoom health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Generate a secure meeting ID
   * @returns {string} Meeting ID
   */
  generateMeetingId() {
    return crypto.randomBytes(5).toString('hex').toUpperCase();
  }

  /**
   * Format Zoom datetime for API
   * @param {Date} date - JavaScript Date object
   * @returns {string} Formatted datetime
   */
  formatZoomDateTime(date) {
    return date.toISOString();
  }

  /**
   * Parse Zoom datetime from API
   * @param {string} zoomDateTime - Zoom datetime string
   * @returns {Date} JavaScript Date object
   */
  parseZoomDateTime(zoomDateTime) {
    return new Date(zoomDateTime);
  }
}

// Export singleton instance
module.exports = new ZoomAPI();
