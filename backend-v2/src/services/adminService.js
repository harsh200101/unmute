'use strict';

const { query, withTransaction } = require('../config/db');
const { bad, notFound } = require('../utils/errors');

// --- Users ------------------------------------------------------------------

async function listUsers({ q, role, is_active, limit = 50, offset = 0 } = {}) {
  const limitN = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);

  const params = [];
  const where = [];
  if (q) {
    params.push(`%${q}%`);
    where.push(`(email ILIKE $${params.length} OR full_name ILIKE $${params.length})`);
  }
  if (role) {
    params.push(role);
    where.push(`role = $${params.length}`);
  }
  if (typeof is_active === 'boolean') {
    params.push(is_active);
    where.push(`is_active = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const list = await query(
    `SELECT id, uuid, email, full_name, role, is_active,
            email_verified_at, no_show_count, late_cancel_count, created_at
       FROM users ${whereSql}
       ORDER BY created_at DESC
       LIMIT ${limitN} OFFSET ${offsetN}`,
    params
  );
  const total = await query(`SELECT COUNT(*)::int AS n FROM users ${whereSql}`, params);

  return { items: list.rows, total: total.rows[0].n, limit: limitN, offset: offsetN };
}

const USER_PATCHABLE = new Set(['is_active', 'role']);

async function patchUser({ admin_user_id, target_id, patch }) {
  const keys = Object.keys(patch || {}).filter((k) => USER_PATCHABLE.has(k));
  if (!keys.length) throw bad('no_editable_fields', 'Nothing to update');

  if (keys.includes('role') && !['mentee', 'mentor', 'admin'].includes(patch.role)) {
    throw bad('invalid_role');
  }

  return withTransaction(async (client) => {
    const before = await client.query(`SELECT * FROM users WHERE id = $1`, [target_id]);
    if (!before.rows[0]) throw notFound('user_not_found');

    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = keys.map((k) => patch[k]);
    const after = await client.query(
      `UPDATE users SET ${sets} WHERE id = $1 RETURNING *`,
      [target_id, ...values]
    );

    await audit(client, {
      admin_user_id,
      action: 'patch_user',
      target_table: 'users',
      target_id,
      before_state: before.rows[0],
      after_state: after.rows[0],
    });

    return publicUser(after.rows[0]);
  });
}

// --- Mentor applications ----------------------------------------------------

async function listMentorApplications({ status = 'pending', limit = 50, offset = 0 } = {}) {
  const limitN = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);

  const res = await query(
    `SELECT m.id, m.uuid, m.verification_status, m.verification_notes,
            m.headline, m.bio, m.years_experience, m.linkedin_url,
            m.languages, m.created_at,
            u.id AS user_id, u.email, u.full_name, u.avatar_url,
            pt.name AS tier_name, pt.display_name AS tier_display, pt.per_minute_paise
       FROM mentor_profiles m
       JOIN users u          ON u.id = m.user_id
       JOIN pricing_tiers pt ON pt.id = m.pricing_tier_id
      WHERE m.verification_status = $1
      ORDER BY m.created_at ASC
      LIMIT ${limitN} OFFSET ${offsetN}`,
    [status]
  );
  return { items: res.rows, limit: limitN, offset: offsetN };
}

async function approveMentor({ admin_user_id, mentor_id, notes }) {
  return withTransaction(async (client) => {
    const before = await client.query(`SELECT * FROM mentor_profiles WHERE id = $1 FOR UPDATE`, [mentor_id]);
    if (!before.rows[0]) throw notFound('mentor_application_not_found');
    if (before.rows[0].verification_status !== 'pending') {
      throw bad('already_decided', `Already ${before.rows[0].verification_status}`);
    }

    const after = await client.query(
      `UPDATE mentor_profiles
         SET verification_status = 'approved',
             verification_notes  = $1,
             verified_at         = NOW(),
             verified_by_user_id = $2
       WHERE id = $3
       RETURNING *`,
      [notes || null, admin_user_id, mentor_id]
    );

    await audit(client, {
      admin_user_id,
      action: 'approve_mentor',
      target_table: 'mentor_profiles',
      target_id: mentor_id,
      before_state: before.rows[0],
      after_state: after.rows[0],
      notes,
    });

    return after.rows[0];
  });
}

async function rejectMentor({ admin_user_id, mentor_id, notes }) {
  return withTransaction(async (client) => {
    const before = await client.query(`SELECT * FROM mentor_profiles WHERE id = $1 FOR UPDATE`, [mentor_id]);
    if (!before.rows[0]) throw notFound('mentor_application_not_found');
    if (before.rows[0].verification_status !== 'pending') {
      throw bad('already_decided', `Already ${before.rows[0].verification_status}`);
    }

    const after = await client.query(
      `UPDATE mentor_profiles
         SET verification_status = 'rejected',
             verification_notes  = $1,
             verified_at         = NOW(),
             verified_by_user_id = $2
       WHERE id = $3
       RETURNING *`,
      [notes || null, admin_user_id, mentor_id]
    );

    // Demote user back to mentee
    await client.query(
      `UPDATE users SET role = 'mentee' WHERE id = $1`,
      [before.rows[0].user_id]
    );

    await audit(client, {
      admin_user_id,
      action: 'reject_mentor',
      target_table: 'mentor_profiles',
      target_id: mentor_id,
      before_state: before.rows[0],
      after_state: after.rows[0],
      notes,
    });

    return after.rows[0];
  });
}

// --- Helpers ----------------------------------------------------------------

async function audit(client, { admin_user_id, action, target_table, target_id, before_state, after_state, notes }) {
  await client.query(
    `INSERT INTO admin_audit_log
       (admin_user_id, action, target_table, target_id, before_state, after_state, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [admin_user_id, action, target_table, target_id, before_state || null, after_state || null, notes || null]
  );
}

function publicUser(u) {
  return {
    id: u.id, uuid: u.uuid, email: u.email, full_name: u.full_name,
    role: u.role, is_active: u.is_active,
    email_verified_at: u.email_verified_at,
    no_show_count: u.no_show_count, late_cancel_count: u.late_cancel_count,
    created_at: u.created_at,
  };
}

module.exports = { listUsers, patchUser, listMentorApplications, approveMentor, rejectMentor };
