'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, truncateAll, seedReferenceData,
  createUserWithToken,
} = require('./_helpers');

const billing = require('../src/services/billingEngine');

// --- Fixtures (small copies of those in billing.test.js) ------------------

async function setupPlatformWallet() {
  const sys = await query(
    `INSERT INTO users (email, full_name, role, is_active, email_verified_at)
     VALUES ('system@unmute.internal', 'unmute Platform', 'admin', TRUE, NOW())
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`
  );
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'platform', 0)
     ON CONFLICT (user_id, kind) DO UPDATE SET balance_paise = 0`,
    [sys.rows[0].id]
  );
}

async function makeApprovedMentor() {
  const { user, access_token } = await createUserWithToken({
    role: 'mentor',
    email: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@t.local`,
  });
  const tier = (await query(`SELECT id FROM pricing_tiers WHERE name='standard'`)).rows[0]; // 1000 paise/min
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

async function makeMenteeWithBalance(balance_paise) {
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

async function makeBooking({ mentor_user_id, mentee_user_id, slot_start_at, per_minute_paise = 1000 }) {
  const start = new Date(slot_start_at);
  const end = new Date(start.getTime() + 60 * 60_000);
  const r = await query(
    `INSERT INTO bookings
       (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
        per_minute_paise_snapshot, status)
     VALUES ($1, $2, $3, $4, $5, 'scheduled')
     RETURNING *`,
    [mentor_user_id, mentee_user_id, start.toISOString(), end.toISOString(), per_minute_paise]
  );
  return r.rows[0];
}

function minutesFromNow(m) {
  return new Date(Date.now() + m * 60_000).toISOString();
}

// Join both parties and (optionally) rewind billing_active_since to simulate
// elapsed billing time. Returns the meeting row.
async function joinBothAndRewind({ booking_uuid, mentor_tok, mentee_tok, secondsAgo = 0 }) {
  await request(app).post(`/api/meetings/${booking_uuid}/events/joined`).set('Authorization', `Bearer ${mentee_tok}`);
  await request(app).post(`/api/meetings/${booking_uuid}/events/joined`).set('Authorization', `Bearer ${mentor_tok}`);
  if (secondsAgo > 0) {
    const since = new Date(Date.now() - secondsAgo * 1000).toISOString();
    await query(
      `UPDATE meetings SET billing_active_since = $1
        WHERE booking_id = (SELECT id FROM bookings WHERE uuid = $2)`,
      [since, booking_uuid]
    );
  }
  const m = await query(
    `SELECT * FROM meetings WHERE booking_id = (SELECT id FROM bookings WHERE uuid = $1)`,
    [booking_uuid]
  );
  return m.rows[0];
}

beforeEach(async () => {
  await truncateAll();
  await seedReferenceData();
  await setupPlatformWallet();
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

// --- Warning --------------------------------------------------------------

describe('tickBilling — 5-min low-balance warning', () => {
  test('emits warning when est_seconds_remaining < 5 min and not yet warned', async () => {
    const mentor = await makeApprovedMentor();
    // Balance ₹40 ≈ 240 sec of runway at ₹10/min — already under the 5-min threshold
    const mentee = await makeMenteeWithBalance(4000);
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2),
    });
    await joinBothAndRewind({ booking_uuid: b.uuid, mentor_tok: mentor.access_token, mentee_tok: mentee.access_token });

    const r = await billing.tickBilling();
    expect(r.warned.length).toBe(1);

    const m = (await query(`SELECT low_balance_warned_at FROM meetings WHERE booking_id = $1`, [b.id])).rows[0];
    expect(m.low_balance_warned_at).toBeTruthy();

    // Event recorded
    const events = await query(
      `SELECT kind, payload FROM meeting_events
        WHERE meeting_id = (SELECT id FROM meetings WHERE booking_id = $1)
          AND kind = 'low_balance_warning'`,
      [b.id]
    );
    expect(events.rowCount).toBe(1);
    expect(events.rows[0].payload.remaining_seconds).toBeLessThanOrEqual(300);
  });

  test('warning emitted exactly once even on repeated ticks', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMenteeWithBalance(4000);
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2),
    });
    await joinBothAndRewind({ booking_uuid: b.uuid, mentor_tok: mentor.access_token, mentee_tok: mentee.access_token });

    await billing.tickBilling();
    await billing.tickBilling();
    await billing.tickBilling();

    const events = await query(
      `SELECT COUNT(*)::int AS n FROM meeting_events
        WHERE meeting_id = (SELECT id FROM meetings WHERE booking_id = $1)
          AND kind = 'low_balance_warning'`,
      [b.id]
    );
    expect(events.rows[0].n).toBe(1);
  });

  test('no warning when balance is comfortable', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMenteeWithBalance(100000); // ₹1000 = 100 min of runway
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2),
    });
    await joinBothAndRewind({ booking_uuid: b.uuid, mentor_tok: mentor.access_token, mentee_tok: mentee.access_token });

    const r = await billing.tickBilling();
    expect(r.warned.length).toBe(0);
  });
});

// --- Grace flow -----------------------------------------------------------

describe('tickBilling — grace period at ₹0', () => {
  test('active → low_balance_grace when projected cost >= balance', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMenteeWithBalance(2000); // ₹20 → 2 min
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2),
    });
    await joinBothAndRewind({
      booking_uuid: b.uuid, mentor_tok: mentor.access_token, mentee_tok: mentee.access_token,
      secondsAgo: 300, // 5 min elapsed
    });

    const r = await billing.tickBilling();
    expect(r.entered_grace.length).toBe(1);

    const m = (await query(`SELECT * FROM meetings WHERE booking_id = $1`, [b.id])).rows[0];
    expect(m.billing_state).toBe('low_balance_grace');
    expect(m.grace_started_at).toBeTruthy();
    expect(m.billing_active_since).toBeNull();
  });

  test('top-up during grace returns to active (when both still present)', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMenteeWithBalance(2000);
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2),
    });
    await joinBothAndRewind({
      booking_uuid: b.uuid, mentor_tok: mentor.access_token, mentee_tok: mentee.access_token,
      secondsAgo: 300,
    });

    // Enter grace
    await billing.tickBilling();
    let m = (await query(`SELECT billing_state FROM meetings WHERE booking_id = $1`, [b.id])).rows[0];
    expect(m.billing_state).toBe('low_balance_grace');

    // Drain mentee wallet to actual 0 (it should already be 0 after enter-grace
    // rolled in the interval, but be explicit)
    await query(`UPDATE wallets SET balance_paise = 0 WHERE user_id = $1 AND kind = 'mentee'`, [mentee.user.id]);

    // User tops up via webhook simulation: credit the wallet directly
    const wid = (await query(`SELECT id FROM wallets WHERE user_id = $1 AND kind = 'mentee'`, [mentee.user.id])).rows[0].id;
    await query(
      `INSERT INTO wallet_transactions
         (wallet_id, direction, amount_paise, reason, balance_after_paise)
       VALUES ($1, 'credit', 50000, 'topup', 0)`,
      [wid]
    );

    const r = await billing.tickBilling();
    expect(r.exited_grace.length).toBe(1);

    m = (await query(`SELECT billing_state, billing_active_since, grace_started_at FROM meetings WHERE booking_id = $1`, [b.id])).rows[0];
    expect(m.billing_state).toBe('active');
    expect(m.billing_active_since).toBeTruthy();
    expect(m.grace_started_at).toBeNull();
  });

  test('grace expires after 60s without top-up → finalize with balance_depleted', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMenteeWithBalance(2000);
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2),
    });
    await joinBothAndRewind({
      booking_uuid: b.uuid, mentor_tok: mentor.access_token, mentee_tok: mentee.access_token,
      secondsAgo: 300,
    });

    // Enter grace
    await billing.tickBilling();
    // Rewind grace_started_at to 70s ago
    await query(
      `UPDATE meetings
          SET grace_started_at = NOW() - INTERVAL '70 seconds'
        WHERE booking_id = $1`,
      [b.id]
    );

    const r = await billing.tickBilling();
    expect(r.finalized.length).toBe(1);

    const m = (await query(`SELECT billing_state, end_reason FROM meetings WHERE booking_id = $1`, [b.id])).rows[0];
    expect(m.billing_state).toBe('finalized');
    expect(m.end_reason).toBe('balance_depleted');
  });
});

// --- HUD reflects warning + grace -----------------------------------------

describe('Billing HUD reflects phase 8 fields', () => {
  test('low_balance_warned_at + grace_started_at + grace_seconds_remaining surface in snapshot', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMenteeWithBalance(2000);
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2),
    });
    await joinBothAndRewind({
      booking_uuid: b.uuid, mentor_tok: mentor.access_token, mentee_tok: mentee.access_token,
      secondsAgo: 300,
    });

    await billing.tickBilling(); // → grace

    const r = await request(app)
      .get(`/api/meetings/${b.uuid}/billing`)
      .set('Authorization', `Bearer ${mentee.access_token}`);
    expect(r.status).toBe(200);
    expect(r.body.billing_state).toBe('low_balance_grace');
    expect(r.body.grace_started_at).toBeTruthy();
    expect(r.body.grace_seconds_remaining).toBeGreaterThan(0);
    expect(r.body.grace_seconds_remaining).toBeLessThanOrEqual(60);
  });
});
