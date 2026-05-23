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

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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
  const admin = new Client({
    user: parts.user,
    password: parts.password || undefined,
    host: parts.host,
    port: Number(parts.port),
    database: 'postgres',
  });
  await admin.connect();
  try {
    // Terminate any lingering connections so DROP succeeds
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [parts.database]
    );
    await admin.query(`DROP DATABASE IF EXISTS "${parts.database}"`);
    await admin.query(`CREATE DATABASE "${parts.database}"`);
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
