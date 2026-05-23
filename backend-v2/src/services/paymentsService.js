'use strict';

const { query, withTransaction } = require('../config/db');
const { bad, notFound } = require('../utils/errors');
const phonepe = require('./phonepeService');
const notify = require('./notificationService');

const MIN_TOPUP_PAISE = 5000;      // ₹50
const MAX_TOPUP_PAISE = 50000000;  // ₹5,00,000 hard cap to prevent fat-fingers

// --- Top-up initiation -------------------------------------------------------

async function createTopup({ user_id, amount_paise }) {
  const n = Number(amount_paise);
  if (!Number.isInteger(n)) throw bad('invalid_amount', 'amount_paise must be an integer');
  if (n < MIN_TOPUP_PAISE) throw bad('amount_too_small', `Minimum top-up is ${MIN_TOPUP_PAISE / 100} INR`);
  if (n > MAX_TOPUP_PAISE) throw bad('amount_too_large', `Maximum top-up is ${MAX_TOPUP_PAISE / 100} INR`);

  const init = await phonepe.initiateTopup({ amount_paise: n, user_id });

  // Persist the payment row in 'created' state. Webhook will flip to succeeded.
  const r = await query(
    `INSERT INTO payments
       (user_id, amount_paise, gateway, gateway_order_id, status, raw_request, raw_response)
     VALUES ($1, $2, $3, $4, 'created', $5, $6)
     RETURNING *`,
    [
      user_id,
      n,
      init.provider,
      init.gateway_order_id,
      init.raw_request || {},
      init.raw_response || {},
    ]
  );
  return {
    payment: publicPayment(r.rows[0]),
    redirect_url: init.redirect_url,
    provider: init.provider,
  };
}

// --- Webhook handler ---------------------------------------------------------

// PhonePe's webhook payload (real or stub) ultimately tells us:
//   - which merchantTransactionId (= our gateway_order_id) just settled
//   - the PhonePe txn id (transactionId)
//   - the final state (PAYMENT_SUCCESS, PAYMENT_ERROR, etc.)
async function handleWebhook({ headers, body }) {
  const v = phonepe.verifyWebhook({ headers, body });
  // The interesting shape sits at v.payload.data — accept either shape because
  // the stub may pass an already-flat object.
  const data = v.payload?.data || v.payload || {};
  const gateway_order_id = data.merchantTransactionId || body?.merchantTransactionId;
  const gateway_txn_id = data.transactionId || body?.transactionId || null;
  const state = data.state || body?.state || (data.code === 'PAYMENT_SUCCESS' ? 'COMPLETED' : null);
  const amount_paise = data.amount || body?.amount;

  if (!gateway_order_id) throw bad('webhook_missing_order_id');

  return withTransaction(async (client) => {
    const pr = await client.query(
      `SELECT * FROM payments WHERE gateway_order_id = $1 FOR UPDATE`,
      [gateway_order_id]
    );
    const payment = pr.rows[0];
    if (!payment) throw notFound('payment_not_found');

    // Idempotency: if already settled, return ok without re-applying.
    if (payment.status === 'succeeded') {
      return { ok: true, idempotent: true, payment: publicPayment(payment) };
    }
    if (payment.status === 'failed') {
      return { ok: true, idempotent: true, payment: publicPayment(payment) };
    }

    const succeeded =
      state === 'PAYMENT_SUCCESS' ||
      state === 'COMPLETED' ||
      state === 'SUCCEEDED' ||
      body?.success === true;

    if (!succeeded) {
      const up = await client.query(
        `UPDATE payments
            SET status = 'failed',
                failure_reason = $1,
                gateway_txn_id = COALESCE(gateway_txn_id, $2),
                webhook_payload = $3,
                updated_at = NOW()
          WHERE id = $4
          RETURNING *`,
        [data.responseCode || data.code || 'unknown', gateway_txn_id, body, payment.id]
      );
      return { ok: true, payment: publicPayment(up.rows[0]) };
    }

    // Validate the amount the gateway reports against what we created the
    // payment for. PhonePe sends the amount in paise too — if they don't
    // match, we refuse to credit (would indicate tampering).
    if (typeof amount_paise === 'number' && amount_paise !== payment.amount_paise) {
      throw bad('amount_mismatch', `Webhook amount ${amount_paise} != payment ${payment.amount_paise}`);
    }

    // Mark the payment as succeeded
    const up = await client.query(
      `UPDATE payments
          SET status = 'succeeded',
              gateway_txn_id = COALESCE(gateway_txn_id, $1),
              succeeded_at = NOW(),
              webhook_payload = $2,
              updated_at = NOW()
        WHERE id = $3
        RETURNING *`,
      [gateway_txn_id, body, payment.id]
    );

    // Find the mentee wallet
    const w = await client.query(
      `SELECT id FROM wallets WHERE user_id = $1 AND kind = 'mentee'`,
      [payment.user_id]
    );
    if (!w.rows[0]) throw new Error(`No mentee wallet for user ${payment.user_id}`);
    const wallet_id = w.rows[0].id;

    // Idempotent credit: idempotency_key = payment.gateway_order_id. A second
    // webhook attempt would hit UNIQUE on idempotency_key and we'd swallow it.
    try {
      await client.query(
        `INSERT INTO wallet_transactions
           (wallet_id, direction, amount_paise, reason,
            reference_table, reference_id, idempotency_key, description, balance_after_paise)
         VALUES ($1, 'credit', $2, 'topup', 'payments', $3, $4, $5, 0)`,
        [
          wallet_id,
          payment.amount_paise,
          payment.id,
          `topup:${payment.gateway_order_id}`,
          `PhonePe top-up ${payment.gateway_order_id}`,
        ]
      );
    } catch (err) {
      if (err.code === '23505') {
        // Already credited (idempotent retry); ignore.
      } else {
        throw err;
      }
    }

    // Clear any pending_penalty_paise: debit mentee wallet up to
    // min(new_balance, pending_penalty) and credit the platform wallet
    // (reimbursing it for any gap previously fronted on late-cancel).
    const userR = await client.query(
      `SELECT pending_penalty_paise FROM users WHERE id = $1 FOR UPDATE`,
      [payment.user_id]
    );
    const pending = userR.rows[0].pending_penalty_paise;
    if (pending > 0) {
      const balR = await client.query(`SELECT balance_paise FROM wallets WHERE id = $1`, [wallet_id]);
      const clearable = Math.min(pending, balR.rows[0].balance_paise);
      if (clearable > 0) {
        await client.query(
          `INSERT INTO wallet_transactions
             (wallet_id, direction, amount_paise, reason,
              reference_table, reference_id, description, balance_after_paise)
           VALUES ($1, 'debit', $2, 'late_cancel_penalty', 'payments', $3, $4, 0)`,
          [wallet_id, clearable, payment.id, `Clearing pending late-cancel penalty from topup`]
        );
        // Reimburse platform wallet
        const platR = await client.query(`SELECT id FROM wallets WHERE kind = 'platform' LIMIT 1`);
        if (platR.rows[0]) {
          await client.query(
            `INSERT INTO wallet_transactions
               (wallet_id, direction, amount_paise, reason,
                reference_table, reference_id, description, balance_after_paise)
             VALUES ($1, 'credit', $2, 'late_cancel_penalty', 'payments', $3, $4, 0)`,
            [platR.rows[0].id, clearable, payment.id, `Recovered late-cancel penalty from user topup`]
          );
        }
        await client.query(
          `UPDATE users SET pending_penalty_paise = pending_penalty_paise - $1 WHERE id = $2`,
          [clearable, payment.user_id]
        );
      }
    }

    await notify.notify({
      client,
      user_id: payment.user_id,
      kind: 'topup_succeeded',
      title: `Top-up of ₹${(payment.amount_paise / 100).toFixed(2)} added to your wallet`,
      link_url: '/wallet',
      reference_table: 'payments',
      reference_id: payment.id,
    });

    return { ok: true, payment: publicPayment(up.rows[0]) };
  });
}

async function getPaymentByOrderId({ user_id, gateway_order_id }) {
  const r = await query(
    `SELECT * FROM payments WHERE gateway_order_id = $1 AND user_id = $2`,
    [gateway_order_id, user_id]
  );
  if (!r.rows[0]) throw notFound('payment_not_found');
  return publicPayment(r.rows[0]);
}

async function listMyPayments({ user_id, limit = 50, offset = 0 }) {
  const limitN = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);
  const r = await query(
    `SELECT * FROM payments WHERE user_id = $1
      ORDER BY created_at DESC LIMIT ${limitN} OFFSET ${offsetN}`,
    [user_id]
  );
  return { items: r.rows.map(publicPayment), limit: limitN, offset: offsetN };
}

function publicPayment(p) {
  return {
    uuid: p.uuid,
    amount_paise: p.amount_paise,
    gateway: p.gateway,
    gateway_order_id: p.gateway_order_id,
    gateway_txn_id: p.gateway_txn_id,
    status: p.status,
    failure_reason: p.failure_reason,
    created_at: p.created_at,
    succeeded_at: p.succeeded_at,
  };
}

module.exports = {
  createTopup,
  handleWebhook,
  getPaymentByOrderId,
  listMyPayments,
  MIN_TOPUP_PAISE,
  MAX_TOPUP_PAISE,
};
