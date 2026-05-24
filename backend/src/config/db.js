'use strict';

const { Pool, types } = require('pg');
const env = require('./env');

// pg returns BIGINT (OID 20) as strings by default to avoid precision loss
// past 2^53. Our IDs are BIGSERIALs that will never approach that limit,
// and we rely on `===` between req.user.id (number from JWT.sub) and
// booking.mentor_user_id (DB-returned BIGINT) in service code. Coerce to
// number once here so the rest of the app can use === safely.
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

// Render-managed Postgres requires SSL but ships a self-signed CA the Node
// pg client doesn't trust by default. In production we enable SSL with
// `rejectUnauthorized: false` so the handshake succeeds; locally we skip SSL
// entirely because dev databases run plain TCP. The `?sslmode=disable` escape
// hatch lets tests opt out even in production-like environments.
const sslRequired =
  env.NODE_ENV === 'production' &&
  !/sslmode=disable/.test(env.DATABASE_URL || '');

// Single pool, lazily created. Tests can override DATABASE_URL.
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: sslRequired ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] idle client error', err);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  if (env.NODE_ENV !== 'production' && env.LOG_LEVEL === 'debug') {
    const ms = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log('[db]', { text: text.slice(0, 80), ms, rows: res.rowCount });
  }
  return res;
}

// Helper for transactions with automatic rollback on throw.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
