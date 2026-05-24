'use strict';

// Tracked migration runner. Replaces the previous "run-migration.js" approach
// that silently swallowed duplicate-object errors and had no version tracking.
//
// Behavior:
//   - Reads migrations/*.sql in lexicographic order.
//   - Maintains schema_migrations (version, applied_at, checksum).
//   - Refuses to run a file whose checksum differs from the recorded one
//     (i.e. someone edited a previously-applied migration; that's a bug).
//   - Each migration runs in its own transaction.
//
// Commands:
//   node src/migrator.js up        Apply all pending migrations.
//   node src/migrator.js status    Show applied vs pending.
//   node src/migrator.js reset     DROP SCHEMA public CASCADE; re-create.
//
// Reset is destructive and only honored when CONFIRM=yes is set in env.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool, withTransaction } = require('./config/db');
const env = require('./config/env');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function checksum(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum   TEXT NOT NULL
    )
  `);
}

async function getApplied() {
  const res = await pool.query('SELECT version, checksum FROM schema_migrations ORDER BY version');
  return new Map(res.rows.map((r) => [r.version, r.checksum]));
}

async function up() {
  await ensureMigrationsTable();
  const applied = await getApplied();
  const files = listMigrationFiles();

  let pendingCount = 0;
  for (const f of files) {
    const version = f.replace(/\.sql$/, '');
    const filePath = path.join(MIGRATIONS_DIR, f);
    const hash = checksum(filePath);

    if (applied.has(version)) {
      if (applied.get(version) !== hash) {
        throw new Error(
          `Migration ${version} was previously applied with a different checksum.\n` +
            `Stored: ${applied.get(version)}\n` +
            `Current: ${hash}\n` +
            `Do NOT edit applied migrations. Create a new one instead.`
        );
      }
      continue;
    }

    pendingCount += 1;
    const sql = fs.readFileSync(filePath, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`[migrator] applying ${version}…`);
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
        version,
        hash,
      ]);
    });
    // eslint-disable-next-line no-console
    console.log(`[migrator] ✓ ${version}`);
  }

  if (pendingCount === 0) {
    // eslint-disable-next-line no-console
    console.log('[migrator] nothing to apply, schema is up to date');
  } else {
    // eslint-disable-next-line no-console
    console.log(`[migrator] applied ${pendingCount} migration(s)`);
  }
}

async function status() {
  await ensureMigrationsTable();
  const applied = await getApplied();
  const files = listMigrationFiles();

  const rows = files.map((f) => {
    const version = f.replace(/\.sql$/, '');
    return {
      version,
      state: applied.has(version) ? 'applied' : 'pending',
    };
  });
  // eslint-disable-next-line no-console
  console.table(rows);
}

async function reset() {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset in production');
  }
  if (process.env.CONFIRM !== 'yes') {
    throw new Error(
      "This drops every table in public schema. Set CONFIRM=yes to proceed.\n" +
        '  CONFIRM=yes npm run db:reset'
    );
  }
  // eslint-disable-next-line no-console
  console.log('[migrator] dropping public schema…');
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.query('GRANT ALL ON SCHEMA public TO public');
  // eslint-disable-next-line no-console
  console.log('[migrator] public schema recreated');
}

async function main() {
  const cmd = process.argv[2] || 'up';
  try {
    if (cmd === 'up') await up();
    else if (cmd === 'status') await status();
    else if (cmd === 'reset') await reset();
    else {
      // eslint-disable-next-line no-console
      console.error(`Unknown command: ${cmd}. Use: up | status | reset`);
      process.exit(1);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[migrator] failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) main();

module.exports = { up, status, reset };
