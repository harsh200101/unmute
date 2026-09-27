'use strict';

const { query } = require('../config/db');
const { notFound, bad } = require('../utils/errors');

const PUBLIC_FIELDS = [
  'id', 'uuid', 'email', 'full_name', 'avatar_url', 'bio', 'phone',
  'date_of_birth', 'gender', 'marital_status', 'location_city', 'location_country',
  'preferred_language', 'preferences', 'role', 'email_verified_at',
  'no_show_count', 'late_cancel_count', 'created_at',
];
const PUBLIC_FIELDS_SQL = PUBLIC_FIELDS.join(', ');

// Whitelist of fields the user can edit on themselves via PATCH /api/me.
// Email + role + verification + counters are deliberately NOT here.
const SELF_EDITABLE = new Set([
  'full_name', 'avatar_url', 'bio', 'phone',
  'date_of_birth', 'gender', 'marital_status',
  'location_city', 'location_country', 'preferred_language', 'preferences',
]);

// Shape the /api/me response.
//
// The row alone is NOT the API contract. `email_verified_at` is a timestamp
// column; the frontend gates the dashboard banner, the mentor application and
// the profile card on a boolean `email_verified`, which is what
// publicUser() in authService.js returns from /auth/login, /auth/register and
// /auth/verify-email.
//
// Those two disagreed, and it was invisible in review because both shapes look
// plausible. /auth/login sets user.email_verified correctly, but AuthContext's
// boot sequence immediately overwrites the whole user object with GET /api/me,
// so in practice the client only ever saw the /api/me shape and
// user.email_verified was permanently undefined. Every user therefore appeared
// unverified: the "verify your email" banner showed on the dashboard, mentor
// apply was blocked, and tapping resend hit a backend that correctly replied
// "already verified" and sent nothing. A verified user chasing a resend that
// could never arrive.
function selfUser(row) {
  return { ...row, email_verified: !!row.email_verified_at };
}

async function getMe(user_id) {
  const r = await query(`SELECT ${PUBLIC_FIELDS_SQL} FROM users WHERE id = $1`, [user_id]);
  const u = r.rows[0];
  if (!u) throw notFound('user_not_found');
  return selfUser(u);
}

async function updateMe(user_id, patch = {}) {
  const keys = Object.keys(patch).filter((k) => SELF_EDITABLE.has(k));
  if (keys.length === 0) {
    return getMe(user_id);
  }

  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map((k) => normalizeValue(k, patch[k]));

  const r = await query(
    `UPDATE users SET ${sets} WHERE id = $1 RETURNING ${PUBLIC_FIELDS_SQL}`,
    [user_id, ...values]
  );
  // Same reasoning as getMe: the boolean gate has to survive a profile save
  // too, or saving your bio would silently flip the dashboard back to
  // "unverified" and drop the resend button back onto the page.
  return selfUser(r.rows[0]);
}

function normalizeValue(field, value) {
  if (field === 'preferences') {
    if (value === null || value === undefined) return {};
    if (typeof value !== 'object') {
      throw bad('invalid_preferences', 'preferences must be an object');
    }
    return value;
  }
  if (field === 'gender' && value === '') return null;
  if (field === 'marital_status' && value === '') return null;
  if (field === 'date_of_birth' && value === '') return null;
  return value;
}

module.exports = { getMe, updateMe };
