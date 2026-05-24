'use strict';

// Shared test helpers. Reset state between tests with `truncateAll()`.
// Factories return DB rows so tests can chain on them.

const request = require('supertest');
const { pool, query, withTransaction } = require('../src/config/db');
const { hashPassword } = require('../src/utils/crypto');
const { signAccessToken } = require('../src/utils/jwt');

// Order matters: tables with FKs first. ON DELETE CASCADE handles most,
// but TRUNCATE ... CASCADE is the safest reset between tests. We exclude
// schema_migrations so we don't have to re-run migrations between tests.
const TABLES = [
  'admin_audit_log',
  'notifications',
  'session_notes',
  'reviews',
  'withdrawals',
  'mentor_kyc',
  'payments',
  'wallet_transactions',
  'wallets',
  'meeting_events',
  'meetings',
  'bookings',
  'availability_override',
  'availability_template',
  'mentor_tags',
  'mentor_profiles',
  'tags',
  'pricing_tiers',
  'password_reset_tokens',
  'email_verification_tokens',
  'refresh_tokens',
  'users',
];

async function truncateAll() {
  await query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}

// --- Factories ---------------------------------------------------------------

let _userCounter = 0;
async function createUser(overrides = {}) {
  _userCounter += 1;
  const defaults = {
    email: `u${_userCounter}-${Date.now()}@test.local`,
    full_name: `Test User ${_userCounter}`,
    role: 'mentee',
    email_verified_at: new Date(),
  };
  const row = { ...defaults, ...overrides };
  const res = await query(
    `INSERT INTO users (email, full_name, role, email_verified_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [row.email, row.full_name, row.role, row.email_verified_at]
  );
  return res.rows[0];
}

async function createPricingTier(overrides = {}) {
  const defaults = {
    name: `tier-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    display_name: 'Test Tier',
    per_minute_paise: 1000,
    sort_order: 1,
  };
  const t = { ...defaults, ...overrides };
  const res = await query(
    `INSERT INTO pricing_tiers (name, display_name, per_minute_paise, sort_order)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [t.name, t.display_name, t.per_minute_paise, t.sort_order]
  );
  return res.rows[0];
}

async function createMentor(overrides = {}) {
  const user = await createUser({ role: 'mentor', ...(overrides.user || {}) });
  const tier = overrides.tier || (await createPricingTier());
  const res = await query(
    `INSERT INTO mentor_profiles (user_id, pricing_tier_id, headline, bio, verification_status)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      user.id,
      tier.id,
      overrides.headline || 'Test mentor headline',
      overrides.bio || 'Test mentor bio',
      overrides.verification_status || 'approved',
    ]
  );
  return { user, mentor: res.rows[0], tier };
}

async function createWallet(user_id, kind = 'mentee', initial_paise = 0) {
  const res = await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, $2, $3) RETURNING *`,
    [user_id, kind, initial_paise]
  );
  return res.rows[0];
}

async function createBooking(overrides = {}) {
  const mentor = overrides.mentor || (await createMentor()).user;
  const mentee = overrides.mentee || (await createUser({ role: 'mentee' }));
  const slot_start_at = overrides.slot_start_at || new Date(Date.now() + 24 * 3600_000);
  const slot_end_at = new Date(new Date(slot_start_at).getTime() + 60 * 60_000);

  const res = await query(
    `INSERT INTO bookings (
       mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
       per_minute_paise_snapshot, status
     ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      mentor.id,
      mentee.id,
      slot_start_at,
      slot_end_at,
      overrides.per_minute_paise_snapshot || 1000,
      overrides.status || 'scheduled',
    ]
  );
  return res.rows[0];
}

// Create a user with a known password + auto-issue a JWT.
// Returns { user, access_token } so tests can immediately hit auth-only routes.
async function createUserWithToken(overrides = {}) {
  const password_hash = await hashPassword('longenoughpw1');
  const user = await createUser({
    ...overrides,
    // verified by default; pass email_verified_at: null to override
  });
  // Set password_hash directly so callers can also use POST /api/auth/login
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [password_hash, user.id]);
  user.password_hash = password_hash;
  const access_token = signAccessToken({
    ...user,
    email_verified_at: user.email_verified_at,
  });
  return { user, access_token };
}

async function createAdminWithToken(overrides = {}) {
  return createUserWithToken({ role: 'admin', email: `admin-${Date.now()}@test.local`, ...overrides });
}

// Re-seed pricing tiers + tags after a truncateAll (they live in the same tables we wipe).
async function seedReferenceData() {
  // Tiers
  const tiers = [
    ['starter',  'Starter',  500,  1],
    ['standard', 'Standard', 1000, 2],
    ['expert',   'Expert',   2000, 3],
    ['premium',  'Premium',  4000, 4],
  ];
  for (const [name, display, paise, sort] of tiers) {
    await query(
      `INSERT INTO pricing_tiers (name, display_name, per_minute_paise, sort_order)
       VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING`,
      [name, display, paise, sort]
    );
  }
  // A handful of tags is enough for tests
  const tags = [
    ['career-coaching', 'Career Coaching', 'expertise'],
    ['interview-prep',  'Interview Prep',  'expertise'],
    ['fintech',         'Fintech',         'industry'],
    ['edtech',          'EdTech',          'industry'],
  ];
  for (let i = 0; i < tags.length; i++) {
    await query(
      `INSERT INTO tags (slug, display_name, kind, sort_order)
       VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING`,
      [tags[i][0], tags[i][1], tags[i][2], i]
    );
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
  request,
  truncateAll,
  seedReferenceData,
  createUser,
  createUserWithToken,
  createAdminWithToken,
  createPricingTier,
  createMentor,
  createWallet,
  createBooking,
};
