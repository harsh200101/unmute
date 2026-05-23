'use strict';

const { pool, query, truncateAll, createUser, createMentor } = require('./_helpers');

beforeEach(truncateAll);
afterAll(async () => {
  await pool.end().catch(() => {});
});

describe('Booking constraints', () => {
  test('UNIQUE (mentor_user_id, slot_start_at) prevents double-booking', async () => {
    const { user: mentor } = await createMentor();
    const mentee1 = await createUser({ role: 'mentee', email: 'a@t' });
    const mentee2 = await createUser({ role: 'mentee', email: 'b@t' });
    const slot = new Date(Date.now() + 86400_000);
    const slotEnd = new Date(slot.getTime() + 60 * 60_000);

    await query(
      `INSERT INTO bookings
         (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
          per_minute_paise_snapshot, status)
       VALUES ($1, $2, $3, $4, 1000, 'scheduled')`,
      [mentor.id, mentee1.id, slot, slotEnd]
    );

    await expect(
      query(
        `INSERT INTO bookings
           (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
            per_minute_paise_snapshot, status)
         VALUES ($1, $2, $3, $4, 1000, 'scheduled')`,
        [mentor.id, mentee2.id, slot, slotEnd]
      )
    ).rejects.toThrow(/bookings_no_double_book|duplicate key/);
  });

  test('CHECK (slot_end_at = slot_start_at + 60 min) enforces 60-min slot', async () => {
    const { user: mentor } = await createMentor();
    const mentee = await createUser({ role: 'mentee', email: 'c@t' });
    const slot = new Date(Date.now() + 86400_000);
    const slotEnd = new Date(slot.getTime() + 30 * 60_000); // wrong: 30 min

    await expect(
      query(
        `INSERT INTO bookings
           (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
            per_minute_paise_snapshot, status)
         VALUES ($1, $2, $3, $4, 1000, 'scheduled')`,
        [mentor.id, mentee.id, slot, slotEnd]
      )
    ).rejects.toThrow(/bookings_duration_check|check constraint/);
  });

  test('CHECK (mentor != mentee) rejects self-booking', async () => {
    const self = await createUser({ role: 'mentee', email: 'self@t' });
    const slot = new Date(Date.now() + 86400_000);
    const slotEnd = new Date(slot.getTime() + 60 * 60_000);

    await expect(
      query(
        `INSERT INTO bookings
           (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
            per_minute_paise_snapshot, status)
         VALUES ($1, $2, $3, $4, 1000, 'scheduled')`,
        [self.id, self.id, slot, slotEnd]
      )
    ).rejects.toThrow(/bookings_distinct_parties|check constraint/);
  });

  test('different mentor + same slot_start_at is allowed', async () => {
    const { user: mentor1 } = await createMentor();
    const { user: mentor2 } = await createMentor();
    const mentee = await createUser({ role: 'mentee', email: 'two@t' });
    const slot = new Date(Date.now() + 86400_000);
    const slotEnd = new Date(slot.getTime() + 60 * 60_000);

    await query(
      `INSERT INTO bookings
         (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
          per_minute_paise_snapshot, status)
       VALUES ($1, $2, $3, $4, 1000, 'scheduled')`,
      [mentor1.id, mentee.id, slot, slotEnd]
    );

    await expect(
      query(
        `INSERT INTO bookings
           (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
            per_minute_paise_snapshot, status)
         VALUES ($1, $2, $3, $4, 1000, 'scheduled')`,
        [mentor2.id, mentee.id, slot, slotEnd]
      )
    ).resolves.toBeDefined();
  });
});
