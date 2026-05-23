'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, truncateAll, seedReferenceData,
  createUserWithToken,
} = require('./_helpers');

// --- Fixtures --------------------------------------------------------------

async function makeApprovedMentor() {
  const { user, access_token } = await createUserWithToken({
    role: 'mentor',
    email: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@t.local`,
  });
  const tier = (await query(`SELECT id FROM pricing_tiers WHERE name='standard'`)).rows[0];
  const mp = await query(
    `INSERT INTO mentor_profiles
       (user_id, pricing_tier_id, headline, bio, timezone, verification_status, verified_at)
     VALUES ($1, $2, 'h', 'b', 'UTC', 'approved', NOW())
     RETURNING *`,
    [user.id, tier.id]
  );
  // Mentor wallet so finalize can credit
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentor', 0)
     ON CONFLICT (user_id, kind) DO NOTHING`,
    [user.id]
  );
  return { user, access_token, profile: mp.rows[0] };
}

async function makeMentee(overrides = {}) {
  const { user, access_token } = await createUserWithToken({
    role: 'mentee',
    email: `mentee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@t.local`,
    ...overrides,
  });
  // Mentee wallet so finalize can debit
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentee', 100000)
     ON CONFLICT (user_id, kind) DO NOTHING`,
    [user.id]
  );
  return { user, access_token };
}

async function setupPlatformWallet() {
  const sys = await query(
    `INSERT INTO users (email, full_name, role, is_active, email_verified_at)
     VALUES ('system@unmute.internal', 'unmute Platform', 'admin', TRUE, NOW())
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`
  );
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'platform', 0)
     ON CONFLICT (user_id, kind) DO NOTHING`,
    [sys.rows[0].id]
  );
}

// Insert a booking directly so we can control slot_start_at precisely
// (and avoid going through the public booking creation flow each time).
async function makeBooking({ mentor_user_id, mentee_user_id, slot_start_at, status = 'scheduled' }) {
  const start = new Date(slot_start_at);
  const end = new Date(start.getTime() + 60 * 60_000);
  const r = await query(
    `INSERT INTO bookings
       (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
        per_minute_paise_snapshot, status)
     VALUES ($1, $2, $3, $4, 1000, $5)
     RETURNING *`,
    [mentor_user_id, mentee_user_id, start.toISOString(), end.toISOString(), status]
  );
  return r.rows[0];
}

function minutesFromNow(m) {
  return new Date(Date.now() + m * 60_000).toISOString();
}

beforeEach(async () => {
  await truncateAll();
  await seedReferenceData();
  await setupPlatformWallet();
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

// --- Tests -----------------------------------------------------------------

describe('GET /api/meetings/:booking_uuid/credentials — join window', () => {
  test('200 when called 5 min before start through slot end (4 min before = in window)', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({
      mentor_user_id: mentor.user.id,
      mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(4), // 4 min from now → in window
    });

    const res = await request(app)
      .get(`/api/meetings/${b.uuid}/credentials`)
      .set('Authorization', `Bearer ${mentee.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('mentee');
    expect(res.body.channel).toBe(`unmute-${b.uuid}`);
    expect(res.body.token).toBeTruthy();
    expect(res.body.uid).toBeGreaterThan(0);
    expect(res.body.app_id).toBeTruthy();
  });

  test('400 when called too early (>5 min before start)', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({
      mentor_user_id: mentor.user.id,
      mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(30), // way too early
    });
    const res = await request(app)
      .get(`/api/meetings/${b.uuid}/credentials`)
      .set('Authorization', `Bearer ${mentee.access_token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('outside_join_window');
  });

  test('400 after slot has ended', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({
      mentor_user_id: mentor.user.id,
      mentee_user_id: mentee.user.id,
      slot_start_at: new Date(Date.now() - 120 * 60_000).toISOString(), // 2h ago
    });
    const res = await request(app)
      .get(`/api/meetings/${b.uuid}/credentials`)
      .set('Authorization', `Bearer ${mentee.access_token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('outside_join_window');
  });

  test('403 for non-party', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const outsider = await makeMentee();
    const b = await makeBooking({
      mentor_user_id: mentor.user.id,
      mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2),
    });
    const res = await request(app)
      .get(`/api/meetings/${b.uuid}/credentials`)
      .set('Authorization', `Bearer ${outsider.access_token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('not_a_party');
  });

  test('issuing credentials lazy-creates the meeting row', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({
      mentor_user_id: mentor.user.id,
      mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2),
    });

    const before = await query(`SELECT COUNT(*)::int AS n FROM meetings WHERE booking_id = $1`, [b.id]);
    expect(before.rows[0].n).toBe(0);

    await request(app)
      .get(`/api/meetings/${b.uuid}/credentials`)
      .set('Authorization', `Bearer ${mentee.access_token}`);

    const after = await query(`SELECT * FROM meetings WHERE booking_id = $1`, [b.id]);
    expect(after.rowCount).toBe(1);
    expect(after.rows[0].billing_state).toBe('idle');
    expect(after.rows[0].agora_channel_name).toBe(`unmute-${b.uuid}`);
  });

  test('cancelled booking: 400', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({
      mentor_user_id: mentor.user.id,
      mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2),
      status: 'cancelled_by_mentee',
    });
    const res = await request(app)
      .get(`/api/meetings/${b.uuid}/credentials`)
      .set('Authorization', `Bearer ${mentee.access_token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('meeting_not_active');
  });
});

describe('POST /api/meetings/:booking_uuid/events/{joined,left} — presence', () => {
  async function setup() {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({
      mentor_user_id: mentor.user.id,
      mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2),
    });
    return { mentor, mentee, booking: b };
  }

  test('first join sets present=true, status→in_call, billing stays idle until both present', async () => {
    const { mentor, mentee, booking } = await setup();

    const r = await request(app)
      .post(`/api/meetings/${booking.uuid}/events/joined`)
      .set('Authorization', `Bearer ${mentee.access_token}`);
    expect(r.status).toBe(200);
    expect(r.body.meeting.mentee_present).toBe(true);
    expect(r.body.meeting.mentor_present).toBe(false);
    expect(r.body.meeting.billing_state).toBe('idle');

    const ur = await query(`SELECT status FROM bookings WHERE id = $1`, [booking.id]);
    expect(ur.rows[0].status).toBe('in_call');
  });

  test('both join → billing_state=active, billing_active_since set', async () => {
    const { mentor, mentee, booking } = await setup();

    await request(app).post(`/api/meetings/${booking.uuid}/events/joined`).set('Authorization', `Bearer ${mentee.access_token}`);
    const r = await request(app)
      .post(`/api/meetings/${booking.uuid}/events/joined`)
      .set('Authorization', `Bearer ${mentor.access_token}`);
    expect(r.body.meeting.billing_state).toBe('active');
    expect(r.body.meeting.billing_active_since).toBeTruthy();
    expect(r.body.meeting.mentor_present).toBe(true);
    expect(r.body.meeting.mentee_present).toBe(true);

    // billing_start event logged
    const events = await query(
      `SELECT kind FROM meeting_events
        WHERE meeting_id IN (SELECT id FROM meetings WHERE booking_id = $1)
        ORDER BY occurred_at`,
      [booking.id]
    );
    const kinds = events.rows.map((r) => r.kind);
    expect(kinds).toContain('mentee_join');
    expect(kinds).toContain('mentor_join');
    expect(kinds).toContain('billing_start');
  });

  test('one leaves → billing_state=paused', async () => {
    const { mentor, mentee, booking } = await setup();
    await request(app).post(`/api/meetings/${booking.uuid}/events/joined`).set('Authorization', `Bearer ${mentee.access_token}`);
    await request(app).post(`/api/meetings/${booking.uuid}/events/joined`).set('Authorization', `Bearer ${mentor.access_token}`);

    const r = await request(app)
      .post(`/api/meetings/${booking.uuid}/events/left`)
      .set('Authorization', `Bearer ${mentee.access_token}`);
    expect(r.body.meeting.billing_state).toBe('paused');
    expect(r.body.meeting.mentee_present).toBe(false);

    const events = await query(
      `SELECT kind FROM meeting_events
        WHERE meeting_id IN (SELECT id FROM meetings WHERE booking_id = $1)
        ORDER BY occurred_at`,
      [booking.id]
    );
    expect(events.rows.map((r) => r.kind)).toContain('billing_pause');
  });

  test('reconnect → billing_state goes paused → active again', async () => {
    const { mentor, mentee, booking } = await setup();
    await request(app).post(`/api/meetings/${booking.uuid}/events/joined`).set('Authorization', `Bearer ${mentee.access_token}`);
    await request(app).post(`/api/meetings/${booking.uuid}/events/joined`).set('Authorization', `Bearer ${mentor.access_token}`);
    await request(app).post(`/api/meetings/${booking.uuid}/events/left`).set('Authorization', `Bearer ${mentee.access_token}`);

    const r = await request(app)
      .post(`/api/meetings/${booking.uuid}/events/joined`)
      .set('Authorization', `Bearer ${mentee.access_token}`);
    expect(r.body.meeting.billing_state).toBe('active');
    expect(r.body.meeting.mentee_present).toBe(true);
  });

  test('repeat-join is idempotent', async () => {
    const { mentee, booking } = await setup();
    const r1 = await request(app).post(`/api/meetings/${booking.uuid}/events/joined`).set('Authorization', `Bearer ${mentee.access_token}`);
    const r2 = await request(app).post(`/api/meetings/${booking.uuid}/events/joined`).set('Authorization', `Bearer ${mentee.access_token}`);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body.meeting.mentee_present).toBe(true);
  });

  test('non-party 403 on joined event', async () => {
    const { booking } = await setup();
    const outsider = await makeMentee();
    const r = await request(app)
      .post(`/api/meetings/${booking.uuid}/events/joined`)
      .set('Authorization', `Bearer ${outsider.access_token}`);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/meetings/:booking_uuid/end', () => {
  async function setup() {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({
      mentor_user_id: mentor.user.id,
      mentee_user_id: mentee.user.id,
      slot_start_at: minutesFromNow(2),
    });
    return { mentor, mentee, booking: b };
  }

  test('manual end → billing_state=finalized, booking → completed (if joined)', async () => {
    const { mentor, mentee, booking } = await setup();
    await request(app).post(`/api/meetings/${booking.uuid}/events/joined`).set('Authorization', `Bearer ${mentee.access_token}`);
    await request(app).post(`/api/meetings/${booking.uuid}/events/joined`).set('Authorization', `Bearer ${mentor.access_token}`);

    const r = await request(app)
      .post(`/api/meetings/${booking.uuid}/end`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send();
    expect(r.body.meeting.billing_state).toBe('finalized');
    expect(r.body.meeting.end_reason).toBe('mentee_ended');

    const br = await query(`SELECT status FROM bookings WHERE id = $1`, [booking.id]);
    expect(br.rows[0].status).toBe('completed');
  });

  test('end before anyone joined → no_show', async () => {
    const { mentor, booking } = await setup();
    const r = await request(app)
      .post(`/api/meetings/${booking.uuid}/end`)
      .set('Authorization', `Bearer ${mentor.access_token}`)
      .send();
    expect(r.body.meeting.billing_state).toBe('finalized');
    const br = await query(`SELECT status FROM bookings WHERE id = $1`, [booking.id]);
    expect(br.rows[0].status).toBe('no_show');
  });

  test('end is idempotent', async () => {
    const { mentor, booking } = await setup();
    await request(app).post(`/api/meetings/${booking.uuid}/end`).set('Authorization', `Bearer ${mentor.access_token}`).send();
    const r2 = await request(app).post(`/api/meetings/${booking.uuid}/end`).set('Authorization', `Bearer ${mentor.access_token}`).send();
    expect(r2.status).toBe(200);
    expect(r2.body.meeting.billing_state).toBe('finalized');
  });
});
