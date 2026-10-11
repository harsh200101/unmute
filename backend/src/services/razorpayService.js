'use strict';

// Razorpay Standard Web Checkout provider.
//
// Unlike PhonePe (which redirects the browser and settles via a webhook),
// Razorpay's Standard Checkout runs in a modal on the frontend. The flow is:
//   1. This service creates an order server-side (createOrder).
//   2. The browser opens Checkout.js with that order id + KEY_ID.
//   3. On success the browser receives (order_id, payment_id, signature) and
//      POSTs them to /api/payments/razorpay/verify.
//   4. verifyPaymentSignature() re-derives the HMAC server-side; only a match
//      may credit the wallet.
//
// KEY_SECRET stays here. It is used both for the Basic-auth call to Razorpay's
// API and as the HMAC key for signature verification. It is never returned to
// a client.

const crypto = require('crypto');
const env = require('../config/env');
const { AppError, bad, unauthorized } = require('../utils/errors');

const RAZORPAY_API = 'https://api.razorpay.com/v1';

function isConfigured() {
  return !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

function generateReceipt() {
  // Razorpay caps `receipt` at 40 chars. Keep the same shape as the PhonePe
  // order id (`unmute_<epoch_ms>_<hex>`) so logs read consistently.
  return `unmute_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function authHeader() {
  return (
    'Basic ' +
    Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')
  );
}

// --- Create order ------------------------------------------------------------

async function createOrder({ amount_paise, receipt, notes }) {
  if (!Number.isInteger(amount_paise) || amount_paise < 100) {
    // Razorpay's own floor is 100 paise (₹1).
    throw bad('amount_too_small', 'Razorpay requires an amount of at least 100 paise');
  }

  // Tests must never hit the network. Return a deterministic stub order so the
  // top-up endpoint can be exercised without live credentials.
  if (env.NODE_ENV === 'test') {
    return {
      id: `order_stub_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      amount: amount_paise,
      currency: 'INR',
      receipt,
    };
  }

  if (!isConfigured()) {
    throw bad(
      'razorpay_not_configured',
      'Razorpay is selected (PAYMENT_GATEWAY=razorpay) but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set'
    );
  }

  const resp = await fetch(`${RAZORPAY_API}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      amount: amount_paise,
      currency: 'INR',
      receipt: receipt || generateReceipt(),
      notes: notes || {},
    }),
  });

  const json = await resp.json().catch(() => ({}));

  if (resp.status === 401 || resp.status === 403) {
    throw unauthorized(
      'razorpay_auth_failed',
      json?.error?.description || 'Razorpay rejected the API credentials'
    );
  }
  if (!resp.ok || !json.id) {
    throw new AppError(
      500,
      'razorpay_order_failed',
      json?.error?.description || `Razorpay order creation failed (HTTP ${resp.status})`
    );
  }

  return {
    id: json.id,
    amount: json.amount,
    currency: json.currency,
    receipt: json.receipt,
  };
}

// --- Verify payment signature ------------------------------------------------

// Razorpay signs `order_id + "|" + payment_id` with HMAC-SHA256 using
// KEY_SECRET. Recompute it and compare in constant time. A mismatch means the
// payload was forged or tampered with and must NOT credit the wallet.
function verifyPaymentSignature({ order_id, payment_id, signature }) {
  if (!env.RAZORPAY_KEY_SECRET) {
    throw bad('razorpay_not_configured', 'RAZORPAY_KEY_SECRET is not set');
  }
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${order_id}|${payment_id}`)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { isConfigured, generateReceipt, createOrder, verifyPaymentSignature };
