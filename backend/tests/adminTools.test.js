'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, truncateAll, seedReferenceData,
  createUserWithToken, createAdminWithToken,
} = require('./_helpers');

// --- Fixtures --------------------------------------------------------------

async function setupPlatformWallet(starting_balance_paise = 0) {
  const sys = await query(
    `INSERT INTO users (email, full_name, role, is_active, email_verified_at)
     VALUES ('system@unmute.internal', 'unmute Platform', 'admin', TRUE, NOW())
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`
  );
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'platform', $2)
     ON CONFLICT (user_id, kind) DO UPDATE SET balance_paise = $2`,
    [sys.rows[0].id, starting_balance_paise]
  );
}

async function makeApprovedMentor() {
  const { user, access_token } = await createUserWithToken({
    role: 'mentor',
    email: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@t.local`,
  });
  const tier = (await query(`SELECT id FROM pricing_tiers WHERE name='standard'`)).rows[0];
  await query(
    `INSERT INTO mentor_profiles
       (user_id, pricing_tier_id, headline, bio, timezone, verification_status, verified_at)
     VALUES ($1, $2, 'h', 'b', 'UTC', 'approved', NOW())`,
    [user.id, tier.id]
  );
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentor', 0)
     ON CONFLICT (user_id, kind) DO NOTHING`,
    [user.id]
  );
  return { user, access_token };
}

async function makeMentee(balance_paise = 0) {
  const { user, access_token } = await createUserWithToken({
    role: 'mentee',
    email: `mentee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@t.local`,
  });
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentee', $2)
     ON CONFLICT (user_id, kind) DO UPDATE SET balance_paise = $2`,
    [user.id, balance_paise]
  );
  return { user, access_token };
}

async function makeBooking({ mentor_user_id, mentee_user_id, status = 'scheduled', when }) {
  const start = when || new Date(Date.now() + 60_000);
  const end = new Date(new Date(start).getTime() + 60 * 60_000);
  const r = await query(
    `INSERT INTO bookings
       (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
        per_minute_paise_snapshot, status)
     VALUES ($1, $2, $3, $4, 1000, $5)
     RETURNING *`,
    [mentor_user_id, mentee_user_id, new Date(start).toISOString(), end.toISOString(), status]
  );
  return r.rows[0];
}

beforeEach(async () => {
  await truncateAll();
  await seedReferenceData();
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

// --- Active meetings list -------------------------------------------------

describe('GET /api/admin/meetings/active', () => {
  test('returns meetings in non-finalized states', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee(100000);
    const admin = await createAdminWithToken();
    await setupPlatformWallet();

    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      when: new Date(Date.now() + 60_000),
    });
    await query(
      `INSERT INTO meetings (booking_id, agora_channel_name, billing_state)
       VALUES ($1, 'test-1', 'active')`,
      [b.id]
    );

    const r = await request(app)
      .get('/api/admin/meetings/active')
      .set('Authorization', `Bearer ${admin.access_token}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(1);
    expect(r.body.items[0].mentor_email).toBeTruthy();
    expect(r.body.items[0].mentee_email).toBeTruthy();
  });

  test('skips finalized meetings', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee(100000);
    const admin = await createAdminWithToken();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });
    await query(
      `INSERT INTO meetings (booking_id, agora_channel_name, billing_state, finalized_at)
       VALUES ($1, 'test-2', 'finalized', NOW())`,
      [b.id]
    );
    const r = await request(app)
      .get('/api/admin/meetings/active')
      .set('Authorization', `Bearer ${admin.access_token}`);
    expect(r.body.items.length).toBe(0);
  });
});

// --- Force-end meeting ----------------------------------------------------

describe('POST /api/admin/meetings/:id/force-end', () => {
  test('finalizes a stuck active meeting with end_reason=admin_forced', async () => {
    await setupPlatformWallet();
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee(100000);
    const admin = await createAdminWithToken();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });

    // Create meeting in 'active' with both joined + some elapsed time
    const start = new Date(Date.now() - 600_000).toISOString(); // 10 min ago
    const mi = (await query(
      `INSERT INTO meetings
         (booking_id, agora_channel_name, mentor_present, mentee_present,
          mentor_first_joined_at, mentee_first_joined_at,
          billing_state, billing_active_since)
       VALUES ($1, 'force-test', TRUE, TRUE, $2, $2, 'active', $2)
       RETURNING id`,
      [b.id, start]
    )).rows[0];

    const r = await request(app)
      .post(`/api/admin/meetings/${mi.id}/force-end`)
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ reason: 'Stuck call' });
    expect(r.status).toBe(200);
    expect(r.body.meeting.billing_state).toBe('finalized');
    expect(r.body.meeting.end_reason).toBe('admin_forced');

    // Audit row
    const audit = await query(
      `SELECT action, notes FROM admin_audit_log WHERE target_table = 'meetings' AND target_id = $1`,
      [mi.id]
    );
    expect(audit.rows.some((r) => r.action === 'force_end_meeting' && r.notes === 'Stuck call')).toBe(true);
  });

  test('non-admin 403', async () => {
    const u = await createUserWithToken();
    const r = await request(app)
      .post('/api/admin/meetings/123/force-end')
      .set('Authorization', `Bearer ${u.access_token}`)
      .send();
    expect(r.status).toBe(403);
  });
});

// --- Refund ----------------------------------------------------------------

describe('POST /api/admin/bookings/:id/refund', () => {
  async function buildCompletedSession() {
    await setupPlatformWallet(100000); // ₹1000 in platform wallet
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee(0);
    const admin = await createAdminWithToken();
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id, status: 'completed',
      when: new Date(Date.now() - 3600_000), // 1h ago
    });
    // Pretend the session was billed ₹100 + mentor 70 + platform 30 (already in platform wallet)
    await query(
      `INSERT INTO meetings
         (booking_id, agora_channel_name, mentor_first_joined_at, mentee_first_joined_at,
          billing_state, billed_paise, billed_seconds, settled_paise,
          finalized_at, finalized_total_paise, finalized_mentor_paise, finalized_platform_paise)
       VALUES ($1, 'refund-test', NOW(), NOW(),
               'finalized', 10000, 600, 10000,
               NOW(), 10000, 7000, 3000)`,
      [b.id]
    );
    return { mentor, mentee, admin, booking: b };
  }

  test('refunds platform-funded amount + credits mentee + notifies', async () => {
    const { mentee, admin, booking } = await buildCompletedSession();

    const r = await request(app)
      .post(`/api/admin/bookings/${booking.id}/refund`)
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ amount_paise: 10000, reason: 'Goodwill — Agora issues' });
    expect(r.status).toBe(200);
    expect(r.body.refunded_paise).toBe(10000);

    const mw = await query(`SELECT balance_paise FROM wallets WHERE user_id = $1 AND kind = 'mentee'`, [mentee.user.id]);
    expect(mw.rows[0].balance_paise).toBe(10000);

    const pw = await query(`SELECT balance_paise FROM wallets WHERE kind = 'platform' LIMIT 1`);
    expect(pw.rows[0].balance_paise).toBe(90000); // 100k - 10k refund

    // Notification
    const n = await query(`SELECT * FROM notifications WHERE user_id = $1 AND kind = 'refund_issued'`, [mentee.user.id]);
    expect(n.rowCount).toBe(1);
  });

  test('refusing refund exceeding billed amount', async () => {
    const { admin, booking } = await buildCompletedSession();
    const r = await request(app)
      .post(`/api/admin/bookings/${booking.id}/refund`)
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ amount_paise: 999999 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('amount_exceeds_charge');
  });

  test('refusing refund when platform wallet is dry', async () => {
    const { admin, booking } = await buildCompletedSession();
    // Drain platform wallet to below the refund amount
    const pw = await query(`SELECT id FROM wallets WHERE kind = 'platform' LIMIT 1`);
    const sysUser = await query(`SELECT id FROM users WHERE email = 'system@unmute.internal'`);
    // Debit platform via ledger
    await query(
      `INSERT INTO wallet_transactions (wallet_id, direction, amount_paise, reason, balance_after_paise)
       VALUES ($1, 'debit', 99999, 'admin_adjustment', 0)`,
      [pw.rows[0].id]
    );

    const r = await request(app)
      .post(`/api/admin/bookings/${booking.id}/refund`)
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ amount_paise: 10000 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('platform_insufficient');

    // Suppress unused-binding lint
    expect(sysUser.rowCount).toBeGreaterThanOrEqual(0);
  });
});

// --- Audit log ------------------------------------------------------------

describe('GET /api/admin/audit-log', () => {
  test('returns audit rows from any admin action; filterable', async () => {
    await setupPlatformWallet();
    const admin = await createAdminWithToken();
    // Create a couple of audit entries
    await query(
      `INSERT INTO admin_audit_log (admin_user_id, action, target_table, target_id, notes)
       VALUES ($1, 'patch_user', 'users', 5, 'a'),
              ($1, 'approve_mentor', 'mentor_profiles', 7, 'b')`,
      [admin.user.id]
    );

    const r = await request(app)
      .get('/api/admin/audit-log')
      .set('Authorization', `Bearer ${admin.access_token}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThanOrEqual(2);
    expect(r.body.items[0].admin_email).toBeTruthy();

    const filtered = await request(app)
      .get('/api/admin/audit-log?action=approve_mentor')
      .set('Authorization', `Bearer ${admin.access_token}`);
    expect(filtered.body.items.every((row) => row.action === 'approve_mentor')).toBe(true);
  });
});
