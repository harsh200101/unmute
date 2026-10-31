'use strict';

// Unit tests for the PhonePe V2 provider. Hermetic: env is mocked and global
// fetch is stubbed, so no network and no DB.

const crypto = require('crypto');

const mockEnv = {
  NODE_ENV: 'production',
  PAYMENT_GATEWAY: 'phonepe',
  PHONEPE_ENV: 'production',
  PHONEPE_CLIENT_ID: 'test_client_id',
  PHONEPE_CLIENT_SECRET: 'test_client_secret',
  PHONEPE_CLIENT_VERSION: '1',
  PHONEPE_AUTH_HOST: 'https://auth.phonepe.test',
  PHONEPE_API_HOST: 'https://api.phonepe.test',
  PHONEPE_WEBHOOK_AUTH: 'sha',
  PHONEPE_WEBHOOK_USERNAME: 'wh_user',
  PHONEPE_WEBHOOK_PASSWORD: 'wh_pass',
  PHONEPE_WEBHOOK_SECRET: 'wh_secret',
  PHONEPE_ALLOW_STUB: false,
  PHONEPE_EXPIRE_AFTER_SECONDS: 1200,
  PHONEPE_MERCHANT_ID: '',
  PHONEPE_SALT_KEY: '',
  PHONEPE_SALT_INDEX: 1,
  PHONEPE_HOST: '',
  FRONTEND_URL: 'https://app.unmute.test',
  API_PUBLIC_URL: 'https://api.unmute.test',
};

jest.mock('../src/config/env', () => mockEnv);

const phonepe = require('../src/services/phonepeService');

const originalFetch = global.fetch;
const tokenExpiry = Math.floor(Date.now() / 1000) + 3600;

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function resetConfig() {
  mockEnv.NODE_ENV = 'production';
  mockEnv.PHONEPE_CLIENT_ID = 'test_client_id';
  mockEnv.PHONEPE_CLIENT_SECRET = 'test_client_secret';
  mockEnv.PHONEPE_CLIENT_VERSION = '1';
  mockEnv.PHONEPE_WEBHOOK_AUTH = 'sha';
  mockEnv.PHONEPE_ALLOW_STUB = false;
  phonepe.resetTokenCache();
}

beforeEach(() => {
  resetConfig();
});

afterEach(() => {
  global.fetch = originalFetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('phonepeService.initiateTopup (V2)', () => {
  test('obtains a token then creates a PG_CHECKOUT payment', async () => {
    const calls = [];
    global.fetch = jest.fn(async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith('/v1/oauth/token')) {
        return jsonResponse(200, { access_token: 'tok_123', expires_at: tokenExpiry });
      }
      return jsonResponse(200, {
        orderId: 'OMO123',
        state: 'PENDING',
        redirectUrl: 'https://phonepe.test/checkout/OMO123',
      });
    });

    const init = await phonepe.initiateTopup({ amount_paise: 50000, user_id: 7 });

    expect(init.provider).toBe('phonepe');
    expect(init.gateway_order_id).toMatch(/^unmute_\d+_[a-f0-9]{12}$/);
    expect(init.redirect_url).toBe('https://phonepe.test/checkout/OMO123');

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://auth.phonepe.test/v1/oauth/token');
    expect(calls[0].options.body).toContain('grant_type=client_credentials');
    expect(calls[1].url).toBe('https://api.phonepe.test/checkout/v2/pay');
    expect(calls[1].options.headers.Authorization).toBe('O-Bearer tok_123');

    const payload = JSON.parse(calls[1].options.body);
    expect(payload.merchantOrderId).toBe(init.gateway_order_id);
    expect(payload.amount).toBe(50000);
    expect(payload.expireAfter).toBe(1200);
    expect(payload.paymentFlow.type).toBe('PG_CHECKOUT');
    expect(payload.paymentFlow.merchantUrls.redirectUrl).toBe(
      `https://app.unmute.test/wallet?topup=${init.gateway_order_id}`
    );
  });

  test('reuses a cached token across calls', async () => {
    const calls = [];
    global.fetch = jest.fn(async (url) => {
      calls.push(url);
      if (url.endsWith('/v1/oauth/token')) {
        return jsonResponse(200, { access_token: 'tok_cached', expires_at: tokenExpiry });
      }
      return jsonResponse(200, { redirectUrl: 'https://phonepe.test/checkout/x' });
    });

    await phonepe.initiateTopup({ amount_paise: 5000, user_id: 1 });
    await phonepe.initiateTopup({ amount_paise: 5000, user_id: 1 });

    expect(calls.filter((u) => u.endsWith('/v1/oauth/token'))).toHaveLength(1);
    expect(calls.filter((u) => u.endsWith('/checkout/v2/pay'))).toHaveLength(2);
  });

  test('throws instead of stubbing when production has no credentials', async () => {
    mockEnv.PHONEPE_CLIENT_ID = '';
    mockEnv.PHONEPE_CLIENT_SECRET = '';
    mockEnv.PHONEPE_CLIENT_VERSION = '';
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    await expect(
      phonepe.initiateTopup({ amount_paise: 5000, user_id: 1 })
    ).rejects.toMatchObject({ code: 'phonepe_not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('phonepeService.fetchOrderStatus (V2)', () => {
  test('maps COMPLETED and the latest payment detail', async () => {
    global.fetch = jest.fn(async (url) => {
      if (url.endsWith('/v1/oauth/token')) {
        return jsonResponse(200, { access_token: 'tok_status', expires_at: tokenExpiry });
      }
      return jsonResponse(200, {
        state: 'COMPLETED',
        amount: 50000,
        paymentDetails: [
          { transactionId: 'TXN1', state: 'COMPLETED', amount: 50000 },
        ],
      });
    });

    const st = await phonepe.fetchOrderStatus({ gateway_order_id: 'unmute_1_abc' });

    expect(st.state).toBe('COMPLETED');
    expect(st.amount_paise).toBe(50000);
    expect(st.gateway_txn_id).toBe('TXN1');
  });

  test('requests the status URL with details=true', async () => {
    const calls = [];
    global.fetch = jest.fn(async (url) => {
      calls.push(url);
      if (url.endsWith('/v1/oauth/token')) {
        return jsonResponse(200, { access_token: 'tok_status', expires_at: tokenExpiry });
      }
      return jsonResponse(200, { state: 'PENDING', amount: 5000 });
    });

    await phonepe.fetchOrderStatus({ gateway_order_id: 'unmute_1_abc' });
    expect(calls[1]).toBe(
      'https://api.phonepe.test/checkout/v2/order/unmute_1_abc/status?details=true'
    );
  });
});

describe('phonepeService.verifyWebhook', () => {
  test('accepts SHA256(username:password) authorization', () => {
    const auth = crypto.createHash('sha256').update('wh_user:wh_pass').digest('hex');
    const body = { event: 'checkout.order.completed', payload: { state: 'COMPLETED' } };
    const out = phonepe.verifyWebhook({ headers: { authorization: auth }, body });
    expect(out.ok).toBe(true);
    expect(out.version).toBe('v2');
  });

  test('rejects a wrong SHA authorization', () => {
    expect(() =>
      phonepe.verifyWebhook({
        headers: { authorization: 'deadbeef' },
        body: { event: 'checkout.order.completed' },
      })
    ).toThrow(/Invalid PhonePe webhook authorization/);
  });

  test('accepts an HMAC over the raw body', () => {
    mockEnv.PHONEPE_WEBHOOK_AUTH = 'hmac';
    const rawBody = '{"event":"checkout.order.completed", "payload":{"state":"COMPLETED"}}';
    const signature = crypto.createHmac('sha256', 'wh_secret').update(rawBody).digest('hex');
    const out = phonepe.verifyWebhook({
      headers: { 'phonepe-checksum-signature': signature },
      body: JSON.parse(rawBody),
      rawBody: Buffer.from(rawBody),
    });
    expect(out.ok).toBe(true);
    expect(out.payload.payload.state).toBe('COMPLETED');
  });

  test('rejects an HMAC over a different payload', () => {
    mockEnv.PHONEPE_WEBHOOK_AUTH = 'hmac';
    const signature = crypto.createHmac('sha256', 'wh_secret').update('other').digest('hex');
    expect(() =>
      phonepe.verifyWebhook({
        headers: { 'phonepe-checksum-signature': signature },
        body: { event: 'checkout.order.completed' },
        rawBody: Buffer.from('{"event":"checkout.order.completed"}'),
      })
    ).toThrow(/Invalid PhonePe webhook signature/);
  });

  test('parses a text/plain JSON body in stub mode', () => {
    mockEnv.NODE_ENV = 'test';
    const out = phonepe.verifyWebhook({
      headers: {},
      body: '{"merchantTransactionId":"unmute_1_abc","state":"PAYMENT_SUCCESS"}',
    });
    expect(out.stub).toBe(true);
    expect(out.payload.merchantTransactionId).toBe('unmute_1_abc');
  });

  test('fails closed when webhook credentials are missing', () => {
    mockEnv.PHONEPE_WEBHOOK_USERNAME = '';
    mockEnv.PHONEPE_WEBHOOK_PASSWORD = '';
    expect(() =>
      phonepe.verifyWebhook({
        headers: { authorization: 'deadbeef' },
        body: { event: 'checkout.order.completed' },
      })
    ).toThrow(/PHONEPE_WEBHOOK_USERNAME/);
  });
});
