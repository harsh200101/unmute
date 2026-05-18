/**
 * Session lifecycle background job.
 *
 * Sessions can get stuck in `confirmed` / `in_progress` / `pending` if neither
 * mentor nor mentee performs an explicit action. This job sweeps the table on
 * a fixed interval and transitions them to terminal states using SQL-level
 * conditions so it is safe to run from multiple replicas.
 *
 * Transitions (all comparisons against NOW()):
 *   confirmed   + scheduled_at + duration + GRACE_NO_SHOW_MIN < now
 *               AND actual_start_time IS NULL
 *               -> no_show
 *
 *   in_progress + scheduled_at + duration + GRACE_IN_PROGRESS_MIN < now
 *               AND billing_status != 'finalized'
 *               -> billingEngine.endSession('auto_expired')   (also sets completed)
 *
 *   pending     + scheduled_at < now
 *               -> cancelled
 */

const db = require('../config/database');
const { endSession } = require('./billingEngine');

const GRACE_NO_SHOW_MIN = 15;
const GRACE_IN_PROGRESS_MIN = 30;
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let intervalHandle = null;
let running = false; // simple in-process lock so overlapping sweeps cannot run

async function markNoShow() {
  const result = await db.query(
    `UPDATE sessions
     SET status = 'no_show',
         updated_at = CURRENT_TIMESTAMP,
         admin_notes = COALESCE(admin_notes, '') ||
                       E'\nAuto-transitioned to no_show by lifecycle job at ' || NOW()
     WHERE status = 'confirmed'
       AND actual_start_time IS NULL
       AND (scheduled_at + (duration_minutes || ' minutes')::interval
            + ($1 || ' minutes')::interval) < NOW()
     RETURNING id`,
    [GRACE_NO_SHOW_MIN]
  );
  return result.rows.map((r) => r.id);
}

async function findStuckInProgress() {
  const result = await db.query(
    `SELECT id
     FROM sessions
     WHERE status = 'in_progress'
       AND billing_status != 'finalized'
       AND (scheduled_at + (duration_minutes || ' minutes')::interval
            + ($1 || ' minutes')::interval) < NOW()`,
    [GRACE_IN_PROGRESS_MIN]
  );
  return result.rows.map((r) => r.id);
}

async function cancelExpiredPending() {
  const result = await db.query(
    `UPDATE sessions
     SET status = 'cancelled',
         updated_at = CURRENT_TIMESTAMP,
         admin_notes = COALESCE(admin_notes, '') ||
                       E'\nAuto-cancelled (pending past scheduled_at) by lifecycle job at ' || NOW()
     WHERE status = 'pending'
       AND scheduled_at < NOW()
     RETURNING id`
  );
  return result.rows.map((r) => r.id);
}

async function runSweep() {
  if (running) {
    console.log('[SessionLifecycleJob] Previous sweep still running, skipping.');
    return;
  }
  running = true;
  const startedAt = Date.now();
  try {
    const [noShowIds, pendingIds, stuckInProgress] = await Promise.all([
      markNoShow(),
      cancelExpiredPending(),
      findStuckInProgress(),
    ]);

    if (noShowIds.length) {
      console.log(`[SessionLifecycleJob] Marked no_show: ${noShowIds.join(', ')}`);
    }
    if (pendingIds.length) {
      console.log(`[SessionLifecycleJob] Cancelled stale pending: ${pendingIds.join(', ')}`);
    }

    // Finalize stuck in_progress sessions one at a time so a single billing
    // failure does not break the whole sweep.
    for (const id of stuckInProgress) {
      try {
        await endSession(id, 'auto_expired');
        console.log(`[SessionLifecycleJob] Finalized stuck in_progress session ${id}`);
      } catch (err) {
        console.error(`[SessionLifecycleJob] Failed to finalize session ${id}:`, err.message);
      }
    }

    const totalActions = noShowIds.length + pendingIds.length + stuckInProgress.length;
    if (totalActions > 0) {
      console.log(
        `[SessionLifecycleJob] Sweep complete in ${Date.now() - startedAt}ms (` +
          `no_show=${noShowIds.length}, cancelled=${pendingIds.length}, ` +
          `finalized=${stuckInProgress.length})`
      );
    }
  } catch (err) {
    console.error('[SessionLifecycleJob] Sweep failed:', err);
  } finally {
    running = false;
  }
}

function start() {
  if (intervalHandle) return; // already started

  // Run once on boot so freshly-deployed instances clean up immediately,
  // then schedule the recurring sweep.
  setTimeout(runSweep, 10 * 1000); // 10s delay so DB pool is warm
  intervalHandle = setInterval(runSweep, INTERVAL_MS);
  console.log(`✅ Session lifecycle job started (sweep every ${INTERVAL_MS / 1000}s)`);
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { start, stop, runSweep };
