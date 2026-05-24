'use strict';

// Meeting room state — credentials gate, lazy meeting row creation, presence
// event recording. The billing math sits on top of this in phase 7; here we
// only update boolean presence flags and the billing_state enum.

const { query, withTransaction } = require('../config/db');
const { bad, notFound, forbidden } = require('../utils/errors');
const agora = require('./agoraService');
const billing = require('./billingEngine');

const JOIN_WINDOW_BEFORE_MS = 5 * 60 * 1000; // 5 minutes before slot_start

// --- Helpers ---------------------------------------------------------------

async function loadBookingForUser(client, { booking_uuid, user_id }) {
  const exec = client ? client.query.bind(client) : query;
  const r = await exec(
    `SELECT b.*,
            mu.email AS mentor_email, mu.full_name AS mentor_name,
            cu.email AS mentee_email, cu.full_name AS mentee_name
       FROM bookings b
       JOIN users mu ON mu.id = b.mentor_user_id
       JOIN users cu ON cu.id = b.mentee_user_id
      WHERE b.uuid = $1`,
    [booking_uuid]
  );
  const b = r.rows[0];
  if (!b) throw notFound('booking_not_found');
  const role = b.mentor_user_id === user_id ? 'mentor'
             : b.mentee_user_id === user_id ? 'mentee' : null;
  if (!role) throw forbidden('not_a_party');
  return { booking: b, role };
}

async function getOrCreateMeeting(client, booking) {
  const exec = client ? client.query.bind(client) : query;
  const existing = await exec(`SELECT * FROM meetings WHERE booking_id = $1`, [booking.id]);
  if (existing.rows[0]) return existing.rows[0];
  const channel = agora.channelName(booking.uuid);
  const created = await exec(
    `INSERT INTO meetings (booking_id, agora_channel_name)
     VALUES ($1, $2)
     RETURNING *`,
    [booking.id, channel]
  );
  return created.rows[0];
}

function withinJoinWindow(booking) {
  const start = new Date(booking.slot_start_at).getTime();
  const end = new Date(booking.slot_end_at).getTime();
  const now = Date.now();
  return now >= start - JOIN_WINDOW_BEFORE_MS && now < end;
}

// --- Issue credentials -----------------------------------------------------

async function issueCredentials({ booking_uuid, user_id }) {
  return withTransaction(async (client) => {
    const { booking, role } = await loadBookingForUser(client, { booking_uuid, user_id });

    // Booking must still be active (scheduled, in_call, or completed for replay-info)
    if (booking.status !== 'scheduled' && booking.status !== 'in_call') {
      throw bad('meeting_not_active', `Booking status is ${booking.status}`);
    }
    if (!withinJoinWindow(booking)) {
      throw bad('outside_join_window', 'Join button is enabled 5 minutes before slot start through slot end');
    }

    const meeting = await getOrCreateMeeting(client, booking);
    const ttl = Math.max(60, Math.floor((new Date(booking.slot_end_at).getTime() - Date.now()) / 1000) + 60);
    const creds = agora.buildToken({ booking_uuid: booking.uuid, user_id, ttl_seconds: ttl });

    // Look up both display names so the room UI can label the local tile
    // ("You — Alice") and the remote tile ("Bob"), plus banner copy when
    // the remote drops ("Bob disconnected — billing paused").
    const names = (await client.query(
      `SELECT mu.full_name AS mentor_name, mu.avatar_url AS mentor_avatar,
              cu.full_name AS mentee_name, cu.avatar_url AS mentee_avatar
         FROM bookings b
         JOIN users mu ON mu.id = b.mentor_user_id
         JOIN users cu ON cu.id = b.mentee_user_id
        WHERE b.id = $1`,
      [booking.id]
    )).rows[0];
    const self_name        = role === 'mentor' ? names.mentor_name   : names.mentee_name;
    const self_avatar      = role === 'mentor' ? names.mentor_avatar : names.mentee_avatar;
    const counterpart_name = role === 'mentor' ? names.mentee_name   : names.mentor_name;
    const counterpart_avatar = role === 'mentor' ? names.mentee_avatar : names.mentor_avatar;

    return {
      meeting_uuid: meeting.uuid,
      booking_uuid: booking.uuid,
      role,
      slot_start_at: booking.slot_start_at,
      slot_end_at: booking.slot_end_at,
      per_minute_paise: booking.per_minute_paise_snapshot,
      self_name,
      self_avatar,
      counterpart_name,
      counterpart_avatar,
      counterpart_role: role === 'mentor' ? 'mentee' : 'mentor',
      ...creds,
    };
  });
}

// --- Presence events -------------------------------------------------------

async function recordPresence({ booking_uuid, user_id, kind }) {
  if (!['joined', 'left'].includes(kind)) throw bad('invalid_event_kind');

  return withTransaction(async (client) => {
    const { booking, role } = await loadBookingForUser(client, { booking_uuid, user_id });
    if (booking.status !== 'scheduled' && booking.status !== 'in_call') {
      throw bad('meeting_not_active');
    }
    const meeting = await getOrCreateMeeting(client, booking);

    const now = new Date();
    const presentCol   = role === 'mentor' ? 'mentor_present'         : 'mentee_present';
    const firstJoinCol = role === 'mentor' ? 'mentor_first_joined_at' : 'mentee_first_joined_at';
    const lastSeenCol  = role === 'mentor' ? 'mentor_last_seen_at'    : 'mentee_last_seen_at';

    if (kind === 'joined') {
      // Idempotent: if already true, no-op (but still log the event). Always
      // stamp last_seen_at so the staleness sweep doesn't immediately fire.
      await client.query(
        `UPDATE meetings SET ${presentCol} = TRUE,
            ${firstJoinCol} = COALESCE(${firstJoinCol}, $1),
            ${lastSeenCol} = $1
         WHERE id = $2`,
        [now, meeting.id]
      );
      await client.query(
        `INSERT INTO meeting_events (meeting_id, kind, payload)
         VALUES ($1, $2, $3)`,
        [meeting.id, role === 'mentor' ? 'mentor_join' : 'mentee_join', { ts: now.toISOString() }]
      );
    } else {
      if (meeting[presentCol]) {
        await client.query(`UPDATE meetings SET ${presentCol} = FALSE WHERE id = $1`, [meeting.id]);
      }
      await client.query(
        `INSERT INTO meeting_events (meeting_id, kind, payload)
         VALUES ($1, $2, $3)`,
        [meeting.id, role === 'mentor' ? 'mentor_leave' : 'mentee_leave', { ts: now.toISOString() }]
      );
    }

    // Reload meeting to compute the resulting billing_state transition
    const m = (await client.query(`SELECT * FROM meetings WHERE id = $1`, [meeting.id])).rows[0];
    const bothPresent = m.mentor_present && m.mentee_present;
    let newBillingState = m.billing_state;
    let billing_active_since = m.billing_active_since;

    if (bothPresent && (m.billing_state === 'idle' || m.billing_state === 'paused')) {
      newBillingState = 'active';
      billing_active_since = now;
      await client.query(
        `INSERT INTO meeting_events (meeting_id, kind, payload)
         VALUES ($1, 'billing_start', $2)`,
        [meeting.id, { ts: now.toISOString() }]
      );
    } else if (!bothPresent && m.billing_state === 'active') {
      // Roll the open active interval into billed_* before pausing.
      await billing.rollIntoBilled(client, meeting.id);
      newBillingState = 'paused';
      billing_active_since = null;
      await client.query(
        `INSERT INTO meeting_events (meeting_id, kind, payload)
         VALUES ($1, 'billing_pause', $2)`,
        [meeting.id, { ts: now.toISOString() }]
      );
    }

    if (newBillingState !== m.billing_state) {
      await client.query(
        `UPDATE meetings SET billing_state = $1, billing_active_since = $2 WHERE id = $3`,
        [newBillingState, billing_active_since, meeting.id]
      );
    }

    // Bookings: flip to 'in_call' on first join
    if (kind === 'joined' && booking.status === 'scheduled') {
      await client.query(`UPDATE bookings SET status = 'in_call' WHERE id = $1`, [booking.id]);
    }

    const final = (await client.query(`SELECT * FROM meetings WHERE id = $1`, [meeting.id])).rows[0];
    return publicMeeting(final);
  });
}

// --- End meeting (manual) --------------------------------------------------

async function endMeeting({ booking_uuid, user_id, reason }) {
  // Delegate to the billing engine — it handles roll-in, minimum, split,
  // ledger writes, and booking status updates atomically.
  const { booking, role } = await (async () => {
    const r = await query(
      `SELECT b.id, b.mentor_user_id, b.mentee_user_id
         FROM bookings b WHERE b.uuid = $1`,
      [booking_uuid]
    );
    if (!r.rows[0]) throw notFound('booking_not_found');
    const b = r.rows[0];
    const r2 = b.mentor_user_id === user_id ? 'mentor'
            : b.mentee_user_id === user_id ? 'mentee' : null;
    if (!r2) throw forbidden('not_a_party');
    return { booking: b, role: r2 };
  })();

  // Ensure a meeting row exists (covers the "end before anyone joined" path)
  await withTransaction(async (client) => {
    const exists = (await client.query(`SELECT id FROM meetings WHERE booking_id = $1`, [booking.id])).rows[0];
    if (!exists) {
      await client.query(
        `INSERT INTO meetings (booking_id, agora_channel_name) VALUES ($1, $2)`,
        [booking.id, agora.channelName(booking_uuid)]
      );
    }
  });

  const m = (await query(`SELECT id, billing_state FROM meetings WHERE booking_id = $1`, [booking.id])).rows[0];
  if (m.billing_state === 'finalized') {
    return publicMeeting((await query(`SELECT * FROM meetings WHERE id = $1`, [m.id])).rows[0]);
  }
  const end_reason = reason || (role === 'mentor' ? 'mentor_ended' : 'mentee_ended');
  const finalized = await billing.finalizeMeeting({ meeting_id: m.id, end_reason, by_user_id: user_id });
  return publicMeeting(finalized);
}

// --- Read ------------------------------------------------------------------

async function getMeeting({ booking_uuid, user_id }) {
  return withTransaction(async (client) => {
    const { booking } = await loadBookingForUser(client, { booking_uuid, user_id });
    const m = (await client.query(`SELECT * FROM meetings WHERE booking_id = $1`, [booking.id])).rows[0];
    if (!m) return null;
    return publicMeeting(m);
  });
}

function publicMeeting(m) {
  return {
    uuid: m.uuid,
    booking_id: m.booking_id,
    agora_channel_name: m.agora_channel_name,
    mentor_present: m.mentor_present,
    mentee_present: m.mentee_present,
    billing_state: m.billing_state,
    billing_active_since: m.billing_active_since,
    billed_paise: m.billed_paise,
    billed_seconds: m.billed_seconds,
    ended_at: m.ended_at,
    end_reason: m.end_reason,
    finalized_at: m.finalized_at,
    finalized_total_paise: m.finalized_total_paise,
    finalized_mentor_paise: m.finalized_mentor_paise,
    finalized_platform_paise: m.finalized_platform_paise,
  };
}

module.exports = {
  issueCredentials,
  recordPresence,
  endMeeting,
  getMeeting,
  withinJoinWindow,
  JOIN_WINDOW_BEFORE_MS,
};
