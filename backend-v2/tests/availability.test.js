'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, truncateAll, seedReferenceData,
  createUserWithToken,
} = require('./_helpers');

async function makeApprovedMentor({ tz = 'Asia/Kolkata' } = {}) {
  const { user, access_token } = await createUserWithToken({
    role: 'mentor',
    email: `mentor-${Date.now()}-${Math.random().toString(36).slice(2,6)}@t.local`,
  });
  const tier = (await query(`SELECT id FROM pricing_tiers WHERE name='standard'`)).rows[0];
  // Insert mentor profile directly (approved, given tz)
  const mp = await query(
    `INSERT INTO mentor_profiles
       (user_id, pricing_tier_id, headline, bio, timezone, verification_status, verified_at)
     VALUES ($1, $2, 'h', 'b', $3, 'approved', NOW())
     RETURNING *`,
    [user.id, tier.id, tz]
  );
  return { user, access_token, profile: mp.rows[0] };
}

beforeEach(async () => {
  await truncateAll();
  await seedReferenceData();
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

describe('PUT /api/availability/template', () => {
  test('mentor can replace template (delete+insert atomic)', async () => {
    const { access_token } = await makeApprovedMentor();
    const res = await request(app)
      .put('/api/availability/template')
      .set('Authorization', `Bearer ${access_token}`)
      .send({
        slots: [
          { day_of_week: 1, start_time_local: '18:00' }, // Mon 6pm
          { day_of_week: 3, start_time_local: '19:00' }, // Wed 7pm
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.template.length).toBe(2);

    // Replace with a different set
    const res2 = await request(app)
      .put('/api/availability/template')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ slots: [{ day_of_week: 5, start_time_local: '20:00' }] });
    expect(res2.status).toBe(200);
    expect(res2.body.template.length).toBe(1);
    expect(res2.body.template[0].day_of_week).toBe(5);
  });

  test('non-mentor gets 403', async () => {
    const { access_token } = await createUserWithToken(); // mentee
    const res = await request(app)
      .put('/api/availability/template')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ slots: [] });
    expect(res.status).toBe(403);
  });

  test('rejects invalid day_of_week', async () => {
    const { access_token } = await makeApprovedMentor();
    const res = await request(app)
      .put('/api/availability/template')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ slots: [{ day_of_week: 9, start_time_local: '18:00' }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_day_of_week');
  });

  test('rejects duplicate (day, time) in payload', async () => {
    const { access_token } = await makeApprovedMentor();
    const res = await request(app)
      .put('/api/availability/template')
      .set('Authorization', `Bearer ${access_token}`)
      .send({
        slots: [
          { day_of_week: 1, start_time_local: '18:00' },
          { day_of_week: 1, start_time_local: '18:00' },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('duplicate_slot');
  });
});

describe('Overrides', () => {
  test('create + delete block override', async () => {
    const { access_token, user } = await makeApprovedMentor();
    const ts = '2030-01-01T18:00:00+05:30';
    const create = await request(app)
      .post('/api/availability/overrides')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ slot_at: ts, action: 'block', reason: 'vacation' });
    expect(create.status).toBe(201);
    expect(create.body.override.action).toBe('block');

    const row = await query(
      `SELECT * FROM availability_override WHERE mentor_user_id = $1`,
      [user.id]
    );
    expect(row.rowCount).toBe(1);

    const del = await request(app)
      .delete(`/api/availability/overrides/${create.body.override.id}`)
      .set('Authorization', `Bearer ${access_token}`);
    expect(del.status).toBe(200);

    const row2 = await query(
      `SELECT * FROM availability_override WHERE mentor_user_id = $1`,
      [user.id]
    );
    expect(row2.rowCount).toBe(0);
  });

  test('cannot delete other mentor\'s override', async () => {
    const a = await makeApprovedMentor();
    const b = await makeApprovedMentor();
    const create = await request(app)
      .post('/api/availability/overrides')
      .set('Authorization', `Bearer ${a.access_token}`)
      .send({ slot_at: '2030-02-01T18:00:00Z', action: 'add' });
    const ov_id = create.body.override.id;

    const del = await request(app)
      .delete(`/api/availability/overrides/${ov_id}`)
      .set('Authorization', `Bearer ${b.access_token}`);
    expect(del.status).toBe(404);
  });

  test('rejects invalid action', async () => {
    const { access_token } = await makeApprovedMentor();
    const res = await request(app)
      .post('/api/availability/overrides')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ slot_at: '2030-01-01T18:00:00Z', action: 'wat' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_action');
  });
});

describe('GET /api/availability/:uuid/slots', () => {
  test('returns template-expanded UTC timestamps in window', async () => {
    const { access_token, profile } = await makeApprovedMentor({ tz: 'Asia/Kolkata' });
    // Mon 6pm IST = 12:30 UTC
    await request(app)
      .put('/api/availability/template')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ slots: [{ day_of_week: 1, start_time_local: '18:00' }] });

    // Window: pick a Monday well in the future
    const from = '2030-01-07T00:00:00Z';   // Monday
    const to   = '2030-01-08T00:00:00Z';

    const res = await request(app).get(
      `/api/availability/${profile.uuid}/slots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe('Asia/Kolkata');
    expect(res.body.slots.length).toBe(1);
    expect(res.body.slots[0]).toBe('2030-01-07T12:30:00.000Z'); // 18:00 IST = 12:30 UTC
  });

  test('block override removes a template slot', async () => {
    const { access_token, profile } = await makeApprovedMentor();
    await request(app)
      .put('/api/availability/template')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ slots: [{ day_of_week: 1, start_time_local: '18:00' }] });

    const block = '2030-01-07T12:30:00Z'; // matches the expanded slot above
    await request(app)
      .post('/api/availability/overrides')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ slot_at: block, action: 'block' });

    const res = await request(app).get(
      `/api/availability/${profile.uuid}/slots?from=2030-01-07T00:00:00Z&to=2030-01-08T00:00:00Z`
    );
    expect(res.body.slots).toEqual([]);
  });

  test('add override adds a one-off slot outside the template', async () => {
    const { access_token, profile } = await makeApprovedMentor();
    // No template at all; just an 'add' override
    await request(app)
      .post('/api/availability/overrides')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ slot_at: '2030-02-05T10:00:00Z', action: 'add' });

    const res = await request(app).get(
      `/api/availability/${profile.uuid}/slots?from=2030-02-01T00:00:00Z&to=2030-02-08T00:00:00Z`
    );
    expect(res.body.slots).toEqual(['2030-02-05T10:00:00.000Z']);
  });

  test('booked slots are excluded', async () => {
    const { access_token, profile, user } = await makeApprovedMentor();
    // Add a one-off slot
    await request(app)
      .post('/api/availability/overrides')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ slot_at: '2030-03-01T10:00:00Z', action: 'add' });

    // Insert a booking on that slot
    const mentee = await query(
      `INSERT INTO users (email, full_name, role, email_verified_at)
       VALUES ('mentee-x@t.local', 'M', 'mentee', NOW()) RETURNING id`
    );
    await query(
      `INSERT INTO bookings
         (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
          per_minute_paise_snapshot, status)
       VALUES ($1, $2, '2030-03-01T10:00:00Z',
               '2030-03-01T11:00:00Z', 1000, 'scheduled')`,
      [user.id, mentee.rows[0].id]
    );

    const res = await request(app).get(
      `/api/availability/${profile.uuid}/slots?from=2030-02-25T00:00:00Z&to=2030-03-05T00:00:00Z`
    );
    expect(res.body.slots).toEqual([]);
  });

  test('cancelled bookings free the slot back up', async () => {
    const { access_token, profile, user } = await makeApprovedMentor();
    await request(app)
      .post('/api/availability/overrides')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ slot_at: '2030-04-01T10:00:00Z', action: 'add' });

    const mentee = await query(
      `INSERT INTO users (email, full_name, role, email_verified_at)
       VALUES ('m-y@t.local', 'M', 'mentee', NOW()) RETURNING id`
    );
    await query(
      `INSERT INTO bookings
         (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
          per_minute_paise_snapshot, status)
       VALUES ($1, $2, '2030-04-01T10:00:00Z',
               '2030-04-01T11:00:00Z', 1000, 'cancelled_by_mentee')`,
      [user.id, mentee.rows[0].id]
    );

    const res = await request(app).get(
      `/api/availability/${profile.uuid}/slots?from=2030-03-25T00:00:00Z&to=2030-04-05T00:00:00Z`
    );
    expect(res.body.slots).toEqual(['2030-04-01T10:00:00.000Z']);
  });

  test('past + near-future slots filtered (15 min lead time)', async () => {
    const { access_token, profile } = await makeApprovedMentor();
    // Add a slot in the past
    await request(app)
      .post('/api/availability/overrides')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ slot_at: '2000-01-01T10:00:00Z', action: 'add' });

    const res = await request(app).get(
      `/api/availability/${profile.uuid}/slots?from=2000-01-01T00:00:00Z`
    );
    // 'from' was clamped to now+15min; the year-2000 add is outside the
    // returned window so it is excluded.
    expect(res.body.slots).not.toContain('2000-01-01T10:00:00.000Z');
  });

  test('returns 404 for unknown mentor', async () => {
    const res = await request(app).get(
      `/api/availability/00000000-0000-0000-0000-000000000000/slots`
    );
    expect(res.status).toBe(404);
  });

  test('returns empty (not 404) for pending mentor', async () => {
    const { access_token, user, profile } = await makeApprovedMentor();
    // Demote to pending
    await query(
      `UPDATE mentor_profiles SET verification_status='pending' WHERE user_id=$1`,
      [user.id]
    );
    await request(app)
      .put('/api/availability/template')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ slots: [{ day_of_week: 1, start_time_local: '18:00' }] });

    const res = await request(app).get(`/api/availability/${profile.uuid}/slots`);
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
  });
});
