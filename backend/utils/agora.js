const { RtcTokenBuilder, RtcRole, RtmTokenBuilder, RtmRole } = require('agora-token');
const crypto = require('crypto');

class AgoraService {
  constructor() {
    this.appId = process.env.AGORA_APP_ID;
    this.appCertificate = process.env.AGORA_APP_CERTIFICATE;
    this.tokenExpiryTime = 3600; // 1 hour in seconds

    console.log('🎥 [DEBUG] Agora Service initialized with:', {
      appId: this.appId ? '***' + this.appId.slice(-4) : 'NOT SET',
      appCertificate: this.appCertificate ? '***' + this.appCertificate.slice(-4) : 'NOT SET',
      tokenExpiryTime: this.tokenExpiryTime,
      env_AGORA_APP_ID: process.env.AGORA_APP_ID ? 'SET' : 'NOT SET',
      env_AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE ? 'SET' : 'NOT SET'
    });

    if (!this.appId || !this.appCertificate) {
      console.error('❌ Agora App ID or Certificate not configured!');
      console.error('❌ Please check your .env file and ensure AGORA_APP_ID and AGORA_APP_CERTIFICATE are set');
      throw new Error('Agora credentials not configured. Please set AGORA_APP_ID and AGORA_APP_CERTIFICATE in environment variables.');
    }
  }

  /**
   * Generate an Agora RTC token for a channel
   * @param {string} channelName - The channel name
   * @param {number} uid - User ID (0 for random)
   * @param {string} role - 'publisher' or 'subscriber'
   * @param {number} privilegeExpiredTs - Token expiry timestamp
   * @returns {string} The generated token
   */
  generateToken(channelName, uid = 0, role = 'publisher', privilegeExpiredTs = null) {
    try {
      console.log('🎥 [DEBUG] Generating token with params:', {
        appId: this.appId ? '***' + this.appId.slice(-4) : 'NOT SET',
        appCertificate: this.appCertificate ? '***' + this.appCertificate.slice(-4) : 'NOT SET',
        channelName,
        uid,
        role
      });

      // Calculate expiry time (1 hour from now if not specified)
      const expiryTime = privilegeExpiredTs || (Math.floor(Date.now() / 1000) + this.tokenExpiryTime);
      console.log('🎥 [DEBUG] Token expiry time:', new Date(expiryTime * 1000).toISOString());

      // Convert role string to Agora role enum
      const agoraRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
      console.log('🎥 [DEBUG] Agora role:', agoraRole);

      // Generate the token
      const token = RtcTokenBuilder.buildTokenWithUid(
        this.appId,
        this.appCertificate,
        channelName,
        uid,
        agoraRole,
        expiryTime
      );

      console.log(`✅ Generated Agora token for channel: ${channelName}, uid: ${uid}, role: ${role}`);
      console.log('✅ [DEBUG] Token length:', token.length, 'starts with:', token.substring(0, 10) + '...');

      return token;
    } catch (error) {
      console.error('❌ Error generating Agora token:', error);
      console.error('❌ [DEBUG] Token generation failed with:', {
        message: error.message,
        stack: error.stack
      });
      throw new Error('Failed to generate Agora token');
    }
  }

  /**
   * Generate a unique channel name for a session
   * @param {number} sessionId - The session ID
   * @returns {string} Unique channel name
   */
  generateChannelName(sessionId) {
    // Create a deterministic but unique channel name based on session ID
    const hash = crypto.createHash('md5').update(`session_${sessionId}`).digest('hex').substring(0, 8);
    return `session_${sessionId}_${hash}`;
  }

  /**
   * Validate if a token is still valid
   * @param {string} token - The token to validate
   * @returns {boolean} Whether the token is valid
   */
  isTokenValid(token) {
    try {
      // Basic validation - check if token exists and has minimum length
      return token && token.length > 100;
    } catch (error) {
      console.error('❌ Error validating token:', error);
      return false;
    }
  }

  /**
   * Get token expiry information
   * @param {string} token - The Agora token
   * @returns {object} Token expiry information
   */
  getTokenInfo(token) {
    try {
      // For now, return basic info. In production, you might want to decode the token
      return {
        appId: this.appId,
        isValid: this.isTokenValid(token),
        expiresIn: this.tokenExpiryTime
      };
    } catch (error) {
      console.error('❌ Error getting token info:', error);
      return null;
    }
  }

  // NEW: Function to generate an RTM token
  generateRtmToken(userId, privilegeExpiredTs = null) {
    try {
      console.log('📨 Generating RTM token for user:', userId);
      const expiryTime = privilegeExpiredTs || (Math.floor(Date.now() / 1000) + this.tokenExpiryTime);

      // RTM user IDs must be strings
      const rtmUid = userId.toString();

      const token = RtmTokenBuilder.buildToken(
        this.appId,
        this.appCertificate,
        rtmUid,
        expiryTime
      );

      console.log(`✅ Generated Agora RTM token for uid: ${rtmUid}`);
      return token;
    } catch (error) {
      console.error('❌ Error generating Agora RTM token:', error);
      throw new Error('Failed to generate Agora RTM token');
    }
  }

  /**
   * Generate meeting credentials for a session
   * @param {number} sessionId - The session ID
   * @param {number} userId - The user ID
   * @returns {object} Meeting credentials
   */
  // CHANGED: This function now returns both RTC and RTM tokens
  generateMeetingCredentials(sessionId, userId) {
    const channelName = this.generateChannelName(sessionId);
    const rtcToken = this.generateToken(channelName, userId);
    const rtmToken = this.generateRtmToken(userId); // NEW

    return {
      appId: this.appId,
      channelName,
      rtcToken: rtcToken, // CHANGED: Renamed for clarity
      rtmToken: rtmToken, // NEW
      uid: userId,
      tokenExpiresAt: new Date(Date.now() + this.tokenExpiryTime * 1000)
    };
  }

  /**
   * Refresh an existing token
   * @param {string} channelName - The channel name
   * @param {number} uid - User ID
   * @returns {string} New token
   */
  refreshToken(channelName, uid) {
    return this.generateToken(channelName, uid);
  }
}

module.exports = new AgoraService();