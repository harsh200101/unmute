'use strict';

// PhonePe Payment Gateway provider.
//
// Two API generations are supported:
//   v2 (current) — OAuth client credentials + /checkout/v2/pay. Preferred.
//   v1 (legacy)  — merchant id + salt key + /pg/v1/pay. Kept so old deploys
//                  keep working, but PhonePe has deprecated it.
//
// V2 wins whenever PHONEPE_CLIENT_ID / PHONEPE_CLIENT_SECRET /
// PHONEPE_CLIENT_VERSION are present.
//
// Stub mode exists ONLY for the test suite and local development. It is never
// allowed to run implicitly: a fake success means a user believes they topped
// up while no money moved. In any non-test environment a missing configuration
// makes initiateTopup throw instead of inventing a redirect.

const crypto = require('crypto');
const env = require('../config/env');
const { unauthorized, bad } = require('../utils/errors');

const AUTH_REFRESH_SKEW_MS = 5 * 60_000;
const DEFAULT_TOKEN_TTL_MS = 15 * 60_000;

let tokenCache = { token: '', expiresAt: 0 };

function isV2Configured() {
  return Boolean(
    env.PHONEPE_CLIENT_ID && env.PHONEPE_CLIENT_SECRET && env.PHONEPE_CLIENT_VERSION
  );
}

function isV1Configured() {
  return Boolean(env.PHONEPE_MERCHANT_ID && env.PHONEPE_SALT_KEY && env.PHONEPE_HOST);
}

function apiVersion() {
  if (isV2Configured()) return 'v2';
  if (isV1Configured()) return 'v1';
  return null;
}

function isConfigured() {
  // Tests always get the deterministic stub provider, regardless of .env.
  if (env.NODE_ENV === 'test') return false;
  return isV2Configured() || isV1Configured();
}

function allowsStub() {
  return env.NODE_ENV === 'test' || env.PHONEPE_ALLOW_STUB === true;
}

// PhonePe order id: prefix + timestamp + random hex. Their charset allows
// alphanumerics, underscore and hyphen; the total length must stay under 63.
function generateOrderId() {
  return `unmute_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function notConfiguredError() {
  return bad(
    'phonepe_not_configured',
    'PhonePe is not configured. Set PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET and ' +
    'PHONEPE_CLIENT_VERSION in the environment. For local fake payments only, ' +
    'set PHONEPE_ALLOW_STUB=true.'
  );
}

// --- V2 OAuth ---------------------------------------------------------------

async function getAccessToken({ force = false } = {}) {
  const now = Date.now();
  if (!force && tokenCache.token && now < tokenCache.expiresAt - AUTH_REFRESH_SKEW_MS) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    client_id: env.PHONEPE_CLIENT_ID,
    client_version: env.PHONEPE_CLIENT_VERSION,
    client_secret: env.PHONEPE_CLIENT_SECRET,
    grant_type: 'client_credentials',
  }).toString();

  const resp = await fetch(`${env.PHONEPE_AUTH_HOST.replace(/\/$/, '')}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.access_token) {
    throw bad(
      'phonepe_auth_failed',
      json.message || `PhonePe token request failed (HTTP ${resp.status})`
    );
  }

  const expiresAt = Number.isFinite(Number(json.expires_at))
    ? Number(json.expires_at) * 1000
    : Date.now() + (Number(json.expires_in) ? Number(json.expires_in) * 1000 : DEFAULT_TOKEN_TTL_MS);

  tokenCache = { token: json.access_token, expiresAt };
  return tokenCache.token;
}

function resetTokenCache() {
  tokenCache = { token: '', expiresAt: 0 };
}

async function authedFetch(url, options = {}) {
  const doFetch = async (token) =>
    fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `O-Bearer ${token}`,
      },
    });

  let resp = await doFetch(await getAccessToken());
  if (resp.status === 401) {
    resetTokenCache();
    resp = await doFetch(await getAccessToken({ force: true }));
  }
  return resp;
}

// --- V2 initiate ------------------------------------------------------------

async function initiateV2({ amount_paise, user_id, gateway_order_id, platform }) {
  const mobileSuffix = platform === 'mobile' ? '&mobile=1' : '';
  const payload = {
    merchantOrderId: gateway_order_id,
    amount: amount_paise,
    expireAfter: env.PHONEPE_EXPIRE_AFTER_SECONDS,
    paymentFlow: {
      type: 'PG_CHECKOUT',
      merchantUrls: {
        // Frontend route. V2 delivers the browser here after checkout; the
        // actual settlement arrives on the dashboard-configured webhook.
        redirectUrl: `${env.FRONTEND_URL.replace(/\/$/, '')}/wallet?topup=${gateway_order_id}${mobileSuffix}`,
      },
    },
    metaInfo: {
      udf1: `user_${user_id}`,
    },
  };

  const resp = await authedFetch(
    `${env.PHONEPE_API_HOST.replace(/\/$/, '')}/checkout/v2/pay`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.redirectUrl) {
    throw bad(
      'phonepe_initiate_failed',
      json.message || `PhonePe initiate failed (HTTP ${resp.status})`
    );
  }

  return {
    provider: 'phonepe',
    gateway_order_id,
    redirect_url: json.redirectUrl,
    raw_request: payload,
    raw_response: json,
  };
}

// --- V1 initiate (legacy) ---------------------------------------------------

async function initiateV1({ amount_paise, user_id, gateway_order_id, platform }) {
  // callbackUrl is PhonePe's server-to-server webhook and must point at THIS
  // service. It is not derivable from FRONTEND_URL: the old
  // FRONTEND_URL.replace(/^https?/, 'https://api.') rewrite produced a host
  // that does not exist, so the webhook was silently dropped and successful
  // payments never credited the wallet. Fail loudly instead.
  if (!env.API_PUBLIC_URL) {
    throw bad(
      'api_public_url_missing',
      "API_PUBLIC_URL is not set. It must be this backend's public origin, " +
      'e.g. https://your-backend.onrender.com, so PhonePe can deliver the payment webhook.'
    );
  }

  const mobileSuffix = platform === 'mobile' ? '&mobile=1' : '';
  const payload = {
    merchantId: env.PHONEPE_MERCHANT_ID,
    merchantTransactionId: gateway_order_id,
    merchantUserId: `u_${user_id}`,
    amount: amount_paise,
    redirectUrl: `${env.FRONTEND_URL.replace(/\/$/, '')}/wallet?topup=${gateway_order_id}${mobileSuffix}`,
    redirectMode: 'REDIRECT',
    callbackUrl: `${env.API_PUBLIC_URL.replace(/\/$/, '')}/api/webhooks/phonepe`,
    paymentInstrument: { type: 'PAY_PAGE' },
  };
  const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const path = '/pg/v1/pay';
  const xVerify = crypto
    .createHash('sha256')
    .update(base64 + path + env.PHONEPE_SALT_KEY)
    .digest('hex') + '###' + env.PHONEPE_SALT_INDEX;

  const resp = await fetch(`${env.PHONEPE_HOST.replace(/\/$/, '')}${path}`, {
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

// --- Initiate top-up --------------------------------------------------------

async function initiateTopup({ amount_paise, user_id, platform }) {
  const gateway_order_id = generateOrderId();

  if (!isConfigured()) {
    if (!allowsStub()) throw notConfiguredError();
    const mobileSuffix = platform === 'mobile' ? '&mobile=1' : '';
    return {
      provider: 'stub',
      gateway_order_id,
      redirect_url: `${env.FRONTEND_URL.replace(/\/$/, '')}/dev/phonepe-stub?order=${gateway_order_id}&amount=${amount_paise}${mobileSuffix}`,
      raw_request: { stub: true, amount_paise, user_id },
      raw_response: { stub_redirect: true },
    };
  }

  return apiVersion() === 'v2'
    ? initiateV2({ amount_paise, user_id, gateway_order_id, platform })
    : initiateV1({ amount_paise, user_id, gateway_order_id, platform });
}

// --- Order status -----------------------------------------------------------

function mapV2OrderStatus(json) {
  const details = Array.isArray(json.paymentDetails) ? json.paymentDetails : [];
  const rootState = String(json.state || '').toUpperCase();
  // Prefer the attempt that matches the order state; falling back to the last
  // attempt can attach a failed transaction id to a completed order.
  const chosen =
    details.find((d) => String(d.state || '').toUpperCase() === rootState) ||
    (details.length ? details[details.length - 1] : {});
  const amount = json.amount != null ? Number(json.amount) : Number(chosen.amount);
  return {
    state: json.state || chosen.state || null,
    amount_paise: Number.isFinite(amount) ? amount : null,
    gateway_txn_id: chosen.transactionId || json.transactionId || null,
    failure_reason: chosen.errorCode || json.errorCode || null,
    raw: json,
  };
}

async function fetchV2OrderStatus(gateway_order_id) {
  const url =
    `${env.PHONEPE_API_HOST.replace(/\/$/, '')}/checkout/v2/order/` +
    `${encodeURIComponent(gateway_order_id)}/status?details=true`;
  const resp = await authedFetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw bad(
      'phonepe_status_failed',
      json.message || `PhonePe status request failed (HTTP ${resp.status})`
    );
  }
  return mapV2OrderStatus(json);
}

async function fetchV1OrderStatus(gateway_order_id) {
  const path = `/pg/v1/status/${env.PHONEPE_MERCHANT_ID}/${gateway_order_id}`;
  const xVerify = crypto
    .createHash('sha256')
    .update(path + env.PHONEPE_SALT_KEY)
    .digest('hex') + '###' + env.PHONEPE_SALT_INDEX;

  const resp = await fetch(`${env.PHONEPE_HOST.replace(/\/$/, '')}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': xVerify,
      Accept: 'application/json',
    },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.success) {
    throw bad(
      'phonepe_status_failed',
      json.message || `PhonePe status request failed (HTTP ${resp.status})`
    );
  }
  const data = json.data || {};
  return {
    state: data.state || null,
    amount_paise: data.amount != null ? Number(data.amount) : null,
    gateway_txn_id: data.transactionId || null,
    failure_reason: data.responseCode || null,
    raw: json,
  };
}

async function fetchOrderStatus({ gateway_order_id }) {
  if (!isConfigured()) throw notConfiguredError();
  return apiVersion() === 'v2'
    ? fetchV2OrderStatus(gateway_order_id)
    : fetchV1OrderStatus(gateway_order_id);
}

// --- Webhook verification ---------------------------------------------------

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a.toLowerCase(), 'utf8');
  const right = Buffer.from(b.toLowerCase(), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyV2Webhook({ headers, body, rawBody }) {
  const mode = env.PHONEPE_WEBHOOK_AUTH;

  if (mode === 'hmac') {
    const signature = headers['phonepe-checksum-signature'] || headers['PHONEPE-CHECKSUM-SIGNATURE'];
    if (!env.PHONEPE_WEBHOOK_SECRET) {
      throw unauthorized('webhook_not_configured', 'PHONEPE_WEBHOOK_SECRET is not set');
    }
    if (!signature) throw unauthorized('missing_checksum_signature');

    // Verify the exact bytes PhonePe signed, not a re-serialisation.
    const raw = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(body || {}), 'utf8');
    const digest = crypto.createHmac('sha256', env.PHONEPE_WEBHOOK_SECRET).update(raw).digest();

    const candidates = [digest.toString('hex'), digest.toString('base64')];
    if (!candidates.some((c) => timingSafeEqualHex(c, signature))) {
      throw unauthorized('bad_signature', 'Invalid PhonePe webhook signature');
    }
  } else {
    if (!env.PHONEPE_WEBHOOK_USERNAME || !env.PHONEPE_WEBHOOK_PASSWORD) {
      throw unauthorized(
        'webhook_not_configured',
        'PHONEPE_WEBHOOK_USERNAME / PHONEPE_WEBHOOK_PASSWORD are not set'
      );
    }
    const auth = headers['authorization'] || headers['Authorization'];
    if (!auth) throw unauthorized('missing_authorization');

    const expected = crypto
      .createHash('sha256')
      .update(`${env.PHONEPE_WEBHOOK_USERNAME}:${env.PHONEPE_WEBHOOK_PASSWORD}`)
      .digest('hex');
    const supplied = String(auth).replace(/^sha256[\s:=]*/i, '').trim();
    if (!timingSafeEqualHex(expected, supplied)) {
      throw unauthorized('bad_signature', 'Invalid PhonePe webhook authorization');
    }
  }

  let payload = body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (_) {
      throw bad('invalid_payload');
    }
  }
  if (!payload || typeof payload !== 'object') throw bad('invalid_payload');

  return { ok: true, payload, stub: false, version: 'v2' };
}

function verifyV1Webhook({ headers, body }) {
  const xVerify = headers['x-verify'] || headers['X-VERIFY'];
  if (!xVerify) throw unauthorized('missing_x_verify');

  const responseB64 = body?.response;
  if (!responseB64) throw bad('missing_response');

  const expected =
    crypto.createHash('sha256').update(responseB64 + env.PHONEPE_SALT_KEY).digest('hex') +
    '###' +
    env.PHONEPE_SALT_INDEX;

  if (!timingSafeEqualHex(expected, xVerify)) throw unauthorized('bad_signature');

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(responseB64, 'base64').toString('utf8'));
  } catch (_) {
    throw bad('invalid_payload');
  }
  return { ok: true, payload: decoded, stub: false, version: 'v1' };
}

function verifyWebhook({ headers = {}, body, rawBody }) {
  if (!isConfigured()) {
    // Stub mode is reachable only in tests / explicit local dev. The webhook
    // route hands us a string when PhonePe posts text/plain, so normalise.
    let payload = body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (_) {
        throw bad('invalid_payload');
      }
    }
    return { ok: true, payload, stub: true, version: 'stub' };
  }

  // V1 payloads are wrapped in { response: base64 }. V2 payloads are plain JSON.
  if (body && typeof body === 'object' && body.response) {
    return verifyV1Webhook({ headers, body });
  }
  return verifyV2Webhook({ headers, body, rawBody });
}

module.exports = {
  isConfigured,
  apiVersion,
  generateOrderId,
  initiateTopup,
  fetchOrderStatus,
  verifyWebhook,
  // Exposed for unit tests; not part of the service contract.
  resetTokenCache,
};
