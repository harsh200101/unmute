'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, seedReferenceData,
  createUserWithToken,
} = require('./_helpers');

async function cleanData() {
  await query('DELETE FROM notifications');
  await query('DELETE FROM bookings');
  await query('DELETE FROM availability_override');
  await query('DELETE FROM availability_template');
  await query('DELETE FROM mentor_tags');
  await query('DELETE FROM mentor_profiles');
  await query('DELETE FROM users');
}

async function makeApprovedMentor() {
  await seedReferenceData();
  let tier = (await query(`SELECT id FROM pricing_tiers WHERE name='standard'`)).rows[0];
  if (!tier) {
    const r = await query(
      `INSERT INTO pricing_tiers (name, display_name, per_minute_paise, sort_order)
       VALUES ('standard', 'Standard', 1000, 2)
       RETURNING id`
    );
    tier = r.rows[0];
  }

  const { user, access_token } = await createUserWithToken({
    role: 'mentor',
    email: `mentor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@t.local`,
  });

  const mp = await query(
    `INSERT INTO mentor_profiles
       (user_id, pricing_tier_id, headline, bio, timezone, verification_status, verified_at)
     VALUES ($1, $2, 'Experienced peer guide', 'Bio description', 'Asia/Kolkata', 'approved', NOW())
     RETURNING *`,
    [user.id, tier.id]
  );
  return { user, access_token, profile: mp.rows[0] };
}

async function makeMentee() {
  const { user, access_token } = await createUserWithToken({
    role: 'mentee',
    email: `mentee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@t.local`,
  });
  return { user, access_token };
}

beforeEach(async () => {
  await cleanData();
  await seedReferenceData();
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

describe('Available Now & Instant Booking', () => {
  test('mentor toggles available-now ON and OFF, mentee creates instant booking', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();

    // 1. Initial state: mentor is not available now
    const avMeInitial = await request(app)
      .get('/api/availability/me')
      .set('Authorization', `Bearer ${mentor.access_token}`);
    expect(avMeInitial.status).toBe(200);
    expect(avMeInitial.body.is_available_now).toBe(false);

    // 2. Mentee tries instant booking when mentor is offline -> 409 Conflict
    const offlineBookingRes = await request(app)
      .post('/api/bookings/instant')
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({
        mentor_uuid: mentor.profile.uuid,
        mentee_title: 'Need quick help',
        intent_type: 'perspective',
      });
    expect(offlineBookingRes.status).toBe(409);
    expect(offlineBookingRes.body.code).toBe('mentor_not_available_now');

    // 3. Mentor turns ON available-now for 60 minutes
    const toggleOnRes = await request(app)
      .post('/api/availability/available-now')
      .set('Authorization', `Bearer ${mentor.access_token}`)
      .send({ enabled: true, duration_minutes: 60 });
    expect(toggleOnRes.status).toBe(200);
    expect(toggleOnRes.body.is_available_now).toBe(true);
    expect(toggleOnRes.body.available_now_until).toBeTruthy();

    // 4. GET /api/availability/me shows is_available_now = true
    const avMeOn = await request(app)
      .get('/api/availability/me')
      .set('Authorization', `Bearer ${mentor.access_token}`);
    expect(avMeOn.status).toBe(200);
    expect(avMeOn.body.is_available_now).toBe(true);

    // 5. Public mentor list filters by available_now=true
    const publicList = await request(app)
      .get('/api/mentors?available_now=true');
    expect(publicList.status).toBe(200);
    expect(publicList.body.items.some((m) => m.profile_uuid === mentor.profile.uuid)).toBe(true);
    const listedMentor = publicList.body.items.find((m) => m.profile_uuid === mentor.profile.uuid);
    expect(listedMentor.is_available_now).toBe(true);

    // 6. Mentee creates instant booking
    const instantRes = await request(app)
      .post('/api/bookings/instant')
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({
        mentor_uuid: mentor.profile.uuid,
        mentee_title: 'Urgent advice needed',
        mentee_topic: 'Career decision',
        intent_type: 'action_plan',
        is_incognito: false,
      });

    if (instantRes.status !== 201) {
      console.log('INSTANT BOOKING FAILED:', instantRes.status, instantRes.body);
    }
    expect(instantRes.status).toBe(201);
    expect(instantRes.body.booking).toBeTruthy();
    expect(instantRes.body.booking.is_instant).toBe(true);
    expect(instantRes.body.booking.status).toBe('scheduled');
    expect(instantRes.body.booking.mentee_title).toBe('Urgent advice needed');
    expect(instantRes.body.booking.intent_type).toBe('action_plan');

    // 7. Verify mentor notification was dispatched
    const notifs = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND kind = 'instant_call_incoming'`,
      [mentor.user.id]
    );
    expect(notifs.rows.length).toBe(1);
    expect(notifs.rows[0].link_url).toBe(`/meetings/${instantRes.body.booking.uuid}`);

    // 8. Mentor turns OFF available-now
    const toggleOffRes = await request(app)
      .post('/api/availability/available-now')
      .set('Authorization', `Bearer ${mentor.access_token}`)
      .send({ enabled: false });
    expect(toggleOffRes.status).toBe(200);
    expect(toggleOffRes.body.is_available_now).toBe(false);

    // 9. Instant booking again fails with 409
    const secondBookingRes = await request(app)
      .post('/api/bookings/instant')
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ mentor_uuid: mentor.profile.uuid });
    expect(secondBookingRes.status).toBe(409);
    expect(secondBookingRes.body.code).toBe('mentor_not_available_now');
  });
});
