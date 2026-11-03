'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, truncateAll, seedReferenceData,
  createMentor,
} = require('./_helpers');
const { batchGetNextAvailableSlots } = require('../src/services/availabilityService');

beforeAll(async () => {
  await truncateAll();
  await seedReferenceData();
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

describe('Upcoming Availability on Find Mentors Page', () => {
  test('batch query, listPublic next_slot_at, and upcoming-availability endpoint', async () => {
    const tier = (await query("SELECT id FROM pricing_tiers WHERE name = 'standard'")).rows[0];
    const { user, mentor } = await createMentor({ tier });

    // Seed 7 days of availability template
    for (let d = 0; d < 7; d++) {
      await query(
        `INSERT INTO availability_template (mentor_user_id, day_of_week, start_time_local, is_active)
         VALUES ($1, $2, '14:00:00', TRUE)`,
        [user.id, d]
      );
    }

    // 1. Verify batchGetNextAvailableSlots
    const slotMap = await batchGetNextAvailableSlots([user.id]);
    expect(slotMap.get(user.id)).toBeDefined();
    expect(slotMap.get(user.id).next_slot_at).toBeTruthy();
    expect(Array.isArray(slotMap.get(user.id).upcoming_slots)).toBe(true);
    expect(slotMap.get(user.id).upcoming_slots.length).toBeGreaterThan(0);

    // 2. Verify GET /api/mentors includes next_slot_at
    const resMentors = await request(app).get('/api/mentors');
    expect(resMentors.status).toBe(200);
    const m = resMentors.body.items.find((item) => Number(item.user_id) === Number(user.id));
    expect(m).toBeDefined();
    expect(m.next_slot_at).toBe(slotMap.get(user.id).next_slot_at);

    // 3. Verify GET /api/mentors/upcoming-availability
    const resUpcoming = await request(app).get('/api/mentors/upcoming-availability?limit=5');
    expect(resUpcoming.status).toBe(200);
    expect(Array.isArray(resUpcoming.body.items)).toBe(true);
    const upcomingMentor = resUpcoming.body.items.find((item) => Number(item.user_id) === Number(user.id));
    expect(upcomingMentor).toBeDefined();
    expect(upcomingMentor.next_slot_at).toBe(slotMap.get(user.id).next_slot_at);
    expect(Array.isArray(upcomingMentor.slots)).toBe(true);
    expect(upcomingMentor.slots.length).toBeGreaterThan(0);
    expect(upcomingMentor.profile_uuid).toBe(mentor.uuid);
  });
});
