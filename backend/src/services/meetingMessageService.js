'use strict';

// In-call chat. Messages are scoped to a single meeting (one per booking).
// The room UI polls `list({ since_id })` every ~2 s; sending uses `send()`.
// Persistence is intentional: post-call, both parties can read back what was
// said. Authorization is enforced via the booking's mentor/mentee pair —
// nobody else can list or send for a given meeting.

const { query, withTransaction } = require('../config/db');
const { bad, notFound, forbidden } = require('../utils/errors');

const MAX_BODY_LEN = 2000;
const LIST_LIMIT_DEFAULT = 50;
const LIST_LIMIT_MAX = 200;

async function loadMeetingForUser(client, { booking_uuid, user_id }) {
  const r = await client.query(
    `SELECT m.id AS meeting_id, m.uuid AS meeting_uuid,
            b.id AS booking_id, b.mentor_user_id, b.mentee_user_id, b.status
       FROM meetings m
       JOIN bookings b ON b.id = m.booking_id
      WHERE b.uuid = $1`,
    [booking_uuid]
  );
  const row = r.rows[0];
  if (!row) throw notFound('meeting_not_found');
  if (row.mentor_user_id !== user_id && row.mentee_user_id !== user_id) {
    throw forbidden('not_a_party');
  }
  return row;
}

async function list({ booking_uuid, user_id, since_id = 0, limit = LIST_LIMIT_DEFAULT }) {
  const lim = Math.min(Math.max(Number(limit) || LIST_LIMIT_DEFAULT, 1), LIST_LIMIT_MAX);
  const sinceN = Math.max(Number(since_id) || 0, 0);

  return withTransaction(async (client) => {
    const m = await loadMeetingForUser(client, { booking_uuid, user_id });

    // ORDER BY id ASC so the poller can simply append to its local list and
    // remember the last id. We still cap at `limit` rows; if the user was
    // away from the tab for a long time and there are more than `limit`
    // unseen messages, they'll need an extra poll round-trip to fully catch
    // up. Fine for a 2-person chat.
    const r = await client.query(
      `SELECT mm.id, mm.body, mm.created_at,
              mm.sender_user_id,
              u.full_name AS sender_name
         FROM meeting_messages mm
         JOIN users u ON u.id = mm.sender_user_id
        WHERE mm.meeting_id = $1
          AND mm.id > $2
        ORDER BY mm.id ASC
        LIMIT $3`,
      [m.meeting_id, sinceN, lim]
    );
    return {
      items: r.rows,
      meeting_uuid: m.meeting_uuid,
    };
  });
}

async function send({ booking_uuid, user_id, body }) {
  const text = (body || '').trim();
  if (!text) throw bad('empty_message', 'Message body is required');
  if (text.length > MAX_BODY_LEN) throw bad('message_too_long', `Message exceeds ${MAX_BODY_LEN} characters`);

  return withTransaction(async (client) => {
    const m = await loadMeetingForUser(client, { booking_uuid, user_id });

    // Only allow chatting in an active meeting (scheduled / in_call). After
    // the call has been finalized (status=completed/cancelled_*) the chat
    // is read-only — no new messages, but the history is still listable.
    if (m.status !== 'scheduled' && m.status !== 'in_call') {
      throw bad('meeting_not_active', 'Cannot send messages after the meeting has ended');
    }

    const r = await client.query(
      `INSERT INTO meeting_messages (meeting_id, sender_user_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, body, created_at, sender_user_id`,
      [m.meeting_id, user_id, text]
    );
    const msg = r.rows[0];

    // Hydrate sender_name from the same client so the caller can append
    // it to its local state without a second round-trip.
    const u = await client.query(`SELECT full_name FROM users WHERE id = $1`, [user_id]);
    msg.sender_name = u.rows[0]?.full_name || '';

    return { message: msg, meeting_uuid: m.meeting_uuid };
  });
}

module.exports = { list, send };
