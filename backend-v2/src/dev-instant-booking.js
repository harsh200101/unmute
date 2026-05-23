'use strict';

// Dev helper. Creates a fresh "starts in 2 minutes" booking between two test
// users so you can verify the meeting flow end-to-end without re-running the
// full dev-seed (which would wipe all your other test state).
//
// Usage:
//   npm run dev:instant-booking
//     → mentee1@test.com books arjun@test.com (the defaults)
//
//   MENTEE=mentee2@test.com MENTOR=priya@test.com npm run dev:instant-booking
//     → pick any pair you've seeded

const { pool } = require('./config/db');

async function main() {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    throw new Error('Refusing to run in production');
  }
  const menteeEmail = process.env.MENTEE || 'mentee1@test.com';
  const mentorEmail = process.env.MENTOR || 'arjun@test.com';

  try {
    const mentee = await getUser(menteeEmail, 'mentee');
    const mentor = await getUser(mentorEmail, 'mentor');

    // Resolve mentor's tier rate (the snapshot we charge against).
    const tierRow = await pool.query(
      `SELECT pt.per_minute_paise
         FROM mentor_profiles mp
         JOIN pricing_tiers   pt ON pt.id = mp.pricing_tier_id
        WHERE mp.user_id = $1`,
      [mentor.id]
    );
    if (!tierRow.rows.length) {
      throw new Error(`Mentor ${mentorEmail} has no approved mentor_profile yet`);
    }
    const perMinPaise = tierRow.rows[0].per_minute_paise;

    // Slot 2 minutes from now, rounded to the minute. Slots are always 60-min.
    const slotStart = new Date(Date.now() + 2 * 60_000);
    slotStart.setUTCSeconds(0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60_000);

    // Make sure the mentor has this slot bookable (one-off override).
    await pool.query(
      `INSERT INTO availability_override (mentor_user_id, slot_at, action, reason)
       VALUES ($1, $2, 'add', 'dev-instant-booking')
       ON CONFLICT DO NOTHING`,
      [mentor.id, slotStart.toISOString()]
    );

    // Tear down any pre-existing booking that would block this exact slot.
    // The partial unique index excludes cancelled_* / no_show, so we mark
    // any colliding row as cancelled_admin.
    await pool.query(
      `UPDATE bookings
          SET status = 'cancelled_admin',
              cancelled_at = NOW(),
              cancel_reason = 'replaced by dev-instant-booking'
        WHERE mentor_user_id = $1 AND slot_start_at = $2
          AND status IN ('scheduled', 'in_call')`,
      [mentor.id, slotStart.toISOString()]
    );

    const b = (await pool.query(
      `INSERT INTO bookings
         (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
          per_minute_paise_snapshot, status, mentee_title)
       VALUES ($1, $2, $3, $4, $5, 'scheduled', 'dev: instant booking')
       RETURNING uuid, slot_start_at`,
      [mentor.id, mentee.id, slotStart.toISOString(), slotEnd.toISOString(), perMinPaise]
    )).rows[0];

    // eslint-disable-next-line no-console
    console.log(`
  ✅ Booking created.

   Slot starts at:  ${b.slot_start_at}  (≈ 2 minutes from now)
   Join window opens 5 min before — so you can join right now.

   Mentee:  ${menteeEmail}   (sign in here first)
     → http://localhost:5173/bookings/${b.uuid}

   Mentor:  ${mentorEmail}   (sign in here in a second browser / incognito)
     → http://localhost:5173/bookings/${b.uuid}

   Rate:    ₹${(perMinPaise / 100).toFixed(2)} / minute
  `);
  } finally {
    await pool.end();
  }
}

async function getUser(email, expectedRole) {
  const r = await pool.query(`SELECT id, role FROM users WHERE email = $1`, [email]);
  if (!r.rows.length) throw new Error(`User not found: ${email} (did you run \`npm run dev:seed\`?)`);
  if (expectedRole && r.rows[0].role !== expectedRole) {
    throw new Error(`User ${email} has role=${r.rows[0].role}, expected ${expectedRole}`);
  }
  return r.rows[0];
}

if (require.main === module) {
  main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[dev-instant-booking] failed:', e.message);
    process.exit(1);
  });
}
