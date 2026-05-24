'use strict';

const { pool, query } = require('./_helpers');

afterAll(async () => {
  await pool.end().catch(() => {});
});

describe('Migrator', () => {
  test('is idempotent — running up() again is a no-op', async () => {
    // _globalSetup already ran up(). The pool was ended after setup; require
    // the migrator fresh now and re-run.
    jest.resetModules();
    const { up } = require('../src/migrator');
    await expect(up()).resolves.not.toThrow();
  });

  test('checksum guard — tampering with a recorded checksum makes up() refuse', async () => {
    // Corrupt the stored checksum for 001_init
    await query(`UPDATE schema_migrations SET checksum = 'bogus' WHERE version = '001_init'`);

    jest.resetModules();
    const { up } = require('../src/migrator');
    await expect(up()).rejects.toThrow(/different checksum/);

    // Restore so other tests don't see the corruption (re-derive the real checksum)
    const fs = require('fs');
    const crypto = require('crypto');
    const path = require('path');
    const realPath = path.join(__dirname, '..', 'src', 'migrations', '001_init.sql');
    const realHash = crypto.createHash('sha256').update(fs.readFileSync(realPath)).digest('hex');
    await query(`UPDATE schema_migrations SET checksum = $1 WHERE version = '001_init'`, [
      realHash,
    ]);
  });
});
