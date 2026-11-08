'use strict';

const { query } = require('../config/db');
const notify = require('./notificationService');

async function processMeetingReminders() {
  try {
    // 1. Process 15-Minute Reminders
    const due15 = await query(
      `SELECT b.id, b.uuid, b.mentor_user_id, b.mentee_user_id, b.is_incognito,
              b.slot_start_at,
              u_mentor.full_name AS mentor_name,
              u_mentee.full_name AS mentee_name
         FROM bookings b
         JOIN users u_mentor ON u_mentor.id = b.mentor_user_id
         JOIN users u_mentee ON u_mentee.id = b.mentee_user_id
        WHERE b.status = 'scheduled'
          AND b.reminded_15m_at IS NULL
          AND b.slot_start_at <= NOW() + INTERVAL '15 minutes'
          AND b.slot_start_at > NOW() + INTERVAL '5 minutes'
        LIMIT 50`
    );

    for (const b of due15.rows) {
      await query(`UPDATE bookings SET reminded_15m_at = NOW() WHERE id = $1`, [b.id]);

      const menteeDisplay = b.is_incognito ? 'Anonymous Mentee' : (b.mentee_name || 'Mentee');
      const mentorDisplay = b.mentor_name || 'Mentor';

      // Notify Mentor (Links to dashboard before meeting time)
      await notify.notify({
        user_id: b.mentor_user_id,
        kind: 'meeting_reminder_15m',
        title: '⏰ Session starting in 15 minutes',
        body: `Your scheduled session with ${menteeDisplay} begins in 15 minutes. Check details on your dashboard.`,
        link_url: '/dashboard',
        reference_table: 'bookings',
        reference_id: b.id,
        send_email: false,
      });

      // Notify Mentee (Links to dashboard before meeting time)
      await notify.notify({
        user_id: b.mentee_user_id,
        kind: 'meeting_reminder_15m',
        title: '⏰ Session starting in 15 minutes',
        body: `Your session with ${mentorDisplay} begins in 15 minutes. Check details on your dashboard.`,
        link_url: '/dashboard',
        reference_table: 'bookings',
        reference_id: b.id,
        send_email: false,
      });
    }

    // 2. Process 5-Minute Reminders (Meeting is open — Join Now!)
    const due5 = await query(
      `SELECT b.id, b.uuid, b.mentor_user_id, b.mentee_user_id, b.is_incognito,
              b.slot_start_at,
              u_mentor.full_name AS mentor_name,
              u_mentee.full_name AS mentee_name
         FROM bookings b
         JOIN users u_mentor ON u_mentor.id = b.mentor_user_id
         JOIN users u_mentee ON u_mentee.id = b.mentee_user_id
        WHERE b.status = 'scheduled'
          AND b.reminded_5m_at IS NULL
          AND b.slot_start_at <= NOW() + INTERVAL '5 minutes'
          AND b.slot_start_at >= NOW() - INTERVAL '3 minutes'
        LIMIT 50`
    );

    for (const b of due5.rows) {
      await query(`UPDATE bookings SET reminded_5m_at = NOW() WHERE id = $1`, [b.id]);

      const menteeDisplay = b.is_incognito ? 'Anonymous Mentee' : (b.mentee_name || 'Mentee');
      const mentorDisplay = b.mentor_name || 'Mentor';

      // Notify Mentor (Open to join now)
      await notify.notify({
        user_id: b.mentor_user_id,
        kind: 'meeting_reminder_5m',
        title: '🚨 Session starting — Join now!',
        body: `Your session with ${menteeDisplay} is ready. Tap to Join now!`,
        link_url: `/meetings/${b.uuid}`,
        reference_table: 'bookings',
        reference_id: b.id,
        send_email: false,
      });

      // Notify Mentee (Open to join now)
      await notify.notify({
        user_id: b.mentee_user_id,
        kind: 'meeting_reminder_5m',
        title: '🚨 Session starting — Join now!',
        body: `Your session with ${mentorDisplay} is ready. Tap to Join now!`,
        link_url: `/meetings/${b.uuid}`,
        reference_table: 'bookings',
        reference_id: b.id,
        send_email: false,
      });
    }
  } catch (err) {
    console.error('[meetingReminderService] error checking reminders:', err.message);
  }
}

module.exports = { processMeetingReminders };
