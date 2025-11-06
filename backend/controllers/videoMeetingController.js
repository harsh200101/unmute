const db = require('../config/database');
const agoraService = require('../utils/agora');
const { sendMeetingInviteEmail } = require('../utils/emailService');

// Create or get video meeting for a session
exports.createVideoMeeting = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    console.log('🔄 Creating video meeting for session:', sessionId);

    // Verify user has access to this session
    const sessionQuery = `
      SELECT s.*, m.user_id as mentor_user_id
      FROM sessions s
      JOIN mentors m ON s.mentor_id = m.id
      WHERE s.id = $1 AND (s.mentee_id = $2 OR m.user_id = $2)
    `;

    const sessionResult = await db.query(sessionQuery, [sessionId, userId]);

    if (sessionResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this session',
        code: 'UNAUTHORIZED'
      });
    }

    const session = sessionResult.rows[0];

    // Check if video meeting already exists
    const existingMeeting = await db.query(
      'SELECT * FROM video_meetings WHERE session_id = $1',
      [sessionId]
    );

    if (existingMeeting.rows.length > 0) {
      console.log('✅ Video meeting already exists for session:', sessionId);
      return res.json({
        success: true,
        message: 'Video meeting already exists',
        data: {
          videoMeeting: existingMeeting.rows[0]
        }
      });
    }

    // Generate Agora credentials
    const credentials = agoraService.generateMeetingCredentials(sessionId, userId);

    // Create video meeting record
    const meetingQuery = `
      INSERT INTO video_meetings (
        session_id, channel_name, agora_app_id, agora_token, token_expires_at,
        max_duration_minutes, meeting_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const meetingValues = [
      sessionId,
      credentials.channelName,
      credentials.appId,
      credentials.token,
      credentials.tokenExpiresAt,
      75, // 1 hour 15 minutes
      'scheduled'
    ];

    const meetingResult = await db.query(meetingQuery, meetingValues);
    const videoMeeting = meetingResult.rows[0];

    console.log('✅ Video meeting created for session:', sessionId);

    res.status(201).json({
      success: true,
      message: 'Video meeting created successfully',
      data: {
        videoMeeting
      }
    });

  } catch (error) {
    console.error('❌ Error creating video meeting:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create video meeting',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// ENHANCED: Get video meeting credentials for joining with comprehensive debugging
exports.getMeetingCredentials = async (req, res) => {
  const debugLog = (message, data = null, level = 'info') => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      component: 'CREDENTIALS_API',
      message,
      data,
      level,
      sessionId: req.params.sessionId,
      userId: req.user?.userId,
      requestId: req.headers['x-request-id'] || 'unknown'
    };

    if (level === 'error') {
      console.error(`🔑 [${timestamp}] CREDENTIALS_API ERROR:`, message, data);
    } else if (level === 'warn') {
      console.warn(`🔑 [${timestamp}] CREDENTIALS_API WARN:`, message, data);
    } else {
      console.log(`🔑 [${timestamp}] CREDENTIALS_API:`, message, data);
    }

    // Store debug logs for potential export
    if (!global.credentialsDebugLogs) global.credentialsDebugLogs = [];
    global.credentialsDebugLogs.push(logEntry);
  };

  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    debugLog('Credentials request started', {
      sessionId,
      userId,
      headers: {
        userAgent: req.get('User-Agent'),
        contentType: req.get('Content-Type'),
        authorization: req.get('Authorization') ? 'PRESENT' : 'MISSING'
      },
      ip: req.ip,
      method: req.method,
      url: req.url
    });

    // Define test mentors who can join any video call without restrictions
    const testMentorIds = [68, 71]; // harshgajbhiye34@gmail.com (68), harshgajbhiye722@gmail.com (71)
    const isTestMentor = testMentorIds.includes(userId);

    debugLog('User role check completed', {
      isTestMentor,
      userId,
      testMentorIds
    });

    // Environment variable validation
    const envStatus = {
      agoraAppId: !!process.env.AGORA_APP_ID,
      agoraCertificate: !!process.env.AGORA_APP_CERTIFICATE,
      nodeEnv: process.env.NODE_ENV
    };

    debugLog('Environment validation', envStatus);

    if (!envStatus.agoraAppId || !envStatus.agoraCertificate) {
      debugLog('Missing Agora environment variables', envStatus, 'error');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error',
        code: 'CONFIG_ERROR'
      });
    }

    // Verify user has access to this session and meeting is active
    debugLog('Executing session access query');
    const sessionQuery = `
      SELECT
        s.*,
        m.user_id as mentor_user_id,
        vm.*,
        u.first_name as mentee_first_name,
        u.last_name as mentee_last_name,
        mentor_user.first_name as mentor_first_name,
        mentor_user.last_name as mentor_last_name
      FROM sessions s
      JOIN mentors m ON s.mentor_id = m.id
      JOIN users mentor_user ON m.user_id = mentor_user.id
      JOIN users u ON s.mentee_id = u.id
      LEFT JOIN video_meetings vm ON s.id = vm.session_id
      WHERE s.id = $1 AND (s.mentee_id = $2 OR m.user_id = $2 OR $3 = true)
    `;

    const sessionResult = await db.query(sessionQuery, [sessionId, userId, isTestMentor]);
    debugLog('Session query completed', {
      rowsReturned: sessionResult.rows.length,
      queryParams: [sessionId, userId, isTestMentor]
    });

    if (sessionResult.rows.length === 0) {
      debugLog('Access denied - no session found', {
        sessionId,
        userId,
        isTestMentor
      }, 'error');

      return res.status(403).json({
        success: false,
        message: 'You do not have access to this session',
        code: 'UNAUTHORIZED'
      });
    }

    const session = sessionResult.rows[0];
    debugLog('Session data retrieved', {
      sessionId: session.id,
      status: session.status,
      channelName: session.channel_name,
      appId: session.agora_app_id ? '***' + session.agora_app_id.slice(-4) : 'MISSING',
      meetingStatus: session.meeting_status,
      scheduledAt: session.scheduled_at,
      mentorId: session.mentor_user_id,
      menteeId: session.mentee_id
    });

    // Time-based access control
    const now = new Date();
    const sessionStart = new Date(session.scheduled_at);
    const timeUntilStart = (sessionStart - now) / (1000 * 60); // minutes
    const sessionEnd = new Date(sessionStart.getTime() + 75 * 60 * 1000); // 75 minutes

    debugLog('Time-based access control check', {
      now: now.toISOString(),
      sessionStart: sessionStart.toISOString(),
      sessionEnd: sessionEnd.toISOString(),
      timeUntilStart,
      timeRemaining: Math.max(0, Math.floor((sessionEnd - now) / (1000 * 60))),
      isAfterEnd: now > sessionEnd
    });

    // Allow testing users to join anytime
    const isTestingUser = userId === 49 || userId === 51 || userId === 55 || userId === 68 || userId === 71;

    if (!isTestingUser && !isTestMentor && timeUntilStart > 15) {
      debugLog('Meeting not yet available', { timeUntilStart }, 'warn');
      return res.status(403).json({
        success: false,
        message: 'Meeting has not started yet. You can join 15 minutes before the scheduled time.',
        code: 'TOO_EARLY'
      });
    }

    if (now > sessionEnd) {
      debugLog('Meeting expired', {
        sessionEnd: sessionEnd.toISOString(),
        now: now.toISOString()
      }, 'warn');

      return res.status(403).json({
        success: false,
        message: 'Meeting time has expired.',
        code: 'MEETING_EXPIRED'
      });
    }

    // Video meeting validation
    const meetingValidation = {
      hasChannelName: !!session.channel_name,
      hasAppId: !!session.agora_app_id,
      channelName: session.channel_name,
      appIdPresent: !!session.agora_app_id
    };

    debugLog('Video meeting validation', meetingValidation);

    if (!meetingValidation.hasChannelName || !meetingValidation.hasAppId) {
      debugLog('Video meeting not properly configured', meetingValidation, 'error');
      return res.status(404).json({
        success: false,
        message: 'Video meeting not found for this session',
        code: 'MEETING_NOT_FOUND'
      });
    }

    // Generate fresh tokens
    debugLog('Starting token generation', {
      sessionId,
      userId,
      channelName: session.channel_name,
      appId: session.agora_app_id ? '***' + session.agora_app_id.slice(-4) : 'MISSING'
    });

    const credentials = agoraService.generateMeetingCredentials(sessionId, userId);
    const rtcToken = credentials.rtcToken;
    const rtmToken = credentials.rtmToken;
    const tokenExpiresAt = credentials.tokenExpiresAt;

    debugLog('Token generation completed', {
      hasRtcToken: !!rtcToken,
      hasRtmToken: !!rtmToken,
      rtcTokenLength: rtcToken ? rtcToken.length : 0,
      rtmTokenLength: rtmToken ? rtmToken.length : 0,
      uid: credentials.uid,
      channelName: credentials.channelName,
      tokenExpiresAt
    });

    // Validate generated tokens
    if (!rtcToken || !rtmToken) {
      debugLog('Token generation failed', {
        rtcTokenGenerated: !!rtcToken,
        rtmTokenGenerated: !!rtmToken
      }, 'error');

      return res.status(500).json({
        success: false,
        message: 'Failed to generate meeting tokens',
        code: 'TOKEN_GENERATION_FAILED'
      });
    }

    // Update database with new tokens
    debugLog('Updating database with new tokens');
    await db.query(
      'UPDATE video_meetings SET agora_token = $1, token_expires_at = $2 WHERE session_id = $3',
      [rtcToken, tokenExpiresAt, sessionId]
    );
    debugLog('Database updated successfully');

    // Log join attempt
    const joinLog = {
      userId,
      action: 'join_attempt',
      timestamp: new Date(),
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      credentialsGenerated: true,
      tokensGenerated: {
        rtc: !!rtcToken,
        rtm: !!rtmToken
      }
    };

    await db.query(`
      UPDATE video_meetings
      SET join_logs = join_logs || $1::jsonb
      WHERE session_id = $2
    `, [JSON.stringify([joinLog]), sessionId]);

    debugLog('Join attempt logged');

    // Prepare response
    const responseData = {
      success: true,
      message: 'Meeting credentials retrieved successfully',
      data: {
        credentials: {
          appId: session.agora_app_id,
          channelName: session.channel_name,
          token: rtcToken,
          rtmToken: rtmToken,
          uid: userId
        },
        session: {
          id: session.id,
          title: session.title,
          scheduledAt: session.scheduled_at,
          durationMinutes: session.duration_minutes,
          mentorName: `${session.mentor_first_name} ${session.mentor_last_name}`,
          menteeName: `${session.mentee_first_name} ${session.mentee_last_name}`,
          status: session.status
        },
        meeting: {
          status: session.meeting_status,
          maxDurationMinutes: session.max_duration_minutes,
          participantsJoined: session.participants_joined || [],
          timeRemaining: Math.max(0, Math.floor((sessionEnd - now) / (1000 * 60)))
        }
      }
    };

    debugLog('Credentials response prepared', {
      responseSize: JSON.stringify(responseData).length,
      hasCredentials: !!responseData.data.credentials,
      credentialsKeys: responseData.data.credentials ? Object.keys(responseData.data.credentials) : []
    });

    debugLog('Credentials API completed successfully', {
      sessionId,
      userId,
      tokensProvided: {
        rtc: !!rtcToken,
        rtm: !!rtmToken
      }
    });

    res.json(responseData);

  } catch (error) {
    debugLog('Credentials API failed', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      sqlState: error.sqlState
    }, 'error');

    // Enhanced error categorization
    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';
    let userMessage = 'Failed to get meeting credentials';

    if (error.message.includes('permission') || error.message.includes('access')) {
      statusCode = 403;
      errorCode = 'ACCESS_DENIED';
      userMessage = 'Access denied to this meeting';
    } else if (error.message.includes('not found') || error.code === '23503') {
      statusCode = 404;
      errorCode = 'NOT_FOUND';
      userMessage = 'Meeting not found';
    } else if (error.message.includes('token') || error.message.includes('auth')) {
      statusCode = 401;
      errorCode = 'AUTH_ERROR';
      userMessage = 'Authentication failed';
    }

    res.status(statusCode).json({
      success: false,
      message: userMessage,
      code: errorCode,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Log meeting events (join, leave, etc.)
exports.logMeetingEvent = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { eventType, eventData } = req.body;
    const userId = req.user.userId;

    console.log('📝 Logging meeting event:', eventType, 'for session:', sessionId, 'user:', userId);

    const eventLog = {
      userId,
      eventType,
      eventData,
      timestamp: new Date(),
      userAgent: req.get('User-Agent'),
      ip: req.ip
    };

    // Update appropriate log array based on event type
    let logField = 'join_logs';
    if (eventType.includes('quality')) {
      logField = 'quality_logs';
    } else if (eventType.includes('error')) {
      logField = 'error_logs';
    }

    await db.query(`
      UPDATE video_meetings
      SET ${logField} = ${logField} || $1::jsonb
      WHERE session_id = $2
    `, [JSON.stringify([eventLog]), sessionId]);

    // Handle specific events
    if (eventType === 'user_joined') {
      // Add user to participants list if not already there
      await db.query(`
        UPDATE video_meetings
        SET participants_joined = CASE
          WHEN NOT (participants_joined @> $1::jsonb)
          THEN participants_joined || $1::jsonb
          ELSE participants_joined
        END,
        meeting_status = CASE
          WHEN meeting_status = 'scheduled' THEN 'active'
          ELSE meeting_status
        END,
        actual_start_time = CASE
          WHEN actual_start_time IS NULL THEN CURRENT_TIMESTAMP
          ELSE actual_start_time
        END
        WHERE session_id = $2
      `, [JSON.stringify([userId]), sessionId]);

      // Update session status if this is the first join
      await db.query(`
        UPDATE sessions
        SET status = 'in_progress',
            actual_start_time = COALESCE(actual_start_time, CURRENT_TIMESTAMP)
        WHERE id = $1 AND status IN ('scheduled', 'confirmed')
      `, [sessionId]);

    } else if (eventType === 'user_left') {
      // Check if this was the last participant
      const meetingResult = await db.query(
        'SELECT participants_joined FROM video_meetings WHERE session_id = $1',
        [sessionId]
      );

      if (meetingResult.rows.length > 0) {
        const participants = meetingResult.rows[0].participants_joined || [];
        if (participants.length <= 1) {
          // Last participant left, end the meeting
          await db.query(`
            UPDATE video_meetings
            SET meeting_status = 'ended',
                actual_end_time = CURRENT_TIMESTAMP,
                actual_duration_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - actual_start_time)) / 60
            WHERE session_id = $1
          `, [sessionId]);

          // Update session status
          await db.query(`
            UPDATE sessions
            SET status = 'completed',
                actual_end_time = CURRENT_TIMESTAMP,
                actual_duration_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - actual_start_time)) / 60
            WHERE id = $1
          `, [sessionId]);
        }
      }
    }

    res.json({
      success: true,
      message: 'Meeting event logged successfully'
    });

  } catch (error) {
    console.error('❌ Error logging meeting event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log meeting event',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Send meeting invites
exports.sendMeetingInvites = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    console.log('📧 Sending meeting invites for session:', sessionId);

    // Get session and meeting details
    const query = `
      SELECT
        s.*,
        vm.channel_name,
        vm.agora_app_id,
        m.user_id as mentor_user_id,
        mentor_user.first_name as mentor_first_name,
        mentor_user.last_name as mentor_last_name,
        mentor_user.email as mentor_email,
        mentee_user.first_name as mentee_first_name,
        mentee_user.last_name as mentee_last_name,
        mentee_user.email as mentee_email
      FROM sessions s
      JOIN mentors m ON s.mentor_id = m.id
      JOIN users mentor_user ON m.user_id = mentor_user.id
      JOIN users mentee_user ON s.mentee_id = mentee_user.id
      LEFT JOIN video_meetings vm ON s.id = vm.session_id
      WHERE s.id = $1
    `;

    const result = await db.query(query, [sessionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    const session = result.rows[0];

    // Check if user is authorized (mentor or mentee)
    if (session.mentee_id !== userId && session.mentor_user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to send invites for this session',
        code: 'UNAUTHORIZED'
      });
    }

    // Send invites to both mentor and mentee
    const meetingData = {
      title: session.title,
      scheduledAt: session.scheduled_at,
      durationMinutes: session.duration_minutes,
      channelName: session.channel_name,
      meetingUrl: `https://yourapp.com/meeting/${sessionId}`, // Replace with your actual meeting URL
      mentorName: `${session.mentor_first_name} ${session.mentor_last_name}`,
      menteeName: `${session.mentee_first_name} ${session.mentee_last_name}`
    };

    try {
      // Send to mentee
      await sendMeetingInviteEmail(session.mentee_email, meetingData, 'mentee');

      // Send to mentor
      await sendMeetingInviteEmail(session.mentor_email, meetingData, 'mentor');

      console.log('✅ Meeting invites sent for session:', sessionId);

      res.json({
        success: true,
        message: 'Meeting invites sent successfully'
      });

    } catch (emailError) {
      console.error('❌ Error sending meeting invites:', emailError);
      res.status(500).json({
        success: false,
        message: 'Failed to send meeting invites',
        error: process.env.NODE_ENV === 'development' ? emailError.message : 'Email service error'
      });
    }

  } catch (error) {
    console.error('❌ Error sending meeting invites:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send meeting invites',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get meeting status
exports.getMeetingStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    const query = `
      SELECT
        vm.*,
        s.scheduled_at,
        s.duration_minutes,
        s.status as session_status
      FROM video_meetings vm
      JOIN sessions s ON vm.session_id = s.id
      JOIN mentors m ON s.mentor_id = m.id
      WHERE vm.session_id = $1 AND (s.mentee_id = $2 OR m.user_id = $2)
    `;

    const result = await db.query(query, [sessionId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found',
        code: 'MEETING_NOT_FOUND'
      });
    }

    const meeting = result.rows[0];
    const now = new Date();
    const sessionStart = new Date(meeting.scheduled_at);
    const sessionEnd = new Date(sessionStart.getTime() + 75 * 60 * 1000); // 75 minutes

    res.json({
      success: true,
      data: {
        meeting: {
          status: meeting.meeting_status,
          participantsJoined: meeting.participants_joined || [],
          actualStartTime: meeting.actual_start_time,
          actualEndTime: meeting.actual_end_time,
          actualDurationMinutes: meeting.actual_duration_minutes,
          timeRemaining: Math.max(0, Math.floor((sessionEnd - now) / (1000 * 60))),
          canJoin: now >= new Date(sessionStart.getTime() - 15 * 60 * 1000) && now <= sessionEnd // Within 15 min before to 75 min after start
        },
        session: {
          status: meeting.session_status,
          scheduledAt: meeting.scheduled_at,
          durationMinutes: meeting.duration_minutes
        }
      }
    });

  } catch (error) {
    console.error('❌ Error getting meeting status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get meeting status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Test endpoint to verify Agora configuration (no auth required)
exports.testAgoraConfig = async (req, res) => {
  try {
    console.log('🔧 Testing Agora configuration...');

    const agoraService = require('../utils/agora');

    // Test token generation
    const testChannel = 'test_channel_' + Date.now();
    const testUid = 999;
    const token = agoraService.generateToken(testChannel, testUid);

    console.log('🔧 Agora test successful:', {
      appIdConfigured: !!process.env.AGORA_APP_ID,
      appCertificateConfigured: !!process.env.AGORA_APP_CERTIFICATE,
      tokenGenerated: !!token,
      tokenLength: token.length
    });

    res.json({
      success: true,
      message: 'Agora configuration test successful',
      data: {
        appIdConfigured: !!process.env.AGORA_APP_ID,
        appCertificateConfigured: !!process.env.AGORA_APP_CERTIFICATE,
        tokenGenerated: !!token,
        tokenLength: token.length,
        testChannel,
        testUid
      }
    });

  } catch (error) {
    console.error('🔧 Agora configuration test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Agora configuration test failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Configuration error'
    });
  }
};

module.exports = exports;