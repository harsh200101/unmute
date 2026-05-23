'use strict';

// Dev-only test fixtures. NEVER run this in production.
//
// What you get after `npm run dev:seed`:
//
//   Admin   (you, from main seed) — harshgajbhiye34@gmail.com / testpassword1
//
//   Mentees:
//     mentee1@test.com   / Password1!  — ₹1,000 wallet
//     mentee2@test.com   / Password1!  — ₹50 wallet (test low-balance flow)
//     mentee3@test.com   / Password1!  — ₹0 wallet (test top-up flow)
//
//   Approved mentors:
//     priya@test.com     / Password1!  — Anxiety / Adults · Standard · ₹10/min
//     arjun@test.com     / Password1!  — Career stress / Working pros · Expert · ₹20/min
//     meera@test.com     / Password1!  — Couples · Premium · ₹40/min
//     rohan@test.com     / Password1!  — Teens / LGBTQ+ · Starter · ₹5/min
//
//   Admin queue:
//     pending_app@test.com / Password1!   — pending mentor application
//     pending_kyc@test.com / Password1!   — approved mentor, pending KYC
//
//   Bookings:
//     - mentee1 ↔ priya: 1 upcoming (in 24h) + 1 completed with a 5★ review
//     - mentee1 ↔ arjun: 1 upcoming (in 3 min — ready to join end-to-end)
//     - mentee2 ↔ meera: 1 past no-show
//
//   Each approved mentor has a weekly template + a one-off "add" slot ~24h out.

const { pool } = require('./config/db');
const bcrypt = require('bcrypt');

const PW = 'Password1!';

async function main() {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    throw new Error('Refusing to run dev-seed in production');
  }

  // eslint-disable-next-line no-console
  const log = (...a) => console.log('[dev-seed]', ...a);

  try {
    log('wiping user-data tables…');
    await pool.query(`TRUNCATE
      admin_audit_log, notifications, session_notes, reviews,
      withdrawals, mentor_kyc, payments, wallet_transactions, wallets,
      meeting_events, meetings, bookings, availability_override, availability_template,
      mentor_tags, mentor_profiles, password_reset_tokens, email_verification_tokens,
      refresh_tokens, users
      RESTART IDENTITY CASCADE`);

    log('re-running canonical seed (tiers + tags + platform wallet + admin)…');
    await runCanonicalSeed();

    log('creating mentees…');
    const mentee1 = await createUser({ email: 'mentee1@test.com', name: 'Anika Mehra' });
    const mentee2 = await createUser({ email: 'mentee2@test.com', name: 'Karan Kapoor' });
    const mentee3 = await createUser({ email: 'mentee3@test.com', name: 'Sara Ali' });
    await fundMenteeWallet(mentee1.id, 100000); // ₹1,000
    await fundMenteeWallet(mentee2.id, 5000);   // ₹50
    await fundMenteeWallet(mentee3.id, 0);

    log('creating approved mentors…');
    const priya = await createApprovedMentor({
      email: 'priya@test.com', name: 'Dr. Priya Sharma',
      tier: 'standard',
      headline: 'Clinical psychologist — anxiety, sleep, and life transitions',
      bio: 'I help adults work through anxiety, sleep difficulties, and major life changes. ' +
           'My approach blends CBT with mindfulness — practical tools you can use the same day.',
      years: 7, city: 'Bengaluru',
      tagSlugs: ['anxiety', 'sleep-issues', 'life-transitions', 'adults', 'working-professionals'],
    });
    const arjun = await createApprovedMentor({
      email: 'arjun@test.com', name: 'Arjun Verma',
      tier: 'expert',
      headline: 'Burnout coach for working professionals',
      bio: 'Ex-product manager turned coach. I work with founders and senior ICs on ' +
           'recovering from burnout without quitting the careers they love.',
      years: 10, city: 'Mumbai',
      tagSlugs: ['career-stress', 'stress-burnout', 'self-esteem', 'working-professionals'],
    });
    const meera = await createApprovedMentor({
      email: 'meera@test.com', name: 'Meera Iyer',
      tier: 'premium',
      headline: 'Couples therapist — communication and trust repair',
      bio: 'Licensed marriage and family therapist. I work with couples on ' +
           'communication patterns, conflict styles, and rebuilding trust after rupture.',
      years: 14, city: 'Pune',
      tagSlugs: ['relationships', 'family-conflict', 'couples'],
    });
    const rohan = await createApprovedMentor({
      email: 'rohan@test.com', name: 'Rohan Das',
      tier: 'starter',
      headline: 'Peer counsellor for teens and young adults',
      bio: 'Trained peer counsellor focused on identity, self-esteem, and the LGBTQ+ ' +
           'experience. A safe space if you want to think out loud without judgment.',
      years: 3, city: 'Bengaluru',
      tagSlugs: ['identity-and-self', 'self-esteem', 'loneliness', 'teens', 'young-adults', 'lgbtq-plus'],
    });

    // Pending application
    log('creating pending mentor application…');
    const pendingApp = await createUser({
      email: 'pending_app@test.com', name: 'Vikram Singh',
    });
    await pool.query(`UPDATE users SET role = 'mentor' WHERE id = $1`, [pendingApp.id]);
    const tierStandard = await getTier('standard');
    const pendingMp = await pool.query(
      `INSERT INTO mentor_profiles
         (user_id, pricing_tier_id, headline, bio, languages, years_experience,
          timezone, verification_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Kolkata', 'pending')
       RETURNING *`,
      [pendingApp.id, tierStandard.id,
       'Counsellor specialising in addiction recovery',
       'M.Phil in Clinical Psychology. I support clients in early recovery — ' +
       'building daily structure, working through cravings, and repairing relationships.',
       ['en', 'hi'], 6]
    );
    await attachTags(pendingApp.id, ['addiction-recovery', 'family-conflict', 'adults']);
    await pool.query(
      `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentor', 0)
       ON CONFLICT (user_id, kind) DO NOTHING`,
      [pendingApp.id]
    );

    // Approved mentor with pending KYC
    log('creating approved mentor with pending KYC…');
    const pendingKyc = await createApprovedMentor({
      email: 'pending_kyc@test.com', name: 'Naina Reddy',
      tier: 'standard',
      headline: 'Trauma-informed counsellor',
      bio: 'EMDR-trained therapist working with adults processing childhood trauma and PTSD.',
      years: 9, city: 'Hyderabad',
      tagSlugs: ['trauma-ptsd', 'grief-and-loss', 'adults'],
    });
    await pool.query(
      `INSERT INTO mentor_kyc
         (mentor_user_id, pan_number, full_name_as_per_pan,
          bank_account_number, bank_ifsc, bank_account_holder, status)
       VALUES ($1, 'NAINA9876Z', 'Naina Reddy', '111122223333', 'HDFC0001234', 'Naina Reddy', 'pending')`,
      [pendingKyc.id]
    );

    log('seeding availability templates + one-off slots…');
    for (const m of [priya, arjun, meera, rohan, pendingKyc]) {
      // Weekly template — every weekday at 6 PM local
      for (const dow of [1, 2, 3, 4, 5]) {
        await pool.query(
          `INSERT INTO availability_template (mentor_user_id, day_of_week, start_time_local)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [m.id, dow, '18:00']
        );
      }
    }

    log('creating one-off slot just 3 min from now on Arjun (for end-to-end meeting test)…');
    const ARJUN_INSTANT_SLOT = new Date(Date.now() + 3 * 60_000);
    ARJUN_INSTANT_SLOT.setUTCSeconds(0, 0);
    await pool.query(
      `INSERT INTO availability_override (mentor_user_id, slot_at, action, reason)
       VALUES ($1, $2, 'add', 'test-instant-slot')`,
      [arjun.id, ARJUN_INSTANT_SLOT.toISOString()]
    );

    log('creating bookings…');
    // mentee1 → priya: upcoming in 24h + completed past session w/ review
    const priyaUpcoming = new Date(Date.now() + 24 * 3600_000);
    priyaUpcoming.setUTCSeconds(0, 0);
    await pool.query(
      `INSERT INTO availability_override (mentor_user_id, slot_at, action) VALUES ($1, $2, 'add')`,
      [priya.id, priyaUpcoming.toISOString()]
    );
    await createBooking({
      mentor: priya, mentee: mentee1,
      slot_start: priyaUpcoming,
      per_minute_paise: 1000,
      status: 'scheduled',
      mentee_title: 'First session — feeling overwhelmed at work',
    });

    const priyaPast = new Date(Date.now() - 7 * 86400_000);
    priyaPast.setUTCSeconds(0, 0);
    const priyaPastEnd = new Date(priyaPast.getTime() + 60 * 60_000);
    const pastB = (await pool.query(
      `INSERT INTO bookings (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
                              per_minute_paise_snapshot, status, mentee_title)
       VALUES ($1, $2, $3, $4, 1000, 'completed', 'Sleep issues')
       RETURNING *`,
      [priya.id, mentee1.id, priyaPast.toISOString(), priyaPastEnd.toISOString()]
    )).rows[0];
    // Insert meeting + final settlement (3000 paise = 30 min × ₹1/min … wait ₹10/min for 18 min = 3000 — let's say 18 min)
    await pool.query(
      `INSERT INTO meetings (booking_id, agora_channel_name, mentor_first_joined_at, mentee_first_joined_at,
                              billing_state, billed_seconds, billed_paise, settled_paise,
                              finalized_at, finalized_total_paise, finalized_mentor_paise, finalized_platform_paise)
       VALUES ($1, $2, $3, $3, 'finalized', 1800, 30000, 30000, $4, 30000, 21000, 9000)`,
      [pastB.id, `unmute-${pastB.uuid}`, priyaPast.toISOString(), priyaPastEnd.toISOString()]
    );
    // Mentee paid (debit) + mentor credit + platform credit — minimal ledger
    const menteeWid = (await pool.query(
      `SELECT id FROM wallets WHERE user_id = $1 AND kind = 'mentee'`, [mentee1.id]
    )).rows[0].id;
    const priyaWid = (await pool.query(
      `SELECT id FROM wallets WHERE user_id = $1 AND kind = 'mentor'`, [priya.id]
    )).rows[0].id;
    const platWid = (await pool.query(
      `SELECT id FROM wallets WHERE kind = 'platform' LIMIT 1`
    )).rows[0].id;
    // Re-fund mentee1 wallet so the past charge leaves them at ₹1000 minus that ₹300
    await pool.query(`UPDATE wallets SET balance_paise = 130000 WHERE id = $1`, [menteeWid]);
    await pool.query(
      `INSERT INTO wallet_transactions (wallet_id, direction, amount_paise, reason, reference_table, reference_id, idempotency_key, balance_after_paise)
       VALUES ($1, 'debit', 30000, 'session_charge', 'meetings', NULL, $2, 0)`,
      [menteeWid, `seed:past:${pastB.id}:debit`]
    );
    await pool.query(
      `INSERT INTO wallet_transactions (wallet_id, direction, amount_paise, reason, reference_table, reference_id, idempotency_key, balance_after_paise)
       VALUES ($1, 'credit', 21000, 'session_payout', 'meetings', NULL, $2, 0)`,
      [priyaWid, `seed:past:${pastB.id}:payout`]
    );
    await pool.query(
      `INSERT INTO wallet_transactions (wallet_id, direction, amount_paise, reason, reference_table, reference_id, idempotency_key, balance_after_paise)
       VALUES ($1, 'credit', 9000, 'platform_fee', 'meetings', NULL, $2, 0)`,
      [platWid, `seed:past:${pastB.id}:platform`]
    );
    // 5★ review from mentee1 on priya
    await pool.query(
      `INSERT INTO reviews (booking_id, reviewer_user_id, reviewee_user_id, direction, rating, body)
       VALUES ($1, $2, $3, 'mentee_to_mentor', 5, 'Priya was warm and grounded. She gave me a 4-7-8 breathing exercise I''m still using every night. Booking again next week.')`,
      [pastB.id, mentee1.id, priya.id]
    );
    // Session notes on the past session
    await pool.query(
      `INSERT INTO session_notes (booking_id, author_user_id, discussion_summary, key_takeaways, action_items)
       VALUES ($1, $2,
         'Discussed work pressure and racing thoughts at bedtime.',
         'Sleep hygiene is the lowest-effort lever here. Anxiety pattern is more about anticipation than current threat.',
         '1. Try 4-7-8 breathing for 4 nights\n2. Journal worries 90 min before bed\n3. Book follow-up in 7 days')`,
      [pastB.id, priya.id]
    );

    // mentee1 → arjun: the instant slot
    await createBooking({
      mentor: arjun, mentee: mentee1,
      slot_start: ARJUN_INSTANT_SLOT,
      per_minute_paise: 2000,
      status: 'scheduled',
      mentee_title: 'Quick check-in — work stress',
    });

    // mentee2 → meera: past no-show
    const meeraPast = new Date(Date.now() - 3 * 86400_000);
    meeraPast.setUTCSeconds(0, 0);
    const meeraPastEnd = new Date(meeraPast.getTime() + 60 * 60_000);
    await pool.query(
      `INSERT INTO bookings (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
                              per_minute_paise_snapshot, status)
       VALUES ($1, $2, $3, $4, 4000, 'no_show')`,
      [meera.id, mentee2.id, meeraPast.toISOString(), meeraPastEnd.toISOString()]
    );

    log('done.');
    printSummary();
  } finally {
    await pool.end();
  }
}

// --- helpers --------------------------------------------------------------

async function runCanonicalSeed() {
  // Delegate to the regular seed by calling its internals directly.
  // We can't `require` it as a module because it has top-level main();
  // re-implementing the small bit here:
  const TIERS = [
    { name: 'starter',  display_name: 'Starter',  per_minute_paise: 500,  sort_order: 1 },
    { name: 'standard', display_name: 'Standard', per_minute_paise: 1000, sort_order: 2 },
    { name: 'expert',   display_name: 'Expert',   per_minute_paise: 2000, sort_order: 3 },
    { name: 'premium',  display_name: 'Premium',  per_minute_paise: 4000, sort_order: 4 },
  ];
  for (const t of TIERS) {
    await pool.query(
      `INSERT INTO pricing_tiers (name, display_name, per_minute_paise, sort_order)
       VALUES ($1,$2,$3,$4) ON CONFLICT (name) DO UPDATE
       SET display_name = EXCLUDED.display_name, per_minute_paise = EXCLUDED.per_minute_paise`,
      [t.name, t.display_name, t.per_minute_paise, t.sort_order]
    );
  }
  // We don't re-seed tags — they survive truncation since pricing_tiers and tags
  // weren't included in the TRUNCATE list. Wait — they were? Let me check.
  // Actually they WERE truncated. So re-seed tags too:
  const EXPERTISE = [
    ['anxiety','Anxiety'], ['depression','Depression'], ['stress-burnout','Stress & Burnout'],
    ['relationships','Relationships'], ['self-esteem','Self-Esteem & Confidence'],
    ['grief-and-loss','Grief & Loss'], ['trauma-ptsd','Trauma & PTSD'],
    ['anger-management','Anger Management'], ['sleep-issues','Sleep Issues'],
    ['life-transitions','Life Transitions'], ['career-stress','Career Stress'],
    ['family-conflict','Family Conflict'], ['loneliness','Loneliness & Isolation'],
    ['mindfulness','Mindfulness & Meditation'], ['addiction-recovery','Addiction & Recovery'],
    ['identity-and-self','Identity & Self-Discovery'], ['parenting-support','Parenting Support'],
    ['body-image','Body Image & Eating'],
  ];
  const AUDIENCE = [
    ['teens','Teens (13-17)'], ['young-adults','Young Adults (18-25)'], ['adults','Adults'],
    ['couples','Couples'], ['parents','Parents'], ['students','Students'],
    ['working-professionals','Working Professionals'], ['lgbtq-plus','LGBTQ+'],
    ['caregivers','Caregivers'],
  ];
  let i = 0;
  for (const [slug, name] of EXPERTISE) {
    await pool.query(
      `INSERT INTO tags (slug, display_name, kind, sort_order, is_active)
       VALUES ($1,$2,'expertise',$3,TRUE) ON CONFLICT (slug) DO NOTHING`,
      [slug, name, i++]
    );
  }
  for (const [slug, name] of AUDIENCE) {
    await pool.query(
      `INSERT INTO tags (slug, display_name, kind, sort_order, is_active)
       VALUES ($1,$2,'audience',$3,TRUE) ON CONFLICT (slug) DO NOTHING`,
      [slug, name, i++]
    );
  }

  // Platform wallet + admin user
  const sys = await pool.query(
    `INSERT INTO users (email, full_name, role, is_active, email_verified_at)
     VALUES ('system@unmute.internal', 'unmute Platform', 'admin', TRUE, NOW())
     RETURNING id`
  );
  await pool.query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'platform', 0)`,
    [sys.rows[0].id]
  );
  const adminHash = await bcrypt.hash('testpassword1', 12);
  await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role, is_active, email_verified_at)
     VALUES ('harshgajbhiye34@gmail.com', $1, 'Harsh', 'admin', TRUE, NOW())`,
    [adminHash]
  );
}

async function createUser({ email, name }) {
  const password_hash = await bcrypt.hash(PW, 12);
  const r = await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role, is_active, email_verified_at)
     VALUES ($1, $2, $3, 'mentee', TRUE, NOW())
     RETURNING *`,
    [email, password_hash, name]
  );
  await pool.query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentee', 0)`,
    [r.rows[0].id]
  );
  return r.rows[0];
}

async function fundMenteeWallet(user_id, paise) {
  await pool.query(`UPDATE wallets SET balance_paise = $1 WHERE user_id = $2 AND kind = 'mentee'`, [paise, user_id]);
}

async function getTier(name) {
  return (await pool.query(`SELECT * FROM pricing_tiers WHERE name = $1`, [name])).rows[0];
}

async function createApprovedMentor({ email, name, tier, headline, bio, years, city, tagSlugs }) {
  const u = await createUser({ email, name });
  await pool.query(`UPDATE users SET role = 'mentor', location_city = $2 WHERE id = $1`, [u.id, city]);
  const t = await getTier(tier);
  await pool.query(
    `INSERT INTO mentor_profiles
       (user_id, pricing_tier_id, headline, bio, languages, years_experience,
        timezone, verification_status, verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Kolkata', 'approved', NOW())`,
    [u.id, t.id, headline, bio, ['en'], years]
  );
  await pool.query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentor', 0)
     ON CONFLICT (user_id, kind) DO NOTHING`,
    [u.id]
  );
  await attachTags(u.id, tagSlugs);
  return u;
}

async function attachTags(user_id, slugs) {
  for (const s of slugs) {
    await pool.query(
      `INSERT INTO mentor_tags (mentor_user_id, tag_id)
       SELECT $1, id FROM tags WHERE slug = $2 ON CONFLICT DO NOTHING`,
      [user_id, s]
    );
  }
}

async function createBooking({ mentor, mentee, slot_start, per_minute_paise, status, mentee_title }) {
  const end = new Date(new Date(slot_start).getTime() + 60 * 60_000);
  return (await pool.query(
    `INSERT INTO bookings
       (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
        per_minute_paise_snapshot, status, mentee_title)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [mentor.id, mentee.id, new Date(slot_start).toISOString(), end.toISOString(),
     per_minute_paise, status, mentee_title || null]
  )).rows[0];
}

function printSummary() {
  // eslint-disable-next-line no-console
  console.log(`
  ─────────────────────────────────────────────────────────────
   TEST USERS (password for everyone except admin: Password1!)
  ─────────────────────────────────────────────────────────────
   Admin:
     harshgajbhiye34@gmail.com  /  testpassword1

   Mentees:
     mentee1@test.com    ₹1,000   (full balance — happy path)
     mentee2@test.com    ₹50      (test low-balance / grace flow)
     mentee3@test.com    ₹0       (test top-up flow)

   Approved mentors:
     priya@test.com     ₹10/min  Anxiety / Sleep
     arjun@test.com     ₹20/min  Burnout / Career stress
     meera@test.com     ₹40/min  Couples
     rohan@test.com     ₹5/min   Teens / LGBTQ+

   Admin queue:
     pending_app@test.com   mentor application — pending review
     pending_kyc@test.com   approved mentor, KYC — pending review

   Pre-built bookings:
     mentee1 ↔ priya:   1 upcoming (in 24h) + 1 past completed with review
     mentee1 ↔ arjun:   1 upcoming, starts in ~3 minutes (test full meeting flow!)
     mentee2 ↔ meera:   1 past no-show
  ─────────────────────────────────────────────────────────────
  `);
}

if (require.main === module) {
  main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[dev-seed] failed:', e.message);
    process.exit(1);
  });
}
