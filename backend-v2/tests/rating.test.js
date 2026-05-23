'use strict';

const { pool, query, truncateAll, createUser, createMentor, createBooking } = require('./_helpers');

beforeEach(truncateAll);
afterAll(async () => {
  await pool.end().catch(() => {});
});

async function insertReview(booking, reviewer, reviewee, rating, opts = {}) {
  return query(
    `INSERT INTO reviews
       (booking_id, reviewer_user_id, reviewee_user_id, direction, rating, body, is_anonymous, is_hidden)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      booking.id,
      reviewer.id,
      reviewee.id,
      opts.direction || 'mentee_to_mentor',
      rating,
      opts.body || null,
      opts.is_anonymous || false,
      opts.is_hidden || false,
    ]
  );
}

async function getMentorRating(user_id) {
  const r = await query(
    `SELECT rating_avg, rating_count FROM mentor_profiles WHERE user_id = $1`,
    [user_id]
  );
  return r.rows[0];
}

describe('Mentor rating trigger', () => {
  test('single mentee→mentor review updates rating_avg + rating_count', async () => {
    const { user: mentorUser } = await createMentor();
    const mentee = await createUser({ role: 'mentee' });
    const booking = await createBooking({ mentor: mentorUser, mentee });

    await insertReview(booking, mentee, mentorUser, 5);

    const row = await getMentorRating(mentorUser.id);
    expect(Number(row.rating_avg)).toBe(5);
    expect(row.rating_count).toBe(1);
  });

  test('multiple reviews compute correct average', async () => {
    const { user: mentorUser } = await createMentor();
    const m1 = await createUser({ role: 'mentee', email: 'm1@t' });
    const m2 = await createUser({ role: 'mentee', email: 'm2@t' });
    const b1 = await createBooking({ mentor: mentorUser, mentee: m1, slot_start_at: new Date(Date.now() + 1 * 86400_000) });
    const b2 = await createBooking({ mentor: mentorUser, mentee: m2, slot_start_at: new Date(Date.now() + 2 * 86400_000) });

    await insertReview(b1, m1, mentorUser, 5);
    await insertReview(b2, m2, mentorUser, 3);

    const row = await getMentorRating(mentorUser.id);
    expect(Number(row.rating_avg)).toBe(4);
    expect(row.rating_count).toBe(2);
  });

  test('hidden reviews are excluded from rating (the v1 bug fix)', async () => {
    const { user: mentorUser } = await createMentor();
    const m1 = await createUser({ role: 'mentee', email: 'h1@t' });
    const m2 = await createUser({ role: 'mentee', email: 'h2@t' });
    const b1 = await createBooking({ mentor: mentorUser, mentee: m1, slot_start_at: new Date(Date.now() + 3 * 86400_000) });
    const b2 = await createBooking({ mentor: mentorUser, mentee: m2, slot_start_at: new Date(Date.now() + 4 * 86400_000) });

    const r1 = await insertReview(b1, m1, mentorUser, 5);
    await insertReview(b2, m2, mentorUser, 1);

    let row = await getMentorRating(mentorUser.id);
    expect(Number(row.rating_avg)).toBe(3); // (5+1)/2
    expect(row.rating_count).toBe(2);

    // Hide the 1-star review
    await query('UPDATE reviews SET is_hidden = TRUE WHERE id = $1', [
      // hide the SECOND review (rating 1)
      (await query(`SELECT id FROM reviews WHERE booking_id = $1`, [b2.id])).rows[0].id,
    ]);

    row = await getMentorRating(mentorUser.id);
    expect(Number(row.rating_avg)).toBe(5);
    expect(row.rating_count).toBe(1);

    // Un-hide
    await query('UPDATE reviews SET is_hidden = FALSE WHERE booking_id = $1', [b2.id]);
    row = await getMentorRating(mentorUser.id);
    expect(Number(row.rating_avg)).toBe(3);
    expect(row.rating_count).toBe(2);

    expect(r1.rows[0].id).toBeDefined(); // sanity
  });

  test('mentor_to_mentee reviews do NOT touch mentor rating', async () => {
    const { user: mentorUser } = await createMentor();
    const mentee = await createUser({ role: 'mentee', email: 'mm@t' });
    const booking = await createBooking({ mentor: mentorUser, mentee });

    // Mentor reviews mentee (private direction)
    await insertReview(booking, mentorUser, mentee, 5, { direction: 'mentor_to_mentee' });

    const row = await getMentorRating(mentorUser.id);
    expect(Number(row.rating_avg)).toBe(0);
    expect(row.rating_count).toBe(0);
  });

  test('deleting a review recomputes the mentor rating', async () => {
    const { user: mentorUser } = await createMentor();
    const m1 = await createUser({ role: 'mentee', email: 'd1@t' });
    const m2 = await createUser({ role: 'mentee', email: 'd2@t' });
    const b1 = await createBooking({ mentor: mentorUser, mentee: m1, slot_start_at: new Date(Date.now() + 5 * 86400_000) });
    const b2 = await createBooking({ mentor: mentorUser, mentee: m2, slot_start_at: new Date(Date.now() + 6 * 86400_000) });

    await insertReview(b1, m1, mentorUser, 4);
    await insertReview(b2, m2, mentorUser, 2);

    await query(`DELETE FROM reviews WHERE booking_id = $1`, [b2.id]);

    const row = await getMentorRating(mentorUser.id);
    expect(Number(row.rating_avg)).toBe(4);
    expect(row.rating_count).toBe(1);
  });
});
