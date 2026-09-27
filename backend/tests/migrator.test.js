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

  // Regression guard. An edit to 009_email_log.sql (comments only) shipped in
  // 2c0862a and blocked every deploy, because the checksum covers the whole
  // file. The prod DB holds 436a6651... for that migration; if the file ever
  // changes again, migrator.js will refuse to start the server, so catch it in
  // CI where the fix is cheap instead of in production.
  //
  // The expectation is pinned to the checksum recorded in production, not to
  // whatever the file currently contains - that is the whole point.
  test('applied migrations are not edited after the fact', async () => {
    const fs = require('fs');
    const crypto = require('crypto');
    const path = require('path');
    const dir = path.join(__dirname, '..', 'src', 'migrations');

    // Checksums as applied in the production database.
    const APPLIED_IN_PROD = {
      '009_email_log.sql':
        '436a66516899d81fa4674f8f28e9f6bb50d74efc5c6b86d95f138f2cca3b0fc4',
    };

    const drifted = [];
    for (const [file, expected] of Object.entries(APPLIED_IN_PROD)) {
      const actual = crypto
        .createHash('sha256')
        // Normalise line endings: this suite may run on Windows (CRLF) while
        // the checksum was recorded from a Linux container (LF).
        .update(fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n'))
        .digest('hex');
      if (actual !== expected) {
        drifted.push(`${file}: expected ${expected}, got ${actual}`);
      }
    }

    expect(drifted).toEqual([]);
  });
});
