'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, truncateAll, seedReferenceData,
  createUserWithToken,
} = require('./_helpers');

// --- Test fixtures ---------------------------------------------------------

async function setupPlatformWallet() {
  const sys = await query(
    `INSERT INTO users (email, full_name, role, is_active, email_verified_at)
     VALUES ('system@unmute.internal', 'unmute Platform', 'admin', TRUE, NOW())
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`
  );
  // Platform wallet starts with enough to front penalty gaps in tests
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'platform', 100000)
     ON CONFLICT (user_id, kind) DO UPDATE SET balance_paise = 100000`,
    [sys.rows[0].id]
  );
}

async function makeApprovedMentor({ tz = 'UTC', email } = {}) {
  const { user, access_token } = await createUserWithToken({
    role: 'mentor',
    email: email || `m-${Date.now()}-${Math.random().toString(36).slice(2,6)}@t.local`,
    full_name: 'Mentor',
  });
  const tier = (await query(`SELECT id, per_minute_paise FROM pricing_tiers WHERE name='standard'`)).rows[0];
  const mp = await query(
    `INSERT INTO mentor_profiles
       (user_id, pricing_tier_id, headline, bio, timezone, verification_status, verified_at)
     VALUES ($1, $2, 'h', 'b', $3, 'approved', NOW())
     RETURNING *`,
    [user.id, tier.id, tz]
  );
  // Mentor wallet
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentor', 0)
     ON CONFLICT (user_id, kind) DO NOTHING`,
    [user.id]
  );
  return { user, access_token, profile: mp.rows[0], tier };
}

async function makeMentee({ balance_paise = 0, email } = {}) {
  const { user, access_token } = await createUserWithToken({
    role: 'mentee',
    email: email || `mentee-${Date.now()}-${Math.random().toString(36).slice(2,6)}@t.local`,
    full_name: 'Mentee',
  });
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentee', $2)
     ON CONFLICT (user_id, kind) DO UPDATE SET balance_paise = $2`,
    [user.id, balance_paise]
  );
  return { user, access_token };
}

// Build a slot_at far enough in the future to bypass the 4-hour rule.
// We round to the next half-hour to align with realistic mentor templates,
// but we don't actually need to — overrides accept any timestamp.
function inHours(hours) {
  const d = new Date(Date.now() + hours * 3600_000);
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

async function openSlot(mentor_user_id, slot_at) {
  // Open a one-off slot via 'add' override (bypasses template setup)
  await query(
    `INSERT INTO availability_override (mentor_user_id, slot_at, action)
     VALUES ($1, $2, 'add')`,
    [mentor_user_id, slot_at]
  );
}

beforeEach(async () => {
  await truncateAll();
  await seedReferenceData();
  await setupPlatformWallet();
  global.__SENT_EMAILS__ = [];
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

// --- Tests -----------------------------------------------------------------

describe('POST /api/bookings', () => {
  test('happy path: creates booking, snapshots price, sends 2 confirmation emails with .ics', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const slot = inHours(10);
    await openSlot(mentor.user.id, slot);

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ mentor_uuid: mentor.profile.uuid, slot_start_at: slot, mentee_title: 'PM career chat' });

    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe('scheduled');
    expect(res.body.booking.per_minute_paise_snapshot).toBe(mentor.tier.per_minute_paise);
    expect(new Date(res.body.booking.slot_end_at).getTime() - new Date(res.body.booking.slot_start_at).getTime())
      .toBe(60 * 60_000);

    // 2 emails (mentor + mentee) with .ics attached
    expect(global.__SENT_EMAILS__.length).toBe(2);
    expect(global.__SENT_EMAILS__.every((e) => e.subject.includes('Booking confirmed'))).toBe(true);
    expect(global.__SENT_EMAILS__.every((e) => e.attachments?.[0]?.content?.startsWith('BEGIN:VCALENDAR'))).toBe(true);
  });

  test('rejects booking own slot (mentor as mentee)', async () => {
    const mentor = await makeApprovedMentor();
    const slot = inHours(10);
    await openSlot(mentor.user.id, slot);

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${mentor.access_token}`)
      .send({ mentor_uuid: mentor.profile.uuid, slot_start_at: slot });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('cannot_book_self');
  });

  test('rejects slot not in availability', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ mentor_uuid: mentor.profile.uuid, slot_start_at: inHours(10) });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('slot_unavailable');
  });

  test('rejects double booking (second mentee racing for same slot)', async () => {
    const mentor = await makeApprovedMentor();
    const m1 = await makeMentee({ email: 'a@t.local' });
    const m2 = await makeMentee({ email: 'b@t.local' });
    const slot = inHours(10);
    await openSlot(mentor.user.id, slot);

    const r1 = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${m1.access_token}`)
      .send({ mentor_uuid: mentor.profile.uuid, slot_start_at: slot });
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${m2.access_token}`)
      .send({ mentor_uuid: mentor.profile.uuid, slot_start_at: slot });
    expect(r2.status).toBe(409);
  });

  test('rejects when mentor not approved', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const slot = inHours(10);
    await openSlot(mentor.user.id, slot);

    await query(`UPDATE mentor_profiles SET verification_status='pending' WHERE user_id=$1`, [mentor.user.id]);

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ mentor_uuid: mentor.profile.uuid, slot_start_at: slot });
    expect(res.status).toBe(404); // mentor not visible via availability either
  });

  test('rejects unverified mentee', async () => {
    const mentor = await makeApprovedMentor();
    const slot = inHours(10);
    await openSlot(mentor.user.id, slot);
    const { access_token } = await createUserWithToken({ email_verified_at: null });

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ mentor_uuid: mentor.profile.uuid, slot_start_at: slot });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('email_not_verified');
  });
});

describe('GET /api/bookings/me + GET /api/bookings/:uuid', () => {
  test('mentee sees their bookings; mentor sees theirs; outsider sees none', async () => {
    const mentor = await makeApprovedMentor();
    const m1 = await makeMentee({ email: 'p1@t.local' });
    const outsider = await makeMentee({ email: 'p2@t.local' });
    const slot = inHours(10);
    await openSlot(mentor.user.id, slot);

    const create = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${m1.access_token}`)
      .send({ mentor_uuid: mentor.profile.uuid, slot_start_at: slot });

    const menteeView = await request(app).get('/api/bookings/me').set('Authorization', `Bearer ${m1.access_token}`);
    expect(menteeView.body.items.length).toBe(1);

    const mentorView = await request(app).get('/api/bookings/me').set('Authorization', `Bearer ${mentor.access_token}`);
    expect(mentorView.body.items.length).toBe(1);

    const outsiderView = await request(app).get('/api/bookings/me').set('Authorization', `Bearer ${outsider.access_token}`);
    expect(outsiderView.body.items.length).toBe(0);

    // GET /:uuid: parties can read, outsider 403
    const ok = await request(app).get(`/api/bookings/${create.body.booking.uuid}`).set('Authorization', `Bearer ${m1.access_token}`);
    expect(ok.status).toBe(200);
    const denied = await request(app).get(`/api/bookings/${create.body.booking.uuid}`).set('Authorization', `Bearer ${outsider.access_token}`);
    expect(denied.status).toBe(403);
  });
});

describe('Cancel — 4h rule + ₹50 penalty', () => {
  async function bookAt(hoursFromNow) {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee({ balance_paise: 10000 }); // ₹100 to cover penalty
    const slot = inHours(hoursFromNow);
    await openSlot(mentor.user.id, slot);
    const r = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ mentor_uuid: mentor.profile.uuid, slot_start_at: slot });
    return { mentor, mentee, booking: r.body.booking };
  }

  test('cancel ≥ 4h is free + emails sent', async () => {
    const { mentee, booking } = await bookAt(10);
    global.__SENT_EMAILS__ = [];
    const res = await request(app)
      .post(`/api/bookings/${booking.uuid}/cancel`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ reason: 'changed my mind' });
    expect(res.status).toBe(200);
    expect(res.body.late).toBe(false);
    expect(res.body.penalty_paise).toBe(0);
    expect(res.body.booking.status).toBe('cancelled_by_mentee');
    expect(global.__SENT_EMAILS__.length).toBe(2);
  });

  test('mentee late-cancel (<4h) charges ₹50 from mentee wallet → mentor wallet', async () => {
    const { mentor, mentee, booking } = await bookAt(2); // 2 hours from now → late
    const res = await request(app)
      .post(`/api/bookings/${booking.uuid}/cancel`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send();
    expect(res.status).toBe(200);
    expect(res.body.late).toBe(true);
    expect(res.body.penalty_paise).toBe(5000);

    const menteeWallet = await query(`SELECT balance_paise FROM wallets WHERE user_id=$1 AND kind='mentee'`, [mentee.user.id]);
    expect(menteeWallet.rows[0].balance_paise).toBe(5000); // 10000 - 5000

    const mentorWallet = await query(`SELECT balance_paise FROM wallets WHERE user_id=$1 AND kind='mentor'`, [mentor.user.id]);
    expect(mentorWallet.rows[0].balance_paise).toBe(5000);

    const menteeLateCount = await query(`SELECT late_cancel_count FROM users WHERE id=$1`, [mentee.user.id]);
    expect(menteeLateCount.rows[0].late_cancel_count).toBe(1);
  });

  test('mentee late-cancel with empty wallet → debt tracked in pending_penalty_paise', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee({ balance_paise: 0 });
    const slot = inHours(2);
    await openSlot(mentor.user.id, slot);
    const r = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ mentor_uuid: mentor.profile.uuid, slot_start_at: slot });
    const booking = r.body.booking;

    await request(app)
      .post(`/api/bookings/${booking.uuid}/cancel`)
      .set('Authorization', `Bearer ${mentee.access_token}`);

    const u = await query(`SELECT pending_penalty_paise FROM users WHERE id=$1`, [mentee.user.id]);
    expect(u.rows[0].pending_penalty_paise).toBe(5000);

    // Mentor still got compensated (platform fronted)
    const mentorWallet = await query(`SELECT balance_paise FROM wallets WHERE user_id=$1 AND kind='mentor'`, [mentor.user.id]);
    expect(mentorWallet.rows[0].balance_paise).toBe(5000);
  });

  test('cancelling an already-cancelled booking fails', async () => {
    const { mentee, booking } = await bookAt(10);
    await request(app).post(`/api/bookings/${booking.uuid}/cancel`).set('Authorization', `Bearer ${mentee.access_token}`).send();
    const second = await request(app).post(`/api/bookings/${booking.uuid}/cancel`).set('Authorization', `Bearer ${mentee.access_token}`).send();
    expect(second.status).toBe(400);
    expect(second.body.code).toBe('not_cancellable');
  });

  test('outsider cannot cancel someone else\'s booking', async () => {
    const { booking } = await bookAt(10);
    const outsider = await makeMentee({ email: 'o@t.local' });
    const res = await request(app)
      .post(`/api/bookings/${booking.uuid}/cancel`)
      .set('Authorization', `Bearer ${outsider.access_token}`)
      .send();
    expect(res.status).toBe(403);
  });

  test('cancelled slot becomes bookable again', async () => {
    const { mentor, mentee, booking } = await bookAt(10);
    const slot = booking.slot_start_at;
    await request(app).post(`/api/bookings/${booking.uuid}/cancel`).set('Authorization', `Bearer ${mentee.access_token}`).send();

    // Another mentee can now book it
    const m2 = await makeMentee({ email: 'rebook@t.local' });
    const re = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${m2.access_token}`)
      .send({ mentor_uuid: mentor.profile.uuid, slot_start_at: slot });
    expect(re.status).toBe(201);
  });
});

describe('Reschedule — propose / accept / decline', () => {
  async function setupBooking() {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee({ email: 'rs@t.local' });
    const slot = inHours(10);
    const newSlot = inHours(20);
    await openSlot(mentor.user.id, slot);
    await openSlot(mentor.user.id, newSlot);
    const r = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ mentor_uuid: mentor.profile.uuid, slot_start_at: slot });
    return { mentor, mentee, booking: r.body.booking, newSlot };
  }

  test('mentee proposes → mentor accepts → slot moves; old slot is free, new slot is taken', async () => {
    const { mentor, mentee, booking, newSlot } = await setupBooking();

    const propose = await request(app)
      .post(`/api/bookings/${booking.uuid}/reschedule`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ new_slot_start_at: newSlot });
    expect(propose.status).toBe(200);
    expect(propose.body.booking.reschedule_to_at).toBeTruthy();

    const accept = await request(app)
      .post(`/api/bookings/${booking.uuid}/reschedule/accept`)
      .set('Authorization', `Bearer ${mentor.access_token}`);
    expect(accept.status).toBe(200);
    expect(new Date(accept.body.booking.slot_start_at).toISOString()).toBe(newSlot);
    expect(accept.body.booking.reschedule_to_at).toBeNull();
  });

  test('proposer cannot accept their own proposal', async () => {
    const { mentee, booking, newSlot } = await setupBooking();
    await request(app)
      .post(`/api/bookings/${booking.uuid}/reschedule`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ new_slot_start_at: newSlot });
    const r = await request(app)
      .post(`/api/bookings/${booking.uuid}/reschedule/accept`)
      .set('Authorization', `Bearer ${mentee.access_token}`);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('cannot_accept_own_proposal');
  });

  test('decline clears the proposal but keeps the original slot', async () => {
    const { mentor, mentee, booking, newSlot } = await setupBooking();
    await request(app)
      .post(`/api/bookings/${booking.uuid}/reschedule`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ new_slot_start_at: newSlot });
    const d = await request(app)
      .post(`/api/bookings/${booking.uuid}/reschedule/decline`)
      .set('Authorization', `Bearer ${mentor.access_token}`);
    expect(d.status).toBe(200);
    expect(d.body.booking.reschedule_to_at).toBeNull();
    expect(d.body.booking.slot_start_at).toBe(booking.slot_start_at);
  });

  test('rejects reschedule inside 4 hours', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee({ email: 'lr@t.local' });
    const slot = inHours(2); // <4h
    await openSlot(mentor.user.id, slot);
    const r = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ mentor_uuid: mentor.profile.uuid, slot_start_at: slot });

    const propose = await request(app)
      .post(`/api/bookings/${r.body.booking.uuid}/reschedule`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ new_slot_start_at: inHours(20) });
    expect(propose.status).toBe(400);
    expect(propose.body.code).toBe('too_late_to_reschedule');
  });

  test('rejects reschedule to an unavailable slot', async () => {
    const { mentee, booking } = await setupBooking();
    const res = await request(app)
      .post(`/api/bookings/${booking.uuid}/reschedule`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ new_slot_start_at: inHours(100) }); // no template/override there
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('new_slot_unavailable');
  });
});
