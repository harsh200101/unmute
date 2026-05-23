'use strict';

// Idempotent seed for v2. Safe to run multiple times.
// Seeds:
//   - Pricing tiers (4)
//   - A starter tag list (expertise + industry)
//   - A platform "system" user + platform wallet
//   - An admin user (if ADMIN_EMAIL + ADMIN_PASSWORD env vars are set)
//
// Real mentee/mentor users are NOT seeded here — use the signup flow.

const { pool } = require('./config/db');
const bcrypt = require('bcrypt');

const TIERS = [
  { name: 'starter',  display_name: 'Starter',  per_minute_paise: 500,  sort_order: 1 },
  { name: 'standard', display_name: 'Standard', per_minute_paise: 1000, sort_order: 2 },
  { name: 'expert',   display_name: 'Expert',   per_minute_paise: 2000, sort_order: 3 },
  { name: 'premium',  display_name: 'Premium',  per_minute_paise: 4000, sort_order: 4 },
];

const TAGS = [
  // expertise
  ['career-coaching',  'Career Coaching',  'expertise'],
  ['resume-review',    'Resume Review',    'expertise'],
  ['interview-prep',   'Interview Prep',   'expertise'],
  ['leadership',       'Leadership',       'expertise'],
  ['product-strategy', 'Product Strategy', 'expertise'],
  ['system-design',    'System Design',    'expertise'],
  ['data-science',     'Data Science',     'expertise'],
  ['ux-design',        'UX Design',        'expertise'],
  ['negotiation',      'Negotiation',      'expertise'],
  ['public-speaking',  'Public Speaking',  'expertise'],
  // industry
  ['software',         'Software',         'industry'],
  ['fintech',          'Fintech',          'industry'],
  ['edtech',           'EdTech',           'industry'],
  ['healthcare',       'Healthcare',       'industry'],
  ['ecommerce',        'E-commerce',       'industry'],
  ['consulting',       'Consulting',       'industry'],
  ['startups',         'Startups',         'industry'],
  ['media',            'Media',            'industry'],
];

async function seedTiers() {
  for (let i = 0; i < TIERS.length; i++) {
    const t = TIERS[i];
    await pool.query(
      `INSERT INTO pricing_tiers (name, display_name, per_minute_paise, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             per_minute_paise = EXCLUDED.per_minute_paise,
             sort_order = EXCLUDED.sort_order`,
      [t.name, t.display_name, t.per_minute_paise, t.sort_order]
    );
  }
}

async function seedTags() {
  for (let i = 0; i < TAGS.length; i++) {
    const [slug, display, kind] = TAGS[i];
    await pool.query(
      `INSERT INTO tags (slug, display_name, kind, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             kind = EXCLUDED.kind`,
      [slug, display, kind, i]
    );
  }
}

async function seedPlatformWallet() {
  // System user owns the platform wallet. Never logs in (no password set).
  const sysEmail = 'system@unmute.internal';
  const res = await pool.query(
    `INSERT INTO users (email, full_name, role, is_active, email_verified_at)
     VALUES ($1, $2, 'admin', TRUE, NOW())
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`,
    [sysEmail, 'unmute Platform']
  );
  const systemUserId = res.rows[0].id;

  await pool.query(
    `INSERT INTO wallets (user_id, kind, balance_paise)
     VALUES ($1, 'platform', 0)
     ON CONFLICT (user_id, kind) DO NOTHING`,
    [systemUserId]
  );
}

async function seedAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.log('[seed]   (admin user skipped — set ADMIN_EMAIL + ADMIN_PASSWORD to enable)');
    return;
  }
  const password_hash = await bcrypt.hash(password, 12);
  const fullName = process.env.ADMIN_NAME || 'Admin';
  await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role, is_active, email_verified_at)
     VALUES ($1, $2, $3, 'admin', TRUE, NOW())
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = 'admin',
           is_active = TRUE,
           email_verified_at = COALESCE(users.email_verified_at, NOW())`,
    [email, password_hash, fullName]
  );
  // eslint-disable-next-line no-console
  console.log(`[seed]   admin user ${email} ready`);
}

async function main() {
  try {
    // eslint-disable-next-line no-console
    console.log('[seed] tiers…');
    await seedTiers();
    // eslint-disable-next-line no-console
    console.log('[seed] tags…');
    await seedTags();
    // eslint-disable-next-line no-console
    console.log('[seed] platform wallet…');
    await seedPlatformWallet();
    // eslint-disable-next-line no-console
    console.log('[seed] admin user…');
    await seedAdminUser();
    // eslint-disable-next-line no-console
    console.log('[seed] done');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[seed] failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) main();
