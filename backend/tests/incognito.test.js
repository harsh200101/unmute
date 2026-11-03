'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, seedReferenceData,
  createUserWithToken,
} = require('./_helpers');

async function cleanData() {
  await query('DELETE FROM meeting_messages');
  await query('DELETE FROM meetings');
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
       (user_id, pricing_tier_id, headline, bio, timezone, verification_status, verified_at, is_available_now)
     VALUES ($1, $2, 'Experienced peer guide', 'Bio description', 'Asia/Kolkata', 'approved', NOW(), TRUE)
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

describe('Incognito Mode Feature (Task 2)', () => {
  beforeEach(async () => {
    await cleanData();
  });

  afterAll(async () => {
    await cleanData();
  });

  test('Instant booking with is_incognito masks mentee details for mentor and preserves for mentee', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();

    // 1. Mentee creates instant incognito session
    const createRes = await request(app)
      .post('/api/bookings/instant')
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({
        mentor_uuid: mentor.profile.uuid,
        mentee_title: 'Confidential Guidance',
        intent_type: 'perspective',
        is_incognito: true,
      })
      .expect(201);

    const bookingUuid = createRes.body.booking.uuid;
    expect(createRes.body.booking.is_incognito).toBe(true);

    // 2. Mentee reads booking - sees own real name
    const menteeView = await request(app)
      .get(`/api/bookings/${bookingUuid}`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .expect(200);

    expect(menteeView.body.booking.mentee.full_name).toBe(mentee.user.full_name);
    expect(menteeView.body.booking.is_incognito).toBe(true);

    // 3. Mentor reads booking - sees 'Anonymous Mentee' and null email/demographics
    const mentorView = await request(app)
      .get(`/api/bookings/${bookingUuid}`)
      .set('Authorization', `Bearer ${mentor.access_token}`)
      .expect(200);

    expect(mentorView.body.booking.mentee.full_name).toBe('Anonymous Mentee');
    expect(mentorView.body.booking.mentee.email).toBeNull();
    expect(mentorView.body.booking.is_incognito).toBe(true);

    // 4. Meeting credentials - mentor sees counterpart_name 'Anonymous Mentee'
    const mentorMeeting = await request(app)
      .get(`/api/meetings/${bookingUuid}/credentials`)
      .set('Authorization', `Bearer ${mentor.access_token}`)
      .expect(200);

    expect(mentorMeeting.body.counterpart_name).toBe('Anonymous Mentee');
    expect(mentorMeeting.body.is_incognito).toBe(true);

    // 5. Meeting credentials - mentee sees self_name with '(Incognito)'
    const menteeMeeting = await request(app)
      .get(`/api/meetings/${bookingUuid}/credentials`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .expect(200);

    expect(menteeMeeting.body.self_name).toContain('(Incognito)');
    expect(menteeMeeting.body.is_incognito).toBe(true);
  });
});
