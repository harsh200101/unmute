'use strict';

const { query } = require('../config/db');
const { notFound, forbidden } = require('../utils/errors');

// Centralised notification creator. Other services call notify(...).
// All inserts are best-effort: failures are logged but never bubble up
// (notifications failing must not break the originating action).

async function notify({ user_id, kind, title, body, link_url, reference_table, reference_id, client }) {
  if (!user_id || !kind || !title) return null;
  const exec = client ? client.query.bind(client) : query;
  try {
    const r = await exec(
      `INSERT INTO notifications
         (user_id, kind, title, body, link_url, reference_table, reference_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [user_id, kind, title, body || null, link_url || null, reference_table || null, reference_id || null]
    );
    return r.rows[0];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] failed:', err.message, { user_id, kind });
    return null;
  }
}

// --- Read API --------------------------------------------------------------

async function list({ user_id, unread_only, limit = 50, offset = 0 }) {
  const limitN = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);
  const params = [user_id];
  let where = `user_id = $1`;
  if (unread_only) where += ` AND read_at IS NULL`;

  const r = await query(
    `SELECT id, kind, title, body, link_url, reference_table, reference_id, read_at, created_at
       FROM notifications
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT ${limitN} OFFSET ${offsetN}`,
    params
  );
  const total = await query(`SELECT COUNT(*)::int AS n FROM notifications WHERE ${where}`, params);
  const unread = await query(
    `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [user_id]
  );
  return {
    items: r.rows,
    total: total.rows[0].n,
    unread: unread.rows[0].n,
    limit: limitN,
    offset: offsetN,
  };
}

async function unreadCount(user_id) {
  const r = await query(
    `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [user_id]
  );
  return r.rows[0].n;
}

async function markRead({ user_id, notification_id }) {
  const r = await query(
    `UPDATE notifications SET read_at = NOW()
      WHERE id = $1 AND user_id = $2 AND read_at IS NULL
      RETURNING id`,
    [notification_id, user_id]
  );
  if (r.rowCount === 0) {
    // Either doesn't exist, doesn't belong to user, or already read.
    const exists = await query(
      `SELECT user_id FROM notifications WHERE id = $1`,
      [notification_id]
    );
    if (!exists.rows[0]) throw notFound('notification_not_found');
    if (exists.rows[0].user_id !== user_id) throw forbidden('not_your_notification');
    // else already read — idempotent OK
  }
  return { ok: true };
}

async function markAllRead(user_id) {
  const r = await query(
    `UPDATE notifications SET read_at = NOW()
      WHERE user_id = $1 AND read_at IS NULL`,
    [user_id]
  );
  return { ok: true, marked: r.rowCount };
}

module.exports = { notify, list, unreadCount, markRead, markAllRead };
