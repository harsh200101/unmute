'use strict';

const { pool, query } = require('./_helpers');

afterAll(async () => {
  await pool.end().catch(() => {});
});

describe('Schema integrity (after 001_init applied)', () => {
  test('all expected tables exist', async () => {
    const res = await query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const names = res.rows.map((r) => r.tablename);

    const expected = [
      'admin_audit_log',
      'availability_override',
      'availability_template',
      'bookings',
      'email_verification_tokens',
      'meeting_events',
      'meetings',
      'mentor_kyc',
      'mentor_profiles',
      'mentor_tags',
      'notifications',
      'password_reset_tokens',
      'payments',
      'pricing_tiers',
      'refresh_tokens',
      'reviews',
      'schema_migrations',
      'session_notes',
      'tags',
      'users',
      'wallet_transactions',
      'wallets',
      'withdrawals',
    ];

    for (const t of expected) {
      expect(names).toContain(t);
    }
  });

  test('schema_migrations records 001_init', async () => {
    const res = await query(`SELECT version FROM schema_migrations WHERE version = '001_init'`);
    expect(res.rowCount).toBe(1);
  });

  test('citext + pgcrypto extensions installed', async () => {
    const res = await query(
      `SELECT extname FROM pg_extension WHERE extname IN ('citext', 'pgcrypto')`
    );
    expect(res.rows.map((r) => r.extname).sort()).toEqual(['citext', 'pgcrypto']);
  });

  test('users.email is case-insensitive (citext)', async () => {
    const a = await query(
      `INSERT INTO users (email, full_name, role) VALUES ($1, $2, 'mentee') RETURNING id`,
      ['Foo@Example.com', 'Foo']
    );
    expect(a.rows[0].id).toBeDefined();

    // Inserting same email with different case must collide on UNIQUE
    await expect(
      query(
        `INSERT INTO users (email, full_name, role) VALUES ($1, $2, 'mentee')`,
        ['foo@example.com', 'Foo2']
      )
    ).rejects.toThrow(/duplicate key/);

    await query(`DELETE FROM users WHERE id = $1`, [a.rows[0].id]);
  });

  test('bookings has UNIQUE(mentor_user_id, slot_start_at)', async () => {
    const res = await query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'bookings'::regclass
         AND contype = 'u'
         AND conname = 'bookings_no_double_book'`
    );
    expect(res.rowCount).toBe(1);
  });

  test('wallets.balance_paise has CHECK (>= 0)', async () => {
    const res = await query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'wallets'::regclass
         AND contype = 'c'
         AND pg_get_constraintdef(oid) LIKE '%balance_paise >= 0%'`
    );
    expect(res.rowCount).toBeGreaterThanOrEqual(1);
  });
});
