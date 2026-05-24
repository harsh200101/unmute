'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, truncateAll, seedReferenceData,
  createUserWithToken, createAdminWithToken,
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
  return { user, access_token, profile: mp.rows[0] };
}

async function makeMentee() {
  return createUserWithToken({
    role: 'mentee',
    email: `mentee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@t.local`,
  });
}

async function makeBooking({ mentor_user_id, mentee_user_id, status = 'completed' }) {
  const start = new Date(Date.now() - 3600_000); // 1h ago
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

beforeEach(async () => {
  await truncateAll();
  await seedReferenceData();
  global.__SENT_EMAILS__ = [];
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

// --- Submit review --------------------------------------------------------

describe('POST /api/bookings/:uuid/review', () => {
  test('mentee posts a 5-star review on a completed booking', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });

    const r = await request(app)
      .post(`/api/bookings/${b.uuid}/review`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ rating: 5, body: 'Amazing session, very insightful.' });
    expect(r.status).toBe(201);
    expect(r.body.review.rating).toBe(5);
    expect(r.body.review.direction).toBe('mentee_to_mentor');

    // Mentor's rating_avg trigger fired
    const mp = await query(`SELECT rating_avg, rating_count FROM mentor_profiles WHERE user_id = $1`, [mentor.user.id]);
    expect(Number(mp.rows[0].rating_avg)).toBe(5);
    expect(mp.rows[0].rating_count).toBe(1);

    // Email sent to mentor
    const mentorEmail = (await query(`SELECT email FROM users WHERE id = $1`, [mentor.user.id])).rows[0].email;
    expect(global.__SENT_EMAILS__.some((e) => e.to === mentorEmail)).toBe(true);
  });

  test('mentor posts a private review on a completed booking', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });

    const r = await request(app)
      .post(`/api/bookings/${b.uuid}/review`)
      .set('Authorization', `Bearer ${mentor.access_token}`)
      .send({ rating: 4 });
    expect(r.status).toBe(201);
    expect(r.body.review.direction).toBe('mentor_to_mentee');

    // Mentor's own rating is NOT affected by mentor_to_mentee direction
    const mp = await query(`SELECT rating_avg, rating_count FROM mentor_profiles WHERE user_id = $1`, [mentor.user.id]);
    expect(Number(mp.rows[0].rating_avg)).toBe(0);
    expect(mp.rows[0].rating_count).toBe(0);
  });

  test('refuses to review a non-completed booking', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id, status: 'scheduled' });

    const r = await request(app)
      .post(`/api/bookings/${b.uuid}/review`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ rating: 5 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('not_reviewable');
  });

  test('refuses second review from same direction', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });

    await request(app).post(`/api/bookings/${b.uuid}/review`).set('Authorization', `Bearer ${mentee.access_token}`).send({ rating: 5 });
    const r2 = await request(app).post(`/api/bookings/${b.uuid}/review`).set('Authorization', `Bearer ${mentee.access_token}`).send({ rating: 4 });
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe('review_exists');
  });

  test('non-party 403', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const outsider = await makeMentee();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });

    const r = await request(app)
      .post(`/api/bookings/${b.uuid}/review`)
      .set('Authorization', `Bearer ${outsider.access_token}`)
      .send({ rating: 5 });
    expect(r.status).toBe(403);
  });

  test('rejects rating outside 1..5', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });

    const r = await request(app)
      .post(`/api/bookings/${b.uuid}/review`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ rating: 6 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_rating');
  });
});

// --- Public list ----------------------------------------------------------

describe('GET /api/mentors/:uuid/reviews', () => {
  test('returns only mentee_to_mentor, non-hidden reviews', async () => {
    const mentor = await makeApprovedMentor();
    const m1 = await makeMentee();
    const m2 = await makeMentee();
    const b1 = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: m1.user.id });
    const b2 = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: m2.user.id });

    await request(app).post(`/api/bookings/${b1.uuid}/review`).set('Authorization', `Bearer ${m1.access_token}`).send({ rating: 5, body: 'great' });
    await request(app).post(`/api/bookings/${b2.uuid}/review`).set('Authorization', `Bearer ${m2.access_token}`).send({ rating: 3, body: 'okay' });
    // Also a mentor_to_mentee that should NOT show on the public list
    await request(app).post(`/api/bookings/${b1.uuid}/review`).set('Authorization', `Bearer ${mentor.access_token}`).send({ rating: 4 });

    const r = await request(app).get(`/api/mentors/${mentor.profile.uuid}/reviews`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(2);
    expect(r.body.items.every((rv) => rv.direction === 'mentee_to_mentor')).toBe(true);
  });

  test('anonymous reviews strip reviewer name', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });

    await request(app)
      .post(`/api/bookings/${b.uuid}/review`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ rating: 5, body: 'awesome', is_anonymous: true });

    const r = await request(app).get(`/api/mentors/${mentor.profile.uuid}/reviews`);
    expect(r.body.items[0].is_anonymous).toBe(true);
    expect(r.body.items[0].reviewer.full_name).toBe('Anonymous');
  });

  test('hidden reviews disappear from public list', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const admin = await createAdminWithToken();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });

    const submitted = await request(app)
      .post(`/api/bookings/${b.uuid}/review`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ rating: 1, body: 'bad' });
    const r_uuid = submitted.body.review.uuid;
    // Look up review id from uuid
    const review_id = (await query(`SELECT id FROM reviews WHERE uuid = $1`, [r_uuid])).rows[0].id;

    await request(app)
      .post(`/api/admin/reviews/${review_id}/hide`)
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ reason: 'abusive language' });

    const r = await request(app).get(`/api/mentors/${mentor.profile.uuid}/reviews`);
    expect(r.body.items.length).toBe(0);

    // Mentor's rating recomputed (excludes hidden)
    const mp = await query(`SELECT rating_avg, rating_count FROM mentor_profiles WHERE user_id = $1`, [mentor.user.id]);
    expect(mp.rows[0].rating_count).toBe(0);
  });
});

// --- Session notes --------------------------------------------------------

describe('Session notes', () => {
  test('mentor writes notes; both parties can read', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });

    const w = await request(app)
      .put(`/api/bookings/${b.uuid}/notes`)
      .set('Authorization', `Bearer ${mentor.access_token}`)
      .send({
        discussion_summary: 'Career change to PM',
        key_takeaways: 'Build a portfolio of side projects',
        action_items: '1. Update LinkedIn  2. Apply to 5 PM roles',
      });
    expect(w.status).toBe(200);
    expect(w.body.notes.discussion_summary).toBe('Career change to PM');

    // Mentee reads
    const r = await request(app)
      .get(`/api/bookings/${b.uuid}/notes`)
      .set('Authorization', `Bearer ${mentee.access_token}`);
    expect(r.status).toBe(200);
    expect(r.body.notes.key_takeaways).toBe('Build a portfolio of side projects');
  });

  test('mentee cannot write notes', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });

    const w = await request(app)
      .put(`/api/bookings/${b.uuid}/notes`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ discussion_summary: 'I should be blocked' });
    expect(w.status).toBe(403);
    expect(w.body.code).toBe('mentor_only');
  });

  test('outsider 403', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const outsider = await makeMentee();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });

    const r = await request(app)
      .get(`/api/bookings/${b.uuid}/notes`)
      .set('Authorization', `Bearer ${outsider.access_token}`);
    expect(r.status).toBe(403);
  });

  test('notes upsert on second write', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });

    await request(app).put(`/api/bookings/${b.uuid}/notes`).set('Authorization', `Bearer ${mentor.access_token}`).send({ discussion_summary: 'v1' });
    const r = await request(app).put(`/api/bookings/${b.uuid}/notes`).set('Authorization', `Bearer ${mentor.access_token}`).send({ discussion_summary: 'v2', key_takeaways: 'kt' });
    expect(r.body.notes.discussion_summary).toBe('v2');
    expect(r.body.notes.key_takeaways).toBe('kt');
  });

  test('GET notes returns null when none exist', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });

    const r = await request(app)
      .get(`/api/bookings/${b.uuid}/notes`)
      .set('Authorization', `Bearer ${mentee.access_token}`);
    expect(r.status).toBe(200);
    expect(r.body.notes).toBeNull();
  });
});

// --- My-history endpoints -------------------------------------------------

describe('Personal review + notes history', () => {
  test('GET /api/me/reviews/given returns reviews I wrote', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });
    await request(app).post(`/api/bookings/${b.uuid}/review`).set('Authorization', `Bearer ${mentee.access_token}`).send({ rating: 5 });

    const r = await request(app).get('/api/me/reviews/given').set('Authorization', `Bearer ${mentee.access_token}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(1);
  });

  test('GET /api/me/notes-history returns mentee\'s sessions with notes', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    const b = await makeBooking({ mentor_user_id: mentor.user.id, mentee_user_id: mentee.user.id });
    await request(app).put(`/api/bookings/${b.uuid}/notes`).set('Authorization', `Bearer ${mentor.access_token}`).send({ discussion_summary: 's', key_takeaways: 'k' });

    const r = await request(app).get('/api/me/notes-history').set('Authorization', `Bearer ${mentee.access_token}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(1);
    expect(r.body.items[0].mentor.full_name).toBeTruthy();
  });
});
