const db = require('./config/database');
const agoraService = require('./utils/agora');

async function fixMissingVideoMeetings() {
  try {
    console.log('🔍 Checking for sessions without video_meetings entries...');

    // Find sessions that should have video meetings but don't
    const query = `
      SELECT s.id, s.session_type, s.status, s.meeting_platform, s.meeting_id, s.meeting_url
      FROM sessions s
      LEFT JOIN video_meetings vm ON s.id = vm.session_id
      WHERE s.session_type IN ('video', 'voice')
        AND s.status IN ('confirmed', 'scheduled', 'in_progress', 'completed')
        AND vm.session_id IS NULL
        AND s.created_at > '2024-01-01'
      ORDER BY s.created_at DESC
      LIMIT 50
    `;

    const result = await db.query(query);
    console.log(`Found ${result.rows.length} sessions without video_meetings entries`);

    for (const session of result.rows) {
      console.log(`Processing session ${session.id} (${session.status})`);

      try {
        // Generate meeting credentials
        const meetingCredentials = agoraService.generateMeetingCredentials(session.id, 0); // Use 0 as default uid

        // Create video_meetings entry
        const insertQuery = `
          INSERT INTO video_meetings (
            session_id, channel_name, agora_app_id, agora_token, token_expires_at,
            meeting_status, max_duration_minutes, auto_end_enabled,
            video_quality, audio_enabled, video_enabled, screen_share_enabled
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;

        await db.query(insertQuery, [
          session.id,
          meetingCredentials.channelName,
          meetingCredentials.appId,
          meetingCredentials.token,
          meetingCredentials.tokenExpiresAt,
          'scheduled',
          75, // 1 hour 15 minutes
          true,
          'high',
          true,
          true,
          false
        ]);

        // Update session with meeting URL if not set
        if (!session.meeting_url || session.meeting_url.includes('localhost:3000')) {
          const frontendUrl = process.env.FRONTEND_URL || 'https://yourapp.com';
          const meetingUrl = `${frontendUrl}/meeting/${session.id}`;

          await db.query(
            `UPDATE sessions SET meeting_url = $2, meeting_id = $3 WHERE id = $1`,
            [session.id, meetingUrl, meetingCredentials.channelName]
          );
        }

        console.log(`✅ Fixed session ${session.id}`);

      } catch (error) {
        console.error(`❌ Failed to fix session ${session.id}:`, error.message);
      }
    }

    console.log('✅ Video meetings fix completed');

  } catch (error) {
    console.error('❌ Error fixing video meetings:', error);
  } finally {
    process.exit(0);
  }
}

fixMissingVideoMeetings();