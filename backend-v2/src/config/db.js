'use strict';

const { Pool } = require('pg');
const env = require('./env');

// Single pool, lazily created. Tests can override DATABASE_URL.
const pool = new Pool({
  connectionString: env.DATABASE_URL,
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
