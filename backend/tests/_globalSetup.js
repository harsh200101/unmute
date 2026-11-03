'use strict';

// Phase 0 test bootstrap.
//
// Builds a fresh, schema-loaded test database (separate from dev `unmute_v2`)
// before the suite runs. The DB name is taken from TEST_DATABASE_URL or
// derived from DATABASE_URL by appending `_test`.
//
// Steps:
//   1. Parse DB connection params from TEST_DATABASE_URL (or fall back).
//   2. Connect to the `postgres` admin DB; DROP + CREATE the test DB
//      (drops anything left over from a prior failed run).
//   3. Hot-swap DATABASE_URL so the migrator (which reads from env) targets
//      the test DB.
//   4. Run the migrator's `up` against the test DB.
//   5. Restore DATABASE_URL for any tests that import it later (they all
//      use config/db.js which reads at import time, see below).

const path = require('path');
const { Client } = require('pg');

// The suite must never talk to a real mail server. env.js now hard-requires
// SMTP_USER/SMTP_PASS whenever EMAIL_PROVIDER is not "stub", and sendEmail()
// short-circuits on NODE_ENV=test, so pin both before anything imports env.js.
process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'stub';
delete process.env.SMTP_HOST;
delete process.env.SMTP_PORT;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.EMAIL_FROM;
// Pin the payment gateway so the suite exercises the PhonePe flow regardless of
// what a developer put in backend/.env. Razorpay is covered by unit tests that
// mock the env module.
process.env.PAYMENT_GATEWAY = 'phonepe';

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// dotenv does NOT override already-set vars, but a developer's local .env could
// still re-introduce SMTP credentials. Re-assert after loading so the suite can
// never attempt a live send.
process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'stub';
// dotenv won't override the already-set PAYMENT_GATEWAY above, but re-assert in
// case an earlier import loaded a different value.
process.env.PAYMENT_GATEWAY = 'phonepe';

function deriveTestUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const dev = process.env.DATABASE_URL;
  if (!dev) {
    throw new Error('Neither TEST_DATABASE_URL nor DATABASE_URL is set');
  }
  // Append _test to the database name in the URL
  return dev.replace(/\/([^/?]+)(\?.*)?$/, (_m, db, qs) => `/${db}_test${qs || ''}`);
}

function urlParts(url) {
  const u = new URL(url);
  return {
    user: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
    host: u.hostname,
    port: u.port || '5432',
    database: u.pathname.replace(/^\//, ''),
  };
}

module.exports = async function globalSetup() {
  const testUrl = deriveTestUrl();
  const parts = urlParts(testUrl);

  // 1. Drop + create the test database from the `postgres` admin DB
  const ssl =
    parts.host.includes('render.com') ||
    process.env.DB_SSL === 'true' ||
    process.env.NODE_ENV === 'production';

  const admin = new Client({
    user: parts.user,
    password: parts.password || undefined,
    host: parts.host,
    port: Number(parts.port),
    database: 'postgres',
    ssl: ssl ? { rejectUnauthorized: false } : false,
  });
  await admin.connect();
  try {
    // Terminate any lingering connections so DROP succeeds
    try {
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [parts.database]
      );
    } catch (_) {}
    await admin.query(`DROP DATABASE IF EXISTS "${parts.database}"`);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await admin.query(`CREATE DATABASE "${parts.database}"`);
        break;
      } catch (err) {
        if (err.code === '23505' && attempt < 4) {
          await new Promise((r) => setTimeout(r, 600));
        } else {
          throw err;
        }
      }
    }
  } finally {
    await admin.end();
  }

  // 2. Point the migrator at the test DB and run it
  process.env.DATABASE_URL = testUrl;
  // Lazy-load migrator after env swap so its db pool picks up the new URL
  const { up } = require('../src/migrator');
  await up();

  // 3. Close the migrator's pool so we start tests with a fresh pool
  const { pool } = require('../src/config/db');
  await pool.end();

  // 4. Stash test URL in a global for teardown
  global.__TEST_DB_URL__ = testUrl;
};
