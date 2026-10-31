'use strict';

// Polls PhonePe for payments that never received a webhook (deploy restart,
// dropped callback, wrong dashboard URL) and settles them. Idempotent: the
// payments row lock and the wallet idempotency key make replays safe.
//
// Runs on a single-instance deploy. If we ever scale out, several instances
// polling the same rows is still correct (settlement is idempotent), just
// slightly wasteful.

const env = require('../config/env');
const payments = require('../services/paymentsService');

const INTERVAL_MS = 60_000;

let _timer = null;

function start() {
  if (_timer || env.NODE_ENV === 'test') return _timer;
  if (env.PAYMENT_GATEWAY !== 'phonepe') {
    // eslint-disable-next-line no-console
    console.log('[payments] reconciler disabled (PAYMENT_GATEWAY is not phonepe)');
    return null;
  }

  _timer = setInterval(() => {
    payments
      .reconcilePendingPhonepePayments()
      .then((summary) => {
        if (summary.checked > 0) {
          // eslint-disable-next-line no-console
          console.log(
            `[payments] reconciled ${summary.checked} pending: ` +
            `${summary.settled} settled, ${summary.failed} failed, ` +
            `${summary.pending} still pending, ${summary.errors} errors`
          );
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[payments] reconciliation tick failed:', err.message);
      });
  }, INTERVAL_MS);
  _timer.unref();

  // eslint-disable-next-line no-console
  console.log(`[payments] reconciler started - every ${INTERVAL_MS}ms`);
  return _timer;
}

function stop() {
  if (_timer) clearInterval(_timer);
  _timer = null;
}

module.exports = { start, stop, INTERVAL_MS };
