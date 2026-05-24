'use strict';

// Closes any open pg pools so jest can exit cleanly.
// We intentionally leave unmute_v2_test in place so post-mortem inspection is
// possible. The next test run drops + recreates it in _globalSetup.

module.exports = async function globalTeardown() {
  try {
    const { pool } = require('../src/config/db');
    await pool.end();
  } catch (_) {
    // pool may already be ended
  }
};
