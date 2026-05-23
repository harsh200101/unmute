'use strict';

// Simple in-process scheduler. No external dependency — just setInterval.
// Suitable for a single-instance deploy; if/when we scale to multiple workers,
// swap this for a pg-based lock (pg-boss, pgmq) or a redis lock.
//
// On boot the server starts:
//   - tickBilling:            every 10s (warn / enter grace / finalize after grace)
//   - finalizeExpiredMeetings every 30s (slot_end cleanup)
//
// All jobs are no-ops when the test suite runs (NODE_ENV=test), so tests can
// drive the engine deterministically without interference.

const env = require('../config/env');
const billing = require('../services/billingEngine');

const TICK_BILLING_MS = 10_000;
const FINALIZE_EXPIRED_MS = 30_000;

const _timers = [];
let _started = false;

function start() {
  if (_started) return;
  if (env.NODE_ENV === 'test') return;
  _started = true;

  _timers.push(setInterval(() => {
    billing.tickBilling().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[scheduler] tickBilling failed:', err.message);
    });
  }, TICK_BILLING_MS));

  _timers.push(setInterval(() => {
    billing.finalizeExpiredMeetings().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[scheduler] finalizeExpiredMeetings failed:', err.message);
    });
  }, FINALIZE_EXPIRED_MS));

  // eslint-disable-next-line no-console
  console.log(`[scheduler] started — tickBilling every ${TICK_BILLING_MS}ms, finalizeExpired every ${FINALIZE_EXPIRED_MS}ms`);
}

function stop() {
  for (const t of _timers) clearInterval(t);
  _timers.length = 0;
  _started = false;
}

module.exports = { start, stop, TICK_BILLING_MS, FINALIZE_EXPIRED_MS };
