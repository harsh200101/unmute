'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, truncateAll, seedReferenceData,
  createUserWithToken,
} = require('./_helpers');

const billing = require('../src/services/billingEngine');

// --- Fixtures --------------------------------------------------------------

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

async function makeApprovedMentor(tier_name = 'standard') {
  const { user, access_token } = await createUserWithToken({
    role: 'mentor',
    email: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@t.local`,
  });
  const tier = (await query(`SELECT * FROM pricing_tiers WHERE name=$1`, [tier_name])).rows[0];
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
  return { user, access_token, tier };
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

async function makeBooking({ mentor_user_id, mentee_user_id, slot_start_at, per_minute_paise, status = 'scheduled' }) {
  const start = new Date(slot_start_at);
  const end = new Date(start.getTime() + 60 * 60_000);
  const r = await query(
    `INSERT INTO bookings
       (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
        per_minute_paise_snapshot, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [mentor_user_id, mentee_user_id, start.toISOString(), end.toISOString(), per_minute_paise, status]
  );
  return r.rows[0];
}

function minutesFromNow(m) {
  return new Date(Date.now() + m * 60_000).toISOString();
}

// Place both parties into the call by faking the events, then optionally
// rewind billing_active_since so we can simulate elapsed time.
async function joinBoth({ booking_uuid, mentor_tok, mentee_tok, secondsAgo = 0 }) {
  await request(app).post(`/api/meetings/${booking_uuid}/events/joined`).set('Authorization', `Bearer ${mentee_tok}`);
  await request(app).post(`/api/meetings/${booking_uuid}/events/joined`).set('Authorization', `Bearer ${mentor_tok}`);
  if (secondsAgo > 0) {
    const m = await query(`SELECT id FROM meetings WHERE booking_id = (SELECT id FROM bookings WHERE uuid = $1)`, [booking_uuid]);
    const since = new Date(Date.now() - secondsAgo * 1000).toISOString();
    await query(`UPDATE meetings SET billing_active_since = $1 WHERE id = $2`, [since, m.rows[0].id]);
  }
}

beforeEach(async () => {
  await truncateAll();
  await seedReferenceData();
  await setupPlatformWallet();
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

// --- Pure math -------------------------------------------------------------

describe('Billing math', () => {
  test('calcPaise floors correctly', () => {
    expect(billing.calcPaise({ seconds: 60, per_minute_paise: 1000 })).toBe(1000);
    expect(billing.calcPaise({ seconds: 30, per_minute_paise: 1000 })).toBe(500);
    expect(billing.calcPaise({ seconds: 1, per_minute_paise: 1000 })).toBe(16);  // floor(16.66)
    expect(billing.calcPaise({ seconds: 0, per_minute_paise: 1000 })).toBe(0);
  });
});

// --- Finalize --------------------------------------------------------------

describe('finalizeMeeting', () => {
  test('happy path: full 60 min at ₹10/min → ₹600, mentor gets ₹420 (70%), platform ₹180 (30%)', async () => {
    const mentor = await makeApprovedMentor('standard'); // ₹10/min = 1000 paise
    const mentee = await makeMenteeWithBalance(100000); // ₹1000
    const b = await makeBooking({
      mentor_user_id: mentor.user.id,
      mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2),
      per_minute_paise: 1000,
    });

    await joinBoth({
      booking_uuid: b.uuid,
      mentor_tok: mentor.access_token,
      mentee_tok: mentee.access_token,
      secondsAgo: 3600, // already 60 minutes of "active" billing
    });

    const r = await request(app)
      .post(`/api/meetings/${b.uuid}/end`)
      .set('Authorization', `Bearer ${mentor.access_token}`)
      .send();
    expect(r.status).toBe(200);
    expect(r.body.meeting.billing_state).toBe('finalized');
    expect(r.body.meeting.finalized_total_paise).toBe(60000); // ₹600
    expect(r.body.meeting.finalized_mentor_paise).toBe(42000); // 70%
    expect(r.body.meeting.finalized_platform_paise).toBe(18000); // 30%

    // Wallet checks
    const mwb = await query(`SELECT balance_paise FROM wallets WHERE user_id=$1 AND kind='mentee'`, [mentee.user.id]);
    expect(mwb.rows[0].balance_paise).toBe(40000); // 100000 - 60000

    const mtw = await query(`SELECT balance_paise FROM wallets WHERE user_id=$1 AND kind='mentor'`, [mentor.user.id]);
    expect(mtw.rows[0].balance_paise).toBe(42000);

    const pw = await query(`SELECT balance_paise FROM wallets WHERE kind='platform' LIMIT 1`);
    expect(pw.rows[0].balance_paise).toBe(18000);

    // Booking is completed
    const bk = await query(`SELECT status FROM bookings WHERE id = $1`, [b.id]);
    expect(bk.rows[0].status).toBe('completed');
  });

  test('15-minute minimum: 90s actual billed → charged for 15 min', async () => {
    const mentor = await makeApprovedMentor('standard'); // ₹10/min
    const mentee = await makeMenteeWithBalance(100000);
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2), per_minute_paise: 1000,
    });

    await joinBoth({
      booking_uuid: b.uuid,
      mentor_tok: mentor.access_token,
      mentee_tok: mentee.access_token,
      secondsAgo: 90,
    });

    const r = await request(app)
      .post(`/api/meetings/${b.uuid}/end`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send();
    expect(r.body.meeting.finalized_total_paise).toBe(15000); // ₹150 (15 min × ₹10)
    expect(r.body.meeting.billed_seconds).toBe(900);
  });

  test('no-show: nobody joined → 0 charge, no wallet movement', async () => {
    const mentor = await makeApprovedMentor('standard');
    const mentee = await makeMenteeWithBalance(100000);
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2), per_minute_paise: 1000,
    });

    const r = await request(app)
      .post(`/api/meetings/${b.uuid}/end`)
      .set('Authorization', `Bearer ${mentor.access_token}`)
      .send();
    expect(r.body.meeting.finalized_total_paise).toBe(0);
    expect(r.body.meeting.finalized_mentor_paise).toBe(0);
    expect(r.body.meeting.finalized_platform_paise).toBe(0);

    const mwb = await query(`SELECT balance_paise FROM wallets WHERE user_id=$1 AND kind='mentee'`, [mentee.user.id]);
    expect(mwb.rows[0].balance_paise).toBe(100000);

    const bk = await query(`SELECT status FROM bookings WHERE id = $1`, [b.id]);
    expect(bk.rows[0].status).toBe('no_show');
  });

  test('finalize is idempotent (calling end twice does not double-charge)', async () => {
    const mentor = await makeApprovedMentor('standard');
    const mentee = await makeMenteeWithBalance(100000);
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2), per_minute_paise: 1000,
    });
    // 20 min session so we stay above the 15-min minimum and the test is
    // about idempotency, not the minimum kicking in.
    await joinBoth({
      booking_uuid: b.uuid, mentor_tok: mentor.access_token, mentee_tok: mentee.access_token,
      secondsAgo: 1200,
    });
    await request(app).post(`/api/meetings/${b.uuid}/end`).set('Authorization', `Bearer ${mentor.access_token}`).send();
    const r2 = await request(app).post(`/api/meetings/${b.uuid}/end`).set('Authorization', `Bearer ${mentor.access_token}`).send();
    expect(r2.status).toBe(200);
    expect(r2.body.meeting.finalized_total_paise).toBeGreaterThan(0);

    const mwb = await query(`SELECT balance_paise FROM wallets WHERE user_id=$1 AND kind='mentee'`, [mentee.user.id]);
    expect(mwb.rows[0].balance_paise).toBe(100000 - 20000); // 20 min × 1000 = 20000 charged
  });

  test('mentee with insufficient balance is charged what is available (no negative balance)', async () => {
    const mentor = await makeApprovedMentor('expert'); // 2000 paise/min = ₹20/min
    const mentee = await makeMenteeWithBalance(15000); // ₹150 only
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2), per_minute_paise: 2000,
    });
    await joinBoth({
      booking_uuid: b.uuid, mentor_tok: mentor.access_token, mentee_tok: mentee.access_token,
      secondsAgo: 3600, // 60 min × 2000 = 120000 paise theoretical
    });
    const r = await request(app)
      .post(`/api/meetings/${b.uuid}/end`)
      .set('Authorization', `Bearer ${mentor.access_token}`)
      .send();
    // Total: 120000 theoretical, but mentee only had 15000 → 15000 actually billed
    expect(r.body.meeting.finalized_total_paise).toBe(15000);

    const mwb = await query(`SELECT balance_paise FROM wallets WHERE user_id=$1 AND kind='mentee'`, [mentee.user.id]);
    expect(mwb.rows[0].balance_paise).toBe(0);

    // Mentor gets 70% of what was actually billed
    const mtw = await query(`SELECT balance_paise FROM wallets WHERE user_id=$1 AND kind='mentor'`, [mentor.user.id]);
    expect(mtw.rows[0].balance_paise).toBe(10500); // floor(15000 * 0.70)
  });

  test('pause + resume splits the billed interval correctly', async () => {
    const mentor = await makeApprovedMentor('standard');
    const mentee = await makeMenteeWithBalance(100000);
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2), per_minute_paise: 1000,
    });

    // Join both, rewind 1200s (20 min) so we sit above the 15-min minimum,
    // leave mentee, rejoin, then end.
    await joinBoth({
      booking_uuid: b.uuid, mentor_tok: mentor.access_token, mentee_tok: mentee.access_token,
      secondsAgo: 1200, // 20 minutes
    });
    await request(app).post(`/api/meetings/${b.uuid}/events/left`).set('Authorization', `Bearer ${mentee.access_token}`);

    // After the leave: 20 min got rolled into billed_seconds, state=paused.
    let m = await query(`SELECT billed_seconds, billed_paise, billing_state FROM meetings WHERE booking_id = $1`, [b.id]);
    expect(m.rows[0].billed_seconds).toBeGreaterThanOrEqual(1200);
    expect(m.rows[0].billed_paise).toBeGreaterThanOrEqual(20000);
    expect(m.rows[0].billing_state).toBe('paused');

    // Rejoin and end immediately (negligible extra time)
    await request(app).post(`/api/meetings/${b.uuid}/events/joined`).set('Authorization', `Bearer ${mentee.access_token}`);
    await request(app).post(`/api/meetings/${b.uuid}/end`).set('Authorization', `Bearer ${mentor.access_token}`).send();

    const mwb = await query(`SELECT balance_paise FROM wallets WHERE user_id=$1 AND kind='mentee'`, [mentee.user.id]);
    // Around ₹200 charged (20 min). Allow small fudge from the brief rejoin window.
    expect(100000 - mwb.rows[0].balance_paise).toBeGreaterThanOrEqual(20000);
    expect(100000 - mwb.rows[0].balance_paise).toBeLessThan(21000);
  });
});

// --- Cron workers ---------------------------------------------------------

describe('finalizeExpiredMeetings', () => {
  test('finalizes meetings whose slot_end has passed', async () => {
    const mentor = await makeApprovedMentor('standard');
    const mentee = await makeMenteeWithBalance(100000);
    // Past booking
    const past_start = new Date(Date.now() - 70 * 60_000); // started 70 min ago
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: past_start.toISOString(), per_minute_paise: 1000,
    });
    // Insert a meeting in 'paused' state with prior billed_seconds=1800 (30 min)
    await query(
      `INSERT INTO meetings (booking_id, agora_channel_name, mentor_present, mentee_present,
                              billing_state, billed_seconds, billed_paise,
                              mentor_first_joined_at, mentee_first_joined_at)
       VALUES ($1, $2, FALSE, FALSE, 'paused', 1800, 30000, $3, $3)`,
      [b.id, `unmute-${b.uuid}`, past_start.toISOString()]
    );

    const result = await billing.finalizeExpiredMeetings();
    expect(result.finalized.length).toBe(1);

    const finalized = await query(`SELECT * FROM meetings WHERE booking_id = $1`, [b.id]);
    expect(finalized.rows[0].billing_state).toBe('finalized');
    expect(finalized.rows[0].end_reason).toBe('slot_expired');
    expect(finalized.rows[0].finalized_total_paise).toBe(30000); // 30 min at ₹10/min
  });

  test('does not touch meetings whose slot_end is in the future', async () => {
    const mentor = await makeApprovedMentor('standard');
    const mentee = await makeMenteeWithBalance(100000);
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2), per_minute_paise: 1000,
    });
    await joinBoth({
      booking_uuid: b.uuid, mentor_tok: mentor.access_token, mentee_tok: mentee.access_token,
    });
    const result = await billing.finalizeExpiredMeetings();
    expect(result.finalized.length).toBe(0);
  });
});

describe('enforceBalanceLimits', () => {
  test('finalizes meetings whose projected cost exceeds mentee balance', async () => {
    const mentor = await makeApprovedMentor('standard'); // 1000 paise/min
    const mentee = await makeMenteeWithBalance(2000); // ₹20 only — 2 min of runway
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2), per_minute_paise: 1000,
    });
    await joinBoth({
      booking_uuid: b.uuid, mentor_tok: mentor.access_token, mentee_tok: mentee.access_token,
      secondsAgo: 300, // 5 min already elapsed → cost (5000) > balance (2000)
    });
    const result = await billing.enforceBalanceLimits();
    expect(result.finalized.length).toBe(1);

    const m = await query(`SELECT * FROM meetings WHERE booking_id = $1`, [b.id]);
    expect(m.rows[0].billing_state).toBe('finalized');
    expect(m.rows[0].end_reason).toBe('balance_depleted');
  });
});

// --- HUD endpoint ----------------------------------------------------------

describe('GET /api/meetings/:booking_uuid/billing', () => {
  test('returns live snapshot with billed_seconds + remaining estimate', async () => {
    const mentor = await makeApprovedMentor('standard');
    const mentee = await makeMenteeWithBalance(30000); // ₹300 → 30 min runway
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2), per_minute_paise: 1000,
    });
    await joinBoth({
      booking_uuid: b.uuid, mentor_tok: mentor.access_token, mentee_tok: mentee.access_token,
      secondsAgo: 120, // 2 min elapsed
    });

    const r = await request(app)
      .get(`/api/meetings/${b.uuid}/billing`)
      .set('Authorization', `Bearer ${mentee.access_token}`);
    expect(r.status).toBe(200);
    expect(r.body.billing_state).toBe('active');
    expect(r.body.per_minute_paise).toBe(1000);
    expect(r.body.billed_seconds).toBeGreaterThanOrEqual(120);
    expect(r.body.mentee_balance_paise).toBe(30000);
    expect(r.body.est_seconds_remaining).toBe(1800); // 30 min
  });

  test('403 for outsider', async () => {
    const mentor = await makeApprovedMentor('standard');
    const mentee = await makeMenteeWithBalance(30000);
    const outsider = await makeMenteeWithBalance(0);
    const b = await makeBooking({
      mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2), per_minute_paise: 1000,
    });
    await joinBoth({
      booking_uuid: b.uuid, mentor_tok: mentor.access_token, mentee_tok: mentee.access_token,
    });
    const r = await request(app)
      .get(`/api/meetings/${b.uuid}/billing`)
      .set('Authorization', `Bearer ${outsider.access_token}`);
    expect(r.status).toBe(403);
  });
});
