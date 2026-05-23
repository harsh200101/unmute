'use strict';

// The brain of the v2 app. Phase 7 responsibilities:
//
//   1. Roll the open "active" interval into billed_seconds/paise whenever
//      the meeting transitions out of `active` (paused, finalized, or
//      auto-ended). Called from meetingService.recordPresence/endMeeting
//      and from the cron worker.
//
//   2. Finalize a meeting: apply the 5-minute minimum (if both parties
//      ever joined), split into mentor (70%) + platform (30%) shares, and
//      write three wallet_transactions in a single DB transaction. If the
//      mentee's wallet is short, we charge what's available — the hard
//      cutoff cron should have ended the call before this point in
//      practice.
//
//   3. Periodic "stuck meeting" finalization: any meeting where the
//      booking's slot_end_at has passed but billing_state isn't 'finalized'
//      is finalized with end_reason='slot_expired'. Same for meetings whose
//      mentee wallet has depleted (end_reason='balance_depleted').
//
//   4. Real-time billing snapshot for the frontend HUD.

const { query, withTransaction } = require('../config/db');
const { notFound, forbidden, bad } = require('../utils/errors');

const FIVE_MIN_SECONDS = 5 * 60;
const PLATFORM_FEE_BPS = 3000; // 30% in basis points
const MENTOR_SHARE_BPS = 10000 - PLATFORM_FEE_BPS;

// --- helpers ----------------------------------------------------------------

function calcPaise({ seconds, per_minute_paise }) {
  // floor to whole paise; per-second cost = per_minute_paise / 60
  return Math.floor((seconds * per_minute_paise) / 60);
}

async function getWalletIdLocked(client, user_id, kind) {
  const r = await client.query(
    `SELECT id FROM wallets WHERE user_id = $1 AND kind = $2 FOR UPDATE`,
    [user_id, kind]
  );
  return r.rows[0]?.id || null;
}

async function getPlatformWalletIdLocked(client) {
  const r = await client.query(`SELECT id FROM wallets WHERE kind = 'platform' LIMIT 1 FOR UPDATE`);
  return r.rows[0]?.id || null;
}

// Roll any currently-running active interval into the meeting's accumulator.
// Idempotent: safe to call multiple times; if state isn't 'active' it's a no-op.
// Caller is expected to be inside a withTransaction block; we issue queries
// on `client`. Returns the updated meeting row.
async function rollIntoBilled(client, meeting_id) {
  const r = await client.query(`SELECT * FROM meetings WHERE id = $1 FOR UPDATE`, [meeting_id]);
  const m = r.rows[0];
  if (!m) throw notFound('meeting_not_found');
  if (m.billing_state !== 'active' || !m.billing_active_since) return m;

  const b = (await client.query(
    `SELECT per_minute_paise_snapshot FROM bookings WHERE id = $1`,
    [m.booking_id]
  )).rows[0];
  const rate = b?.per_minute_paise_snapshot || 0;

  const elapsed_sec = Math.max(0, Math.floor((Date.now() - new Date(m.billing_active_since).getTime()) / 1000));
  if (elapsed_sec === 0) return m;
  const delta_paise = calcPaise({ seconds: elapsed_sec, per_minute_paise: rate });

  const updated = await client.query(
    `UPDATE meetings
        SET billed_seconds = billed_seconds + $1,
            billed_paise   = billed_paise   + $2,
            billing_active_since = NULL
      WHERE id = $3
      RETURNING *`,
    [elapsed_sec, delta_paise, meeting_id]
  );
  return updated.rows[0];
}

// Re-arm the running clock. Idempotent: only sets the timer if not already armed.
async function startActiveClock(client, meeting_id, when) {
  await client.query(
    `UPDATE meetings
        SET billing_active_since = COALESCE(billing_active_since, $1)
      WHERE id = $2`,
    [when || new Date(), meeting_id]
  );
}

// --- Finalize (the big one) -------------------------------------------------

// Finalize a meeting:
//  - Rolls any active interval into billed.
//  - Applies 5-min minimum if both parties ever joined (billed_seconds < 300).
//  - Computes mentor 70% + platform 30%.
//  - Writes 3 ledger entries in one transaction (mentee debit, mentor credit,
//    platform credit). If mentee wallet has less than total, we charge what
//    is available and treat the deficit as a platform shortfall (no debt is
//    created — the hard-cutoff cron should prevent this in practice).
//  - Updates meeting + booking statuses.
//
// Idempotent: if state is already 'finalized', returns immediately.
async function finalizeMeeting({ meeting_id, end_reason, by_user_id }) {
  return withTransaction(async (client) => {
    const m0 = (await client.query(`SELECT * FROM meetings WHERE id = $1 FOR UPDATE`, [meeting_id])).rows[0];
    if (!m0) throw notFound('meeting_not_found');
    if (m0.billing_state === 'finalized') return m0;

    // 1. Roll the open interval (if active) into the accumulator
    const m = await rollIntoBilled(client, meeting_id);

    // 2. Load booking + rate
    const booking = (await client.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [m.booking_id])).rows[0];
    const rate = booking.per_minute_paise_snapshot;

    // 3. Apply 5-min minimum if both parties ever joined
    const bothJoined = !!m.mentor_first_joined_at && !!m.mentee_first_joined_at;
    let billed_seconds = m.billed_seconds;
    let billed_paise = m.billed_paise;
    let applied_minimum = false;
    if (bothJoined && billed_seconds < FIVE_MIN_SECONDS) {
      const min_paise = calcPaise({ seconds: FIVE_MIN_SECONDS, per_minute_paise: rate });
      if (min_paise > billed_paise) {
        billed_paise = min_paise;
        billed_seconds = FIVE_MIN_SECONDS;
        applied_minimum = true;
      }
    }

    // No-show / never-billed path
    let total_paise = bothJoined ? billed_paise : 0;
    let mentor_paise = 0;
    let platform_paise = 0;

    if (total_paise > 0) {
      // 4. Try to debit mentee wallet by total_paise. If short, debit only
      //    what's available (deficit absorbed by platform — the hard-cutoff
      //    cron should prevent this case in practice).
      const menteeWalletId = await getWalletIdLocked(client, booking.mentee_user_id, 'mentee');
      if (!menteeWalletId) throw new Error('Mentee wallet missing');
      const menteeBal = (await client.query(`SELECT balance_paise FROM wallets WHERE id = $1`, [menteeWalletId])).rows[0].balance_paise;
      const debit = Math.min(menteeBal, total_paise);

      mentor_paise = Math.floor((total_paise * MENTOR_SHARE_BPS) / 10000);
      platform_paise = total_paise - mentor_paise;

      // If we couldn't debit the full total, scale shares down proportionally
      // so the books balance. mentor share keeps 70%; platform absorbs the gap.
      const adjusted_mentor = Math.floor((debit * MENTOR_SHARE_BPS) / 10000);
      const adjusted_platform = debit - adjusted_mentor;

      // (a) debit mentee `debit` paise
      if (debit > 0) {
        await client.query(
          `INSERT INTO wallet_transactions
             (wallet_id, direction, amount_paise, reason,
              reference_table, reference_id, idempotency_key, description, balance_after_paise)
           VALUES ($1, 'debit', $2, 'session_charge', 'meetings', $3, $4, $5, 0)`,
          [menteeWalletId, debit, m.id, `meeting:${m.uuid}:charge`, `Session charge for meeting ${m.uuid}`]
        );
      }

      // (b) credit mentor wallet adjusted_mentor paise
      const mentorWalletId = await getWalletIdLocked(client, booking.mentor_user_id, 'mentor');
      if (mentorWalletId && adjusted_mentor > 0) {
        await client.query(
          `INSERT INTO wallet_transactions
             (wallet_id, direction, amount_paise, reason,
              reference_table, reference_id, idempotency_key, description, balance_after_paise)
           VALUES ($1, 'credit', $2, 'session_payout', 'meetings', $3, $4, $5, 0)`,
          [mentorWalletId, adjusted_mentor, m.id, `meeting:${m.uuid}:payout`, `Session earnings for meeting ${m.uuid}`]
        );
      }
      mentor_paise = adjusted_mentor;

      // (c) credit platform wallet adjusted_platform paise
      const platformWalletId = await getPlatformWalletIdLocked(client);
      if (platformWalletId && adjusted_platform > 0) {
        await client.query(
          `INSERT INTO wallet_transactions
             (wallet_id, direction, amount_paise, reason,
              reference_table, reference_id, idempotency_key, description, balance_after_paise)
           VALUES ($1, 'credit', $2, 'platform_fee', 'meetings', $3, $4, $5, 0)`,
          [platformWalletId, adjusted_platform, m.id, `meeting:${m.uuid}:platform_fee`, `Platform fee for meeting ${m.uuid}`]
        );
      }
      platform_paise = adjusted_platform;
      total_paise = debit; // what we actually billed
    }

    // 5. Write final state on meeting
    const now = new Date();
    const updated = await client.query(
      `UPDATE meetings
          SET billing_state = 'finalized',
              billed_seconds = $1,
              billed_paise = $2,
              ended_at = COALESCE(ended_at, $3),
              end_reason = COALESCE(end_reason, $4),
              finalized_at = $3,
              finalized_total_paise = $5,
              finalized_mentor_paise = $6,
              finalized_platform_paise = $7,
              mentor_present = FALSE,
              mentee_present = FALSE,
              billing_active_since = NULL
        WHERE id = $8
        RETURNING *`,
      [billed_seconds, billed_paise, now, end_reason || 'admin_forced',
       total_paise, mentor_paise, platform_paise, meeting_id]
    );

    // 6. Audit event
    await client.query(
      `INSERT INTO meeting_events (meeting_id, kind, payload)
       VALUES ($1, 'finalize', $2)`,
      [meeting_id, {
        ts: now.toISOString(),
        end_reason: end_reason || 'admin_forced',
        by_user_id,
        applied_minimum,
        billed_seconds,
        billed_paise,
        total_paise,
        mentor_paise,
        platform_paise,
      }]
    );

    // 7. Reflect on booking
    if (bothJoined) {
      await client.query(`UPDATE bookings SET status = 'completed' WHERE id = $1`, [booking.id]);
    } else if (booking.status === 'scheduled' || booking.status === 'in_call') {
      await client.query(`UPDATE bookings SET status = 'no_show' WHERE id = $1`, [booking.id]);
    }

    return updated.rows[0];
  });
}

// --- Real-time snapshot for the frontend HUD --------------------------------

async function billingSnapshot({ meeting_id, user_id }) {
  // Returns: { wall_clock_seconds, billed_seconds, billed_paise, per_minute_paise,
  //            billing_state, mentee_balance_paise, est_seconds_remaining }
  const m = (await query(`SELECT * FROM meetings WHERE id = $1`, [meeting_id])).rows[0];
  if (!m) throw notFound('meeting_not_found');
  const b = (await query(`SELECT * FROM bookings WHERE id = $1`, [m.booking_id])).rows[0];

  if (b.mentor_user_id !== user_id && b.mentee_user_id !== user_id) {
    throw forbidden('not_a_party');
  }

  const rate = b.per_minute_paise_snapshot;
  const now = Date.now();
  const wall_start = new Date(b.slot_start_at).getTime();
  const wall_end = new Date(b.slot_end_at).getTime();
  const wall_clock_seconds = Math.max(0, Math.floor((Math.min(now, wall_end) - wall_start) / 1000));

  // Add open interval if currently active
  let billed_seconds = m.billed_seconds;
  let billed_paise = m.billed_paise;
  if (m.billing_state === 'active' && m.billing_active_since) {
    const delta = Math.floor((now - new Date(m.billing_active_since).getTime()) / 1000);
    if (delta > 0) {
      billed_seconds += delta;
      billed_paise += calcPaise({ seconds: delta, per_minute_paise: rate });
    }
  }

  // Mentee balance (to compute seconds remaining)
  let mentee_balance_paise = 0;
  const wr = await query(`SELECT balance_paise FROM wallets WHERE user_id = $1 AND kind = 'mentee'`, [b.mentee_user_id]);
  if (wr.rows[0]) mentee_balance_paise = wr.rows[0].balance_paise;

  const est_seconds_remaining = rate > 0
    ? Math.max(0, Math.floor((mentee_balance_paise * 60) / rate))
    : null;

  return {
    meeting_uuid: m.uuid,
    booking_uuid: b.uuid,
    billing_state: m.billing_state,
    per_minute_paise: rate,
    wall_clock_seconds,
    wall_clock_max_seconds: Math.floor((wall_end - wall_start) / 1000),
    billed_seconds,
    billed_paise,
    mentee_balance_paise,
    est_seconds_remaining,
  };
}

// --- Cron workers -----------------------------------------------------------

// Auto-finalize any meeting whose slot has ended but billing_state isn't
// 'finalized'. Returns the list of finalized meeting ids.
async function finalizeExpiredMeetings({ now = new Date() } = {}) {
  const r = await query(
    `SELECT m.id
       FROM meetings m
       JOIN bookings b ON b.id = m.booking_id
      WHERE m.billing_state <> 'finalized'
        AND b.slot_end_at <= $1`,
    [now.toISOString()]
  );
  const finalized = [];
  for (const row of r.rows) {
    try {
      await finalizeMeeting({ meeting_id: row.id, end_reason: 'slot_expired' });
      finalized.push(row.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[billing] finalize failed for meeting', row.id, err.message);
    }
  }
  return { finalized };
}

// Auto-finalize any active meeting whose projected cost has exceeded the
// mentee's wallet balance. (No grace period for phase 7 — the in-call topup
// experience lands in phase 7.5.)
async function enforceBalanceLimits() {
  // Pull meetings currently billing
  const r = await query(
    `SELECT m.id, m.billing_active_since, m.billed_paise,
            b.per_minute_paise_snapshot, b.mentee_user_id,
            (SELECT balance_paise FROM wallets WHERE user_id = b.mentee_user_id AND kind = 'mentee') AS bal
       FROM meetings m
       JOIN bookings b ON b.id = m.booking_id
      WHERE m.billing_state = 'active'`
  );
  const finalized = [];
  for (const row of r.rows) {
    const elapsed = Math.floor((Date.now() - new Date(row.billing_active_since).getTime()) / 1000);
    const projected = row.billed_paise + calcPaise({ seconds: elapsed, per_minute_paise: row.per_minute_paise_snapshot });
    if (projected >= (row.bal || 0)) {
      try {
        await finalizeMeeting({ meeting_id: row.id, end_reason: 'balance_depleted' });
        finalized.push(row.id);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[billing] balance cutoff failed for meeting', row.id, err.message);
      }
    }
  }
  return { finalized };
}

module.exports = {
  rollIntoBilled,
  startActiveClock,
  finalizeMeeting,
  finalizeExpiredMeetings,
  enforceBalanceLimits,
  billingSnapshot,
  calcPaise,
  FIVE_MIN_SECONDS,
  PLATFORM_FEE_BPS,
  MENTOR_SHARE_BPS,
};
