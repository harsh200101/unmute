'use strict';

const { query, withTransaction } = require('../config/db');
const env = require('../config/env');
const { bad, notFound, forbidden } = require('../utils/errors');
const phonepe = require('./phonepeService');
const razorpay = require('./razorpayService');
const notify = require('./notificationService');

const MIN_TOPUP_PAISE = 5000;      // ₹50
const MAX_TOPUP_PAISE = 50000000;  // ₹5,00,000 hard cap to prevent fat-fingers

// The one-click gateway switch (config/env.js PAYMENT_GATEWAY). Both providers
// stay fully wired; this only decides which one initiates a new top-up.
function selectedGateway() {
  return env.PAYMENT_GATEWAY === 'razorpay' ? 'razorpay' : 'phonepe';
}

function gatewayLabel(gateway) {
  if (gateway === 'razorpay') return 'Razorpay';
  if (gateway === 'phonepe') return 'PhonePe';
  return 'Payment gateway';
}

// --- Top-up initiation -------------------------------------------------------

async function createTopup({ user_id, amount_paise, platform }) {
  const n = Number(amount_paise);
  if (!Number.isInteger(n)) throw bad('invalid_amount', 'amount_paise must be an integer');
  if (n < MIN_TOPUP_PAISE) throw bad('amount_too_small', `Minimum top-up is ${MIN_TOPUP_PAISE / 100} INR`);
  if (n > MAX_TOPUP_PAISE) throw bad('amount_too_large', `Maximum top-up is ${MAX_TOPUP_PAISE / 100} INR`);

  return selectedGateway() === 'razorpay'
    ? createRazorpayTopup({ user_id, amount_paise: n })
    : createPhonepeTopup({ user_id, amount_paise: n, platform });
}

// PhonePe: redirect the browser to the gateway, settle later via webhook.
async function createPhonepeTopup({ user_id, amount_paise, platform }) {
  const init = await phonepe.initiateTopup({ amount_paise, user_id, platform });

  // Persist the payment row in 'created' state. Webhook will flip to succeeded.
  const r = await query(
    `INSERT INTO payments
       (user_id, amount_paise, gateway, gateway_order_id, status, raw_request, raw_response)
     VALUES ($1, $2, $3, $4, 'created', $5, $6)
     RETURNING *`,
    [
      user_id,
      amount_paise,
      init.provider,
      init.gateway_order_id,
      init.raw_request || {},
      init.raw_response || {},
    ]
  );
  return {
    payment: publicPayment(r.rows[0]),
    mode: 'redirect',
    redirect_url: init.redirect_url,
    provider: init.provider,
  };
}

// Razorpay: create an order server-side and hand the browser everything it
// needs to open the Checkout modal. KEY_SECRET is never included.
async function createRazorpayTopup({ user_id, amount_paise }) {
  const receipt = razorpay.generateReceipt();
  const order = await razorpay.createOrder({
    amount_paise,
    receipt,
    notes: { user_id: String(user_id) },
  });

  const r = await query(
    `INSERT INTO payments
       (user_id, amount_paise, gateway, gateway_order_id, status, raw_request, raw_response)
     VALUES ($1, $2, 'razorpay', $3, 'created', $4, $5)
     RETURNING *`,
    [
      user_id,
      amount_paise,
      order.id,
      { amount_paise, receipt, user_id },
      order,
    ]
  );

  return {
    payment: publicPayment(r.rows[0]),
    mode: 'checkout',
    provider: 'razorpay',
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    // KEY_ID only — the browser needs it to open Checkout.js.
    key_id: env.RAZORPAY_KEY_ID,
  };
}

// --- Razorpay: verify signature + settle -------------------------------------

async function verifyRazorpayPayment({
  user_id,
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw bad(
      'missing_fields',
      'razorpay_order_id, razorpay_payment_id and razorpay_signature are required'
    );
  }

  const ok = razorpay.verifyPaymentSignature({
    order_id: razorpay_order_id,
    payment_id: razorpay_payment_id,
    signature: razorpay_signature,
  });
  // A forged/tampered payload must never reach the wallet.
  if (!ok) throw bad('signature_mismatch', 'Payment signature verification failed');

  return settlePaymentSuccess({
    gateway_order_id: razorpay_order_id,
    gateway_txn_id: razorpay_payment_id,
    expected_user_id: user_id,
    payload: {
      razorpay_order_id,
      razorpay_payment_id,
      signature_verified: true,
      verified_at: new Date().toISOString(),
    },
  });
}

// --- Webhook handler (PhonePe) -----------------------------------------------

// PhonePe's webhook payload (real or stub) ultimately tells us:
//   - which merchantOrderId / merchantTransactionId (= our gateway_order_id)
//     just settled
//   - the PhonePe txn id (transactionId)
//   - the final state (COMPLETED / PAYMENT_SUCCESS / FAILED, etc.)
//
// V1 wraps everything in { response: base64(data) }; V2 posts plain JSON with
// the useful fields under `payload`, plus an `event` name. Accept both.
async function handleWebhook({ headers, body, rawBody }) {
  const v = phonepe.verifyWebhook({ headers, body, rawBody });
  const envelope = v.payload || {};
  const event = envelope.event || envelope.type || null;
  const data = envelope.payload || envelope.data || envelope;

  const details = Array.isArray(data.paymentDetails) ? data.paymentDetails : [];
  const rootState = String(data.state || '').toUpperCase();
  const chosen =
    details.find((d) => String(d.state || '').toUpperCase() === rootState) ||
    (details.length ? details[details.length - 1] : {});

  const gateway_order_id =
    data.merchantOrderId ||
    data.merchantTransactionId ||
    envelope.merchantOrderId ||
    body?.merchantTransactionId;
  const gateway_txn_id =
    chosen.transactionId || data.transactionId || body?.transactionId || null;
  const state =
    data.state ||
    chosen.state ||
    body?.state ||
    (data.code === 'PAYMENT_SUCCESS' ? 'COMPLETED' : null);
  const amount = data.amount ?? chosen.amount ?? body?.amount;
  const amount_paise =
    amount != null && Number.isFinite(Number(amount)) ? Number(amount) : undefined;

  // Refund lifecycle events do not move the wallet; a top-up refund would be
  // handled by a dedicated flow. Ignoring beats marking a settled payment as
  // failed (which would imply the top-up never happened). Some refund payloads
  // omit `event` entirely, so also detect the refundId.
  const isRefund =
    (event && /refund/i.test(String(event))) ||
    Boolean(data.refundId || envelope.refundId);
  if (isRefund) {
    return { ok: true, ignored: true, event: event || 'refund' };
  }

  if (!gateway_order_id) throw bad('webhook_missing_order_id');

  const normalizedState = String(state || '').toUpperCase();
  const succeeded =
    normalizedState === 'PAYMENT_SUCCESS' ||
    normalizedState === 'COMPLETED' ||
    normalizedState === 'SUCCEEDED' ||
    event === 'checkout.order.completed' ||
    body?.success === true;

  if (!succeeded) {
    return markPaymentFailed({
      gateway_order_id,
      reason:
        chosen.errorCode || data.errorCode || data.responseCode || data.code || event || 'unknown',
      gateway_txn_id,
      payload: v.payload,
    });
  }

  return settlePaymentSuccess({
    gateway_order_id,
    gateway_txn_id,
    amount_paise,
    payload: v.payload,
  });
}

// --- Active reconciliation ---------------------------------------------------
//
// Webhooks are best-effort: PhonePe retries, but a deploy can be down, a
// firewall can drop the callback, or the dashboard URL can be wrong. Polling
// the order status closes that gap and is what PhonePe's own go-live checklist
// asks for. It is idempotent because settlement uses the payments row lock and
// a UNIQUE wallet idempotency key.

async function syncPhonepePayment({ gateway_order_id }) {
  if (!phonepe.isConfigured()) return { ok: false, skipped: 'not_configured' };

  const r = await query(`SELECT * FROM payments WHERE gateway_order_id = $1`, [gateway_order_id]);
  const payment = r.rows[0];
  if (!payment) throw notFound('payment_not_found');
  if (payment.gateway !== 'phonepe') return { ok: false, skipped: 'not_phonepe' };
  if (payment.status === 'succeeded' || payment.status === 'failed') {
    return { ok: true, idempotent: true, payment: publicPayment(payment) };
  }

  const st = await phonepe.fetchOrderStatus({ gateway_order_id });
  const state = String(st.state || '').toUpperCase();

  if (state === 'COMPLETED' || state === 'SUCCESS' || state === 'PAYMENT_SUCCESS') {
    return settlePaymentSuccess({
      gateway_order_id,
      gateway_txn_id: st.gateway_txn_id,
      amount_paise: st.amount_paise == null ? undefined : st.amount_paise,
      payload: st.raw,
    });
  }

  if (['FAILED', 'ERROR', 'CANCELLED', 'EXPIRED'].includes(state)) {
    return markPaymentFailed({
      gateway_order_id,
      reason: st.failure_reason || state.toLowerCase(),
      gateway_txn_id: st.gateway_txn_id,
      payload: st.raw,
    });
  }

  // Still PENDING: record that we reached the gateway so the UI can tell
  // "awaiting confirmation" apart from "never opened checkout".
  if (payment.status === 'created') {
    const up = await query(
      `UPDATE payments
          SET status = 'pending',
              raw_response = COALESCE(raw_response, '{}'::jsonb) || $2::jsonb,
              updated_at = NOW()
        WHERE id = $1 AND status = 'created'
        RETURNING *`,
      [payment.id, st.raw || {}]
    );
    if (up.rows[0]) return { ok: true, pending: true, payment: publicPayment(up.rows[0]) };
  }

  return { ok: true, pending: true, payment: publicPayment(payment) };
}

async function reconcilePendingPhonepePayments({ limit = 100, minAgeSeconds = 20 } = {}) {
  if (!phonepe.isConfigured()) return { checked: 0, skipped: 'not_configured' };

  const r = await query(
    `SELECT gateway_order_id FROM payments
      WHERE gateway = 'phonepe'
        AND status IN ('created','pending')
        AND created_at < NOW() - ($1 || ' seconds')::interval
      ORDER BY created_at ASC
      LIMIT $2`,
    [String(minAgeSeconds), Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );

  const summary = { checked: r.rows.length, settled: 0, failed: 0, pending: 0, errors: 0 };
  for (const row of r.rows) {
    try {
      const out = await syncPhonepePayment({ gateway_order_id: row.gateway_order_id });
      if (out?.payment?.status === 'succeeded') summary.settled += 1;
      else if (out?.payment?.status === 'failed') summary.failed += 1;
      else summary.pending += 1;
    } catch (err) {
      summary.errors += 1;
      // eslint-disable-next-line no-console
      console.warn(`[payments] reconcile failed for ${row.gateway_order_id}: ${err.message}`);
    }
  }
  return summary;
}

// --- Shared settlement (used by PhonePe webhook + Razorpay verify) -----------

// Flip a payment to 'failed'. Idempotent: an already-terminal row is returned
// untouched, so a late replay cannot undo a success.
async function markPaymentFailed({ gateway_order_id, reason, gateway_txn_id = null, payload = null }) {
  return withTransaction(async (client) => {
    const pr = await client.query(
      `SELECT * FROM payments WHERE gateway_order_id = $1 FOR UPDATE`,
      [gateway_order_id]
    );
    const payment = pr.rows[0];
    if (!payment) throw notFound('payment_not_found');

    if (payment.status === 'succeeded' || payment.status === 'failed') {
      return { ok: true, idempotent: true, payment: publicPayment(payment) };
    }

    const up = await client.query(
      `UPDATE payments
          SET status = 'failed',
              failure_reason = $1,
              gateway_txn_id = COALESCE(gateway_txn_id, $2),
              webhook_payload = $3,
              updated_at = NOW()
        WHERE id = $4
        RETURNING *`,
      [reason, gateway_txn_id, payload, payment.id]
    );
    return { ok: true, payment: publicPayment(up.rows[0]) };
  });
}

// Mark a payment succeeded and credit the mentee wallet, exactly once.
async function settlePaymentSuccess({
  gateway_order_id,
  gateway_txn_id = null,
  amount_paise,
  payload = null,
  expected_user_id = null,
}) {
  return withTransaction(async (client) => {
    const pr = await client.query(
      `SELECT * FROM payments WHERE gateway_order_id = $1 FOR UPDATE`,
      [gateway_order_id]
    );
    const payment = pr.rows[0];
    if (!payment) throw notFound('payment_not_found');

    // The verify endpoint is authenticated; refuse to settle an order that does
    // not belong to the caller.
    if (expected_user_id != null && payment.user_id !== expected_user_id) {
      throw forbidden('payment_not_owned', 'This payment does not belong to you');
    }

    // Idempotency: if already settled, return ok without re-applying.
    if (payment.status === 'succeeded') {
      return { ok: true, idempotent: true, payment: publicPayment(payment) };
    }
    if (payment.status === 'failed') {
      return { ok: true, idempotent: true, payment: publicPayment(payment) };
    }

    // Validate the amount the gateway reports against what we created the
    // payment for. Providers send the amount in paise — if they don't match, we
    // refuse to credit (would indicate tampering). Razorpay's verify call has no
    // amount, so it passes undefined and this check is skipped.
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
      [gateway_txn_id, payload, payment.id]
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
          `${gatewayLabel(payment.gateway)} top-up ${payment.gateway_order_id}`,
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
      send_email: true,
      reference_table: 'payments',
      reference_id: payment.id,
    });

    return { ok: true, payment: publicPayment(up.rows[0]) };
  });
}

// --- Status / history --------------------------------------------------------

// PhonePe shows a countdown on its checkout page. If the user lets it run out,
// closes the tab, or hits back, PhonePe never fires a webhook, so the row sits
// in 'created' forever and the wallet never learns the checkout was abandoned.
// Fifteen minutes is comfortably past PhonePe's own timer while still short
// enough that a user who comes back to a stale tab gets a real answer.
// Overridable via CHECKOUT_TTL_MINUTES so this branch can be exercised without
// waiting a quarter of an hour; the floor is enforced in config/env.js.
const CHECKOUT_TTL_MINUTES = env.CHECKOUT_TTL_MINUTES;

function isStaleCheckout(payment) {
  if (payment.status !== 'created' && payment.status !== 'pending') return false;
  // If we cannot date the row we cannot claim the window closed. Saying
  // 'expired' would assert "nothing was charged" on a guess; leaving it as
  // 'created' makes the caller fall through to its own give-up path, which
  // only claims that we stopped waiting.
  if (!payment.created_at) return false;
  const created = new Date(payment.created_at).getTime();
  if (!Number.isFinite(created)) return false;
  return Date.now() - created > CHECKOUT_TTL_MINUTES * 60_000;
}

async function getPaymentByOrderId({ user_id, gateway_order_id }) {
  const r = await query(
    `SELECT * FROM payments WHERE gateway_order_id = $1 AND user_id = $2`,
    [gateway_order_id, user_id]
  );
  const payment = r.rows[0];
  if (!payment) throw notFound('payment_not_found');

  // Ask PhonePe directly while the payment is still open. This covers a missed
  // webhook: the browser returns to /wallet and polls, and the real state is
  // fetched instead of waiting for a callback that may never arrive.
  let effective = payment;
  if (
    payment.gateway === 'phonepe' &&
    (payment.status === 'created' || payment.status === 'pending') &&
    phonepe.isConfigured()
  ) {
    try {
      const synced = await syncPhonepePayment({ gateway_order_id });
      if (synced?.payment) {
        if (synced.payment.status === 'succeeded' || synced.payment.status === 'failed') {
          return synced.payment;
        }
        effective = { ...payment, status: synced.payment.status };
      }
    } catch (err) {
      // A gateway hiccup must not break the status endpoint; fall back to the
      // last stored state and let reconciliation retry.
      // eslint-disable-next-line no-console
      console.warn(`[payments] status sync failed for ${gateway_order_id}: ${err.message}`);
    }
  }

  // Report 'expired' to the caller WITHOUT writing it to the row.
  //
  // This is deliberately not an UPDATE to 'failed'. settlePaymentSuccess()
  // treats 'failed' as terminal and returns early without crediting, so eagerly
  // failing a stale order would silently swallow a real payment from a user
  // who completed checkout just after the window appeared to close. That is
  // money taken and not credited. The row also stays 'created'/'pending'
  // because the webhook may still arrive at any point and must be allowed to
  // settle it. A cleanup job can expire these later, once it can also check
  // the gateway for a terminal state first.
  if (isStaleCheckout(effective)) {
    return { ...publicPayment(effective), status: 'expired', failure_reason: 'checkout_expired' };
  }
  return publicPayment(effective);
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
  verifyRazorpayPayment,
  handleWebhook,
  syncPhonepePayment,
  reconcilePendingPhonepePayments,
  getPaymentByOrderId,
  listMyPayments,
  MIN_TOPUP_PAISE,
  MAX_TOPUP_PAISE,
};
