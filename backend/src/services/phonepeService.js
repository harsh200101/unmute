'use strict';

// Provider abstraction. Real PhonePe integration is feature-gated behind
// PHONEPE_MERCHANT_ID + PHONEPE_SALT_KEY + PHONEPE_HOST env vars.
// In dev / test / when not configured, we use the `stub` provider which:
//   - returns a deterministic local "redirect" URL on initiate
//   - accepts webhook payloads without signature verification
//
// Once real PhonePe creds are available, swap PROVIDER to 'phonepe' and the
// real impl is plumbed in below.

const crypto = require('crypto');
const env = require('../config/env');
const { unauthorized, bad } = require('../utils/errors');

function isConfigured() {
  // In the test environment, always pretend PhonePe isn't configured so
  // unit tests get deterministic stub responses regardless of what's in .env.
  if (env.NODE_ENV === 'test') return false;
  return !!(env.PHONEPE_MERCHANT_ID && env.PHONEPE_SALT_KEY && env.PHONEPE_HOST);
}

// PhonePe order id: prefix + uuid-ish. They have a strict char set; this is safe.
function generateOrderId() {
  return `unmute_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

// --- Initiate top-up ---------------------------------------------------------

async function initiateTopup({ amount_paise, user_id }) {
  const gateway_order_id = generateOrderId();

  if (!isConfigured()) {
    return {
      provider: 'stub',
      gateway_order_id,
      redirect_url: `${env.FRONTEND_URL}/dev/phonepe-stub?order=${gateway_order_id}&amount=${amount_paise}`,
      raw_request: { stub: true, amount_paise, user_id },
      raw_response: { stub_redirect: true },
    };
  }

  // --- Real PhonePe (PG Standard Checkout) -----------------------------------
  // Reference: https://developer.phonepe.com/v1/reference/pay-api
  // Payload shape (simplified):
  // {
  //   merchantId, merchantTransactionId, merchantUserId, amount, redirectUrl,
  //   redirectMode, callbackUrl, mobileNumber?, paymentInstrument: { type: 'PAY_PAGE' }
  // }
  const payload = {
    merchantId: env.PHONEPE_MERCHANT_ID,
    merchantTransactionId: gateway_order_id,
    merchantUserId: `u_${user_id}`,
    amount: amount_paise,
    redirectUrl: `${env.FRONTEND_URL}/wallet?topup=${gateway_order_id}`,
    redirectMode: 'POST',
    callbackUrl: `${env.FRONTEND_URL.replace(/^https?:\/\//, env.NODE_ENV === 'production' ? 'https://api.' : 'http://')}/api/webhooks/phonepe`,
    paymentInstrument: { type: 'PAY_PAGE' },
  };
  const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const path = '/pg/v1/pay';
  const xVerify = crypto
    .createHash('sha256')
    .update(base64 + path + env.PHONEPE_SALT_KEY)
    .digest('hex') + '###' + env.PHONEPE_SALT_INDEX;

  const url = env.PHONEPE_HOST + path;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': xVerify,
      Accept: 'application/json',
    },
    body: JSON.stringify({ request: base64 }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.success) {
    throw bad('phonepe_initiate_failed', json.message || `PhonePe initiate failed (HTTP ${resp.status})`);
  }
  const redirect_url = json?.data?.instrumentResponse?.redirectInfo?.url;
  if (!redirect_url) throw bad('phonepe_missing_redirect', 'PhonePe returned no redirect URL');

  return {
    provider: 'phonepe',
    gateway_order_id,
    redirect_url,
    raw_request: payload,
    raw_response: json,
  };
}

// --- Verify webhook ----------------------------------------------------------

// PhonePe webhook payload: { response: base64(JSON) } with X-VERIFY header.
// We decode + verify the X-VERIFY signature, then return the inner JSON.
function verifyWebhook({ headers, body }) {
  if (!isConfigured()) {
    // Stub mode: accept the body as-is. Used in tests + dev.
    return { ok: true, payload: body, stub: true };
  }

  const xVerify = headers['x-verify'] || headers['X-VERIFY'];
  if (!xVerify) throw unauthorized('missing_x_verify');

  const responseB64 = body?.response;
  if (!responseB64) throw bad('missing_response');

  const expected =
    crypto.createHash('sha256').update(responseB64 + env.PHONEPE_SALT_KEY).digest('hex') +
    '###' +
    env.PHONEPE_SALT_INDEX;

  if (expected !== xVerify) throw unauthorized('bad_signature');

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(responseB64, 'base64').toString('utf8'));
  } catch (_) {
    throw bad('invalid_payload');
  }
  return { ok: true, payload: decoded, stub: false };
}

module.exports = { isConfigured, generateOrderId, initiateTopup, verifyWebhook };
