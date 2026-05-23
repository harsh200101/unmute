'use strict';

const { query, withTransaction } = require('../config/db');
const { bad, notFound, forbidden } = require('../utils/errors');

// Mentor writes; both parties read.
// One row per booking, identified by booking.uuid.

async function get({ user_id, booking_uuid }) {
  const r = await query(
    `SELECT b.*, sn.*
       FROM bookings b
       LEFT JOIN session_notes sn ON sn.booking_id = b.id
      WHERE b.uuid = $1`,
    [booking_uuid]
  );
  const row = r.rows[0];
  if (!row || !row.mentor_user_id) throw notFound('booking_not_found');
  if (row.mentor_user_id !== user_id && row.mentee_user_id !== user_id) {
    throw forbidden('not_a_party');
  }
  if (!row.id || row.author_user_id == null) {
    // join produced booking columns but no notes yet
    if (!row.author_user_id && !row.discussion_summary && !row.key_takeaways) {
      return { notes: null };
    }
  }
  if (row.discussion_summary === null && row.key_takeaways === null &&
      row.action_items === null && row.additional_notes === null && !row.uuid) {
    return { notes: null };
  }
  return { notes: publicNotes(row) };
}

async function upsert({ user_id, booking_uuid, payload }) {
  return withTransaction(async (client) => {
    const b = (await client.query(`SELECT * FROM bookings WHERE uuid = $1 FOR UPDATE`, [booking_uuid])).rows[0];
    if (!b) throw notFound('booking_not_found');
    if (b.mentor_user_id !== user_id) {
      throw forbidden('mentor_only', 'Only the session mentor can write notes');
    }
    if (b.status !== 'completed' && b.status !== 'in_call') {
      throw bad('not_writable', `Booking status is ${b.status}; notes can be written during/after the session`);
    }

    const fields = ['discussion_summary', 'key_takeaways', 'action_items', 'additional_notes'];
    const updates = {};
    for (const f of fields) {
      if (typeof payload?.[f] === 'string') updates[f] = payload[f];
    }
    const setCols = Object.keys(updates);
    if (!setCols.length) throw bad('nothing_to_update', 'Provide at least one of: ' + fields.join(', '));

    // UPSERT keyed on booking_id (UNIQUE)
    const insertCols = ['booking_id', 'author_user_id', ...setCols];
    const insertVals = [b.id, user_id, ...setCols.map((c) => updates[c])];
    const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(', ');
    const onConflictSet = setCols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');

    const r = await client.query(
      `INSERT INTO session_notes (${insertCols.join(', ')})
         VALUES (${placeholders})
       ON CONFLICT (booking_id) DO UPDATE
         SET ${onConflictSet}
       RETURNING *`,
      insertVals
    );
    return { notes: publicNotes(r.rows[0]) };
  });
}

// Mentee's "all my session notes" history view
async function listMyHistory({ user_id, limit = 50, offset = 0 }) {
  const limitN = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);
  const r = await query(
    `SELECT sn.*, b.uuid AS booking_uuid, b.slot_start_at,
            mu.full_name AS mentor_name, mu.avatar_url AS mentor_avatar
       FROM session_notes sn
       JOIN bookings b ON b.id = sn.booking_id
       JOIN users mu   ON mu.id = b.mentor_user_id
      WHERE b.mentee_user_id = $1
      ORDER BY b.slot_start_at DESC
      LIMIT ${limitN} OFFSET ${offsetN}`,
    [user_id]
  );
  return {
    items: r.rows.map((row) => ({
      ...publicNotes(row),
      booking_uuid: row.booking_uuid,
      slot_start_at: row.slot_start_at,
      mentor: { full_name: row.mentor_name, avatar_url: row.mentor_avatar },
    })),
    limit: limitN, offset: offsetN,
  };
}

function publicNotes(n) {
  return {
    uuid: n.uuid,
    booking_id: n.booking_id,
    discussion_summary: n.discussion_summary,
    key_takeaways: n.key_takeaways,
    action_items: n.action_items,
    additional_notes: n.additional_notes,
    created_at: n.created_at,
    updated_at: n.updated_at,
  };
}

module.exports = { get, upsert, listMyHistory };
