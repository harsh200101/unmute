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

async function getMe(user_id) {
  const r = await query(`SELECT ${PUBLIC_FIELDS_SQL} FROM users WHERE id = $1`, [user_id]);
  const u = r.rows[0];
  if (!u) throw notFound('user_not_found');
  return u;
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
  return r.rows[0];
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
