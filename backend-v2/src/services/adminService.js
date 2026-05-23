'use strict';

const { query, withTransaction } = require('../config/db');
const { bad, notFound } = require('../utils/errors');
const notify = require('./notificationService');
const billing = require('./billingEngine');

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

    await notify.notify({
      client,
      user_id: before.rows[0].user_id,
      kind: 'mentor_approved',
      title: 'Your mentor application was approved 🎉',
      body: notes || 'You can now publish availability and accept bookings.',
      link_url: '/mentor/dashboard',
      reference_table: 'mentor_profiles',
      reference_id: mentor_id,
      send_email: true,
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

    await notify.notify({
      client,
      user_id: before.rows[0].user_id,
      kind: 'mentor_rejected',
      title: 'Your mentor application was not approved',
      body: notes || 'Please review the feedback and reapply.',
      link_url: '/mentor/apply',
      reference_table: 'mentor_profiles',
      reference_id: mentor_id,
      send_email: true,
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

// --- Admin tools: meetings + bookings + audit log -------------------------

async function listActiveMeetings({ limit = 50, offset = 0 } = {}) {
  const limitN = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);
  const r = await query(
    `SELECT m.id, m.uuid, m.billing_state, m.billed_paise, m.billed_seconds,
            m.grace_started_at, m.low_balance_warned_at, m.created_at,
            b.uuid AS booking_uuid, b.slot_start_at, b.slot_end_at, b.status AS booking_status,
            mu.email AS mentor_email, mu.full_name AS mentor_name,
            cu.email AS mentee_email, cu.full_name AS mentee_name
       FROM meetings m
       JOIN bookings b ON b.id = m.booking_id
       JOIN users mu ON mu.id = b.mentor_user_id
       JOIN users cu ON cu.id = b.mentee_user_id
      WHERE m.billing_state IN ('idle','active','paused','low_balance_grace')
      ORDER BY b.slot_start_at ASC
      LIMIT ${limitN} OFFSET ${offsetN}`
  );
  return { items: r.rows, limit: limitN, offset: offsetN };
}

async function forceEndMeeting({ admin_user_id, meeting_id, reason }) {
  const before = (await query(`SELECT * FROM meetings WHERE id = $1`, [meeting_id])).rows[0];
  if (!before) throw notFound('meeting_not_found');
  if (before.billing_state === 'finalized') {
    return billing.finalizeMeeting === undefined ? before : before; // already done
  }
  const after = await billing.finalizeMeeting({
    meeting_id,
    end_reason: 'admin_forced',
    by_user_id: admin_user_id,
  });
  // Audit
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO admin_audit_log
         (admin_user_id, action, target_table, target_id, before_state, after_state, notes)
       VALUES ($1, 'force_end_meeting', 'meetings', $2, $3, $4, $5)`,
      [admin_user_id, meeting_id, before, after, reason || null]
    );
  });
  return after;
}

// Platform-funded refund. Credits mentee wallet, debits platform wallet.
// Mentor's earnings are NOT clawed back (admin tool for goodwill).
async function refundBooking({ admin_user_id, booking_id, amount_paise, reason }) {
  const amt = Number(amount_paise);
  if (!Number.isInteger(amt) || amt <= 0) throw bad('invalid_amount', 'amount_paise must be a positive integer');

  return withTransaction(async (client) => {
    const b = (await client.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [booking_id])).rows[0];
    if (!b) throw notFound('booking_not_found');

    // Find the meeting + total already charged
    const m = (await client.query(`SELECT * FROM meetings WHERE booking_id = $1`, [b.id])).rows[0];
    const max_refundable = m ? (m.finalized_total_paise || m.settled_paise || 0) : 0;
    if (amt > max_refundable) {
      throw bad('amount_exceeds_charge', `Maximum refundable is ₹${(max_refundable / 100).toFixed(2)}`);
    }

    const menteeWallet = (await client.query(
      `SELECT id FROM wallets WHERE user_id = $1 AND kind = 'mentee' FOR UPDATE`,
      [b.mentee_user_id]
    )).rows[0];
    if (!menteeWallet) throw notFound('mentee_wallet_not_found');

    const platformWallet = (await client.query(
      `SELECT id, balance_paise FROM wallets WHERE kind = 'platform' LIMIT 1 FOR UPDATE`
    )).rows[0];
    if (!platformWallet) throw notFound('platform_wallet_not_found');
    if (platformWallet.balance_paise < amt) {
      throw bad('platform_insufficient', 'Platform wallet has insufficient balance to fund this refund');
    }

    const refund_key = `refund:booking:${b.uuid}:${Date.now()}`;

    // Credit mentee
    await client.query(
      `INSERT INTO wallet_transactions
         (wallet_id, direction, amount_paise, reason,
          reference_table, reference_id, idempotency_key, description, balance_after_paise)
       VALUES ($1, 'credit', $2, 'refund', 'bookings', $3, $4, $5, 0)`,
      [menteeWallet.id, amt, b.id, refund_key + ':mentee', reason || `Refund for booking ${b.uuid}`]
    );
    // Debit platform
    await client.query(
      `INSERT INTO wallet_transactions
         (wallet_id, direction, amount_paise, reason,
          reference_table, reference_id, idempotency_key, description, balance_after_paise)
       VALUES ($1, 'debit', $2, 'refund', 'bookings', $3, $4, $5, 0)`,
      [platformWallet.id, amt, b.id, refund_key + ':platform', `Platform-funded refund for booking ${b.uuid}`]
    );

    await client.query(
      `INSERT INTO admin_audit_log
         (admin_user_id, action, target_table, target_id, after_state, notes)
       VALUES ($1, 'refund_booking', 'bookings', $2, $3, $4)`,
      [admin_user_id, b.id, { amount_paise: amt }, reason || null]
    );

    await notify.notify({
      client,
      user_id: b.mentee_user_id,
      kind: 'refund_issued',
      title: `Refund of ₹${(amt / 100).toFixed(2)} credited to your wallet`,
      body: reason || null,
      link_url: '/wallet',
      send_email: true,
      reference_table: 'bookings',
      reference_id: b.id,
    });

    return { ok: true, refunded_paise: amt };
  });
}

async function listAuditLog({ admin_user_id, action, target_table, limit = 100, offset = 0 } = {}) {
  const limitN = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const offsetN = Math.max(Number(offset) || 0, 0);
  const params = [];
  const where = [];
  if (admin_user_id) {
    params.push(admin_user_id);
    where.push(`al.admin_user_id = $${params.length}`);
  }
  if (action) {
    params.push(action);
    where.push(`al.action = $${params.length}`);
  }
  if (target_table) {
    params.push(target_table);
    where.push(`al.target_table = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const r = await query(
    `SELECT al.id, al.admin_user_id, al.action, al.target_table, al.target_id,
            al.notes, al.created_at,
            u.email AS admin_email, u.full_name AS admin_name
       FROM admin_audit_log al
       JOIN users u ON u.id = al.admin_user_id
       ${whereSql}
       ORDER BY al.created_at DESC
       LIMIT ${limitN} OFFSET ${offsetN}`,
    params
  );
  const total = await query(
    `SELECT COUNT(*)::int AS n FROM admin_audit_log al ${whereSql}`,
    params
  );
  return { items: r.rows, total: total.rows[0].n, limit: limitN, offset: offsetN };
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

// --- Platform-wide stats + recent activity ---------------------------------
//
// One round-trip per "panel" of the admin dashboard. Each query is cheap
// (COUNT(*) FILTER + small ORDER BY LIMIT) so we can run them all in
// parallel via Promise.all for a single API hit.

async function getStats() {
  const [users, bookings, meetings, money, kyc, mentorApps, withdrawals] =
    await Promise.all([
      // Users by role
      query(`
        SELECT
          COUNT(*)::int                                                   AS total,
          COUNT(*) FILTER (WHERE role = 'mentee')::int                    AS mentees,
          COUNT(*) FILTER (WHERE role = 'mentor')::int                    AS mentors,
          COUNT(*) FILTER (WHERE role = 'admin'  AND email <> 'system@unmute.internal')::int AS admins,
          COUNT(*) FILTER (WHERE email_verified_at IS NOT NULL)::int      AS verified,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_last_7d,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_last_30d
        FROM users
        WHERE email <> 'system@unmute.internal'`),
      // Bookings by status (lifetime + today)
      query(`
        SELECT
          COUNT(*)::int                                                          AS total,
          COUNT(*) FILTER (WHERE status = 'scheduled')::int                      AS scheduled,
          COUNT(*) FILTER (WHERE status = 'in_call')::int                        AS in_call,
          COUNT(*) FILTER (WHERE status = 'completed')::int                      AS completed,
          COUNT(*) FILTER (WHERE status = 'no_show')::int                        AS no_show,
          COUNT(*) FILTER (WHERE status LIKE 'cancelled%')::int                  AS cancelled,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int                AS today_created,
          COUNT(*) FILTER (WHERE slot_start_at >= CURRENT_DATE
                              AND slot_start_at <  CURRENT_DATE + INTERVAL '1 day')::int AS today_scheduled
        FROM bookings`),
      // Meeting durations + live count
      query(`
        SELECT
          COUNT(*) FILTER (WHERE billing_state IN ('active','paused','low_balance_grace'))::int AS live_now,
          COALESCE(SUM(billed_seconds), 0)::bigint                              AS total_billed_seconds,
          COUNT(*) FILTER (WHERE finalized_at IS NOT NULL)::int                 AS finalized
        FROM meetings`),
      // Money: lifetime platform revenue + mentor payouts + wallet floats
      query(`
        SELECT
          COALESCE((SELECT SUM(amount_paise)::bigint FROM wallet_transactions
                     WHERE reason = 'platform_fee'      AND direction = 'credit'), 0) AS platform_revenue_paise,
          COALESCE((SELECT SUM(amount_paise)::bigint FROM wallet_transactions
                     WHERE reason = 'session_payout'    AND direction = 'credit'), 0) AS mentor_payouts_paise,
          COALESCE((SELECT SUM(amount_paise)::bigint FROM wallet_transactions
                     WHERE reason = 'topup_completed'   AND direction = 'credit'), 0) AS topups_paise,
          COALESCE((SELECT SUM(balance_paise)::bigint  FROM wallets WHERE kind = 'mentee'),  0) AS mentee_wallets_paise,
          COALESCE((SELECT SUM(balance_paise)::bigint  FROM wallets WHERE kind = 'mentor'),  0) AS mentor_wallets_paise,
          COALESCE((SELECT SUM(balance_paise)::bigint  FROM wallets WHERE kind = 'platform'),0) AS platform_wallet_paise
      `),
      // KYC pending
      query(`SELECT COUNT(*)::int AS pending FROM mentor_kyc WHERE status = 'pending'`),
      // Mentor applications pending
      query(`SELECT COUNT(*)::int AS pending FROM mentor_profiles WHERE verification_status = 'pending'`),
      // Withdrawals
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::int                       AS pending,
          COUNT(*) FILTER (WHERE status = 'processing')::int                    AS processing,
          COALESCE(SUM(amount_paise) FILTER (WHERE status = 'pending'), 0)::bigint AS pending_paise
        FROM withdrawals`),
    ]);

  return {
    users:      users.rows[0],
    bookings:   bookings.rows[0],
    meetings:   meetings.rows[0],
    money:      money.rows[0],
    kyc_pending:           kyc.rows[0].pending,
    mentor_apps_pending:   mentorApps.rows[0].pending,
    withdrawals: withdrawals.rows[0],
  };
}

// Recent activity feed — mixes the 4 most useful tables into a single,
// chronologically-ordered list capped at `limit`. Helps admins see "what's
// happening RIGHT NOW" without flipping between tabs.
async function getRecentActivity({ limit = 20 } = {}) {
  const limitN = Math.min(Math.max(Number(limit) || 20, 1), 100);

  // We union 4 streams. Each stream emits the same {kind, at, title, ...}
  // shape so the frontend can render a single timeline.
  const r = await query(`
    SELECT * FROM (
      -- New signups
      SELECT
        'user_signup'                       AS kind,
        u.created_at                        AS at,
        u.id                                AS ref_id,
        u.full_name                         AS title,
        u.email                             AS subtitle,
        u.role                              AS extra
      FROM users u
      WHERE u.email <> 'system@unmute.internal'
      UNION ALL
      -- New bookings
      SELECT
        'booking_created'                   AS kind,
        b.created_at                        AS at,
        b.id                                AS ref_id,
        cu.full_name || ' → ' || mu.full_name AS title,
        b.status                            AS subtitle,
        b.uuid::text                        AS extra
      FROM bookings b
        JOIN users cu ON cu.id = b.mentee_user_id
        JOIN users mu ON mu.id = b.mentor_user_id
      UNION ALL
      -- Withdrawal requests
      SELECT
        'withdrawal'                        AS kind,
        w.requested_at                      AS at,
        w.id                                AS ref_id,
        mu.full_name                        AS title,
        w.status                            AS subtitle,
        (w.amount_paise::text)              AS extra
      FROM withdrawals w
        JOIN users mu ON mu.id = w.mentor_user_id
      UNION ALL
      -- KYC submissions
      SELECT
        'kyc_submitted'                     AS kind,
        k.submitted_at                      AS at,
        k.id                                AS ref_id,
        mu.full_name                        AS title,
        k.status                            AS subtitle,
        NULL                                AS extra
      FROM mentor_kyc k
        JOIN users mu ON mu.id = k.mentor_user_id
    ) AS feed
    ORDER BY at DESC
    LIMIT ${limitN}
  `);

  return { items: r.rows };
}

module.exports = {
  listUsers, patchUser,
  listMentorApplications, approveMentor, rejectMentor,
  listActiveMeetings, forceEndMeeting,
  refundBooking, listAuditLog,
  getStats, getRecentActivity,
};
