'use strict';

const { query, withTransaction } = require('../config/db');
const { bad, conflict, notFound, forbidden } = require('../utils/errors');
const kycService = require('./kycService');
const notify = require('./notificationService');

const MIN_PAYOUT_PAISE = 50000; // ₹500 — matches the CHECK in 001_init.sql

// --- Mentor: request a withdrawal ------------------------------------------

async function request({ user_id, amount_paise }) {
  const amt = Number(amount_paise);
  if (!Number.isInteger(amt) || amt <= 0) throw bad('invalid_amount');
  if (amt < MIN_PAYOUT_PAISE) {
    throw bad('amount_too_small', `Minimum withdrawal is ₹${MIN_PAYOUT_PAISE / 100}`);
  }

  const kyc = await kycService.getApprovedForMentor(user_id);
  if (!kyc) throw forbidden('kyc_required', 'Approved KYC is required before withdrawing');

  return withTransaction(async (client) => {
    // Lock mentor wallet
    const w = (await client.query(
      `SELECT id, balance_paise FROM wallets WHERE user_id = $1 AND kind = 'mentor' FOR UPDATE`,
      [user_id]
    )).rows[0];
    if (!w) throw notFound('mentor_wallet_not_found');
    if (w.balance_paise < amt) {
      throw bad('insufficient_balance', `You have ₹${(w.balance_paise / 100).toFixed(2)} available`);
    }

    // Create the withdrawal request
    const wd = (await client.query(
      `INSERT INTO withdrawals (mentor_user_id, amount_paise, status)
       VALUES ($1, $2, 'pending') RETURNING *`,
      [user_id, amt]
    )).rows[0];

    // Debit the mentor wallet now (escrow). On failure we issue a reversal credit.
    await client.query(
      `INSERT INTO wallet_transactions
         (wallet_id, direction, amount_paise, reason,
          reference_table, reference_id, idempotency_key, description, balance_after_paise)
       VALUES ($1, 'debit', $2, 'withdrawal', 'withdrawals', $3, $4, $5, 0)`,
      [w.id, amt, wd.id, `withdrawal:${wd.uuid}`, `Withdrawal request ${wd.uuid}`]
    );

    return publicWithdrawal(wd);
  });
}

async function listMine({ user_id, limit = 50, offset = 0 }) {
  const limitN = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);
  const r = await query(
    `SELECT * FROM withdrawals
      WHERE mentor_user_id = $1
      ORDER BY requested_at DESC
      LIMIT ${limitN} OFFSET ${offsetN}`,
    [user_id]
  );
  return { items: r.rows.map(publicWithdrawal), limit: limitN, offset: offsetN };
}

// --- Admin: list / process / complete / fail -------------------------------

async function adminList({ status, limit = 50, offset = 0 }) {
  const limitN = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = `WHERE w.status = $${params.length}`;
  }
  const r = await query(
    `SELECT w.*, u.email, u.full_name
       FROM withdrawals w
       JOIN users u ON u.id = w.mentor_user_id
       ${where}
      ORDER BY w.requested_at ASC
      LIMIT ${limitN} OFFSET ${offsetN}`,
    params
  );
  return {
    items: r.rows.map((row) => ({
      ...publicWithdrawal(row),
      id: row.id,              // admin needs numeric id to call action endpoints
      email: row.email,
      full_name: row.full_name,
    })),
    limit: limitN, offset: offsetN,
  };
}

async function process({ admin_user_id, withdrawal_id, gateway_txn_id }) {
  return withTransaction(async (client) => {
    const before = (await client.query(`SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE`, [withdrawal_id])).rows[0];
    if (!before) throw notFound('withdrawal_not_found');
    if (before.status !== 'pending') throw bad('invalid_state', `Withdrawal is ${before.status}`);

    const after = (await client.query(
      `UPDATE withdrawals SET status = 'processing', gateway_txn_id = $1 WHERE id = $2 RETURNING *`,
      [gateway_txn_id || null, withdrawal_id]
    )).rows[0];

    await audit(client, admin_user_id, 'withdrawal_process', withdrawal_id, before, after);
    return publicWithdrawal(after);
  });
}

async function complete({ admin_user_id, withdrawal_id, gateway_txn_id }) {
  return withTransaction(async (client) => {
    const before = (await client.query(`SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE`, [withdrawal_id])).rows[0];
    if (!before) throw notFound('withdrawal_not_found');
    if (!['pending', 'processing'].includes(before.status)) {
      throw bad('invalid_state', `Withdrawal is ${before.status}`);
    }

    const after = (await client.query(
      `UPDATE withdrawals
          SET status = 'succeeded',
              processed_at = NOW(),
              gateway_txn_id = COALESCE($1, gateway_txn_id)
        WHERE id = $2
        RETURNING *`,
      [gateway_txn_id || null, withdrawal_id]
    )).rows[0];

    await audit(client, admin_user_id, 'withdrawal_complete', withdrawal_id, before, after);

    await notify.notify({
      client,
      user_id: before.mentor_user_id,
      kind: 'withdrawal_succeeded',
      title: `Withdrawal of ₹${(before.amount_paise / 100).toFixed(2)} sent to your bank`,
      body: gateway_txn_id ? `Transaction ID: ${gateway_txn_id}` : null,
      link_url: '/mentor/earnings',
      send_email: true,
      reference_table: 'withdrawals',
      reference_id: withdrawal_id,
    });

    return publicWithdrawal(after);
  });
}

async function fail({ admin_user_id, withdrawal_id, failure_reason }) {
  return withTransaction(async (client) => {
    const before = (await client.query(`SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE`, [withdrawal_id])).rows[0];
    if (!before) throw notFound('withdrawal_not_found');
    if (!['pending', 'processing'].includes(before.status)) {
      throw bad('invalid_state', `Withdrawal is ${before.status}`);
    }

    const after = (await client.query(
      `UPDATE withdrawals
          SET status = 'failed',
              failure_reason = $1,
              processed_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [failure_reason || 'unspecified', withdrawal_id]
    )).rows[0];

    // Reverse: credit mentor wallet back the escrowed amount
    const w = (await client.query(
      `SELECT id FROM wallets WHERE user_id = $1 AND kind = 'mentor' FOR UPDATE`,
      [before.mentor_user_id]
    )).rows[0];
    if (w) {
      await client.query(
        `INSERT INTO wallet_transactions
           (wallet_id, direction, amount_paise, reason,
            reference_table, reference_id, idempotency_key, description, balance_after_paise)
         VALUES ($1, 'credit', $2, 'withdrawal_reversal', 'withdrawals', $3, $4, $5, 0)`,
        [w.id, before.amount_paise, withdrawal_id, `withdrawal:${before.uuid}:reversal`,
         `Reversal of failed withdrawal ${before.uuid}`]
      );
    }

    await audit(client, admin_user_id, 'withdrawal_fail', withdrawal_id, before, after, failure_reason);

    await notify.notify({
      client,
      user_id: before.mentor_user_id,
      kind: 'withdrawal_failed',
      title: 'Withdrawal failed — funds returned to your wallet',
      body: failure_reason || null,
      link_url: '/mentor/earnings',
      send_email: true,
      reference_table: 'withdrawals',
      reference_id: withdrawal_id,
    });

    return publicWithdrawal(after);
  });
}

// --- Helpers --------------------------------------------------------------

async function audit(client, admin_user_id, action, target_id, before, after, notes) {
  await client.query(
    `INSERT INTO admin_audit_log
       (admin_user_id, action, target_table, target_id, before_state, after_state, notes)
     VALUES ($1, $2, 'withdrawals', $3, $4, $5, $6)`,
    [admin_user_id, action, target_id, before, after, notes || null]
  );
}

function publicWithdrawal(w) {
  return {
    uuid: w.uuid,
    mentor_user_id: w.mentor_user_id,
    amount_paise: w.amount_paise,
    status: w.status,
    gateway_txn_id: w.gateway_txn_id,
    failure_reason: w.failure_reason,
    requested_at: w.requested_at,
    processed_at: w.processed_at,
  };
}

module.exports = {
  request, listMine, adminList,
  process, complete, fail,
  MIN_PAYOUT_PAISE,
};
