'use strict';

// Unit tests for the Razorpay provider. The env module is mocked so the tests
// are hermetic: no DB row, no network, and no dependency on whatever gateway a
// developer has selected in backend/.env.

const crypto = require('crypto');

jest.mock('../src/config/env', () => ({
  NODE_ENV: 'test',
  PAYMENT_GATEWAY: 'razorpay',
  RAZORPAY_KEY_ID: 'rzp_test_mock',
  RAZORPAY_KEY_SECRET: 'mock_secret_key',
}));

const razorpay = require('../src/services/razorpayService');

const SECRET = 'mock_secret_key';

function sign(order_id, payment_id) {
  return crypto.createHmac('sha256', SECRET).update(`${order_id}|${payment_id}`).digest('hex');
}

describe('razorpayService.verifyPaymentSignature', () => {
  test('accepts a signature it produced', () => {
    const order_id = 'order_ABC123';
    const payment_id = 'pay_XYZ789';
    expect(razorpay.verifyPaymentSignature({
      order_id,
      payment_id,
      signature: sign(order_id, payment_id),
    })).toBe(true);
  });

  test('rejects a tampered signature', () => {
    expect(razorpay.verifyPaymentSignature({
      order_id: 'order_ABC123',
      payment_id: 'pay_XYZ789',
      signature: 'deadbeef',
    })).toBe(false);
  });

  test('rejects a signature for a different payment', () => {
    expect(razorpay.verifyPaymentSignature({
      order_id: 'order_ABC123',
      payment_id: 'pay_OTHER',
      signature: sign('order_ABC123', 'pay_XYZ789'),
    })).toBe(false);
  });
});

describe('razorpayService.createOrder', () => {
  test('returns a deterministic stub order in the test environment', async () => {
    const order = await razorpay.createOrder({ amount_paise: 50000, receipt: 'rcpt' });
    expect(order.id).toMatch(/^order_stub_/);
    expect(order.amount).toBe(50000);
    expect(order.currency).toBe('INR');
  });

  test('rejects an amount below 100 paise', async () => {
    await expect(razorpay.createOrder({ amount_paise: 50 })).rejects.toMatchObject({
      code: 'amount_too_small',
    });
  });
});
