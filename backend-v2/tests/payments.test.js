'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, truncateAll, seedReferenceData,
  createUserWithToken,
} = require('./_helpers');

async function setupPlatformWallet() {
  const sys = await query(
    `INSERT INTO users (email, full_name, role, is_active, email_verified_at)
     VALUES ('system@unmute.internal', 'unmute Platform', 'admin', TRUE, NOW())
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`
  );
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'platform', 0)
     ON CONFLICT (user_id, kind) DO UPDATE SET balance_paise = 0`,
    [sys.rows[0].id]
  );
}

async function makeMentee({ pending_penalty_paise = 0, balance_paise = 0 } = {}) {
  const { user, access_token } = await createUserWithToken({ role: 'mentee' });
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentee', $2)
     ON CONFLICT (user_id, kind) DO UPDATE SET balance_paise = $2`,
    [user.id, balance_paise]
  );
  if (pending_penalty_paise) {
    await query(
      `UPDATE users SET pending_penalty_paise = $1 WHERE id = $2`,
      [pending_penalty_paise, user.id]
    );
  }
  return { user, access_token };
}

// Build the same shape PhonePe sends on a successful payment. The stub
// provider in phonepeService accepts this format directly because we skip
// signature verification when PHONEPE_* env vars are unset.
function stubWebhook({ gateway_order_id, gateway_txn_id, amount_paise, success = true }) {
  return {
    merchantTransactionId: gateway_order_id,
    transactionId: gateway_txn_id || `T${Date.now()}`,
    amount: amount_paise,
    state: success ? 'PAYMENT_SUCCESS' : 'PAYMENT_ERROR',
    success,
  };
}

beforeEach(async () => {
  await truncateAll();
  await seedReferenceData();
  await setupPlatformWallet();
  global.__SENT_EMAILS__ = [];
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

// --- Wallet read -----------------------------------------------------------

describe('GET /api/wallet/me', () => {
  test('returns mentee balance + pending_penalty', async () => {
    const { access_token } = await makeMentee({ balance_paise: 12345, pending_penalty_paise: 500 });
    const res = await request(app).get('/api/wallet/me').set('Authorization', `Bearer ${access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.balances.mentee).toBe(12345);
    expect(res.body.balances.mentor).toBe(0);
    expect(res.body.pending_penalty_paise).toBe(500);
  });

  test('401 without token', async () => {
    const res = await request(app).get('/api/wallet/me');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/wallet/me/transactions', () => {
  test('returns ledger entries in reverse chronological order', async () => {
    const { user, access_token } = await makeMentee({ balance_paise: 0 });
    const w = await query(`SELECT id FROM wallets WHERE user_id = $1 AND kind = 'mentee'`, [user.id]);
    const wallet_id = w.rows[0].id;
    for (let i = 1; i <= 3; i++) {
      await query(
        `INSERT INTO wallet_transactions (wallet_id, direction, amount_paise, reason, balance_after_paise)
         VALUES ($1, 'credit', $2, 'topup', 0)`,
        [wallet_id, i * 1000]
      );
    }
    const res = await request(app).get('/api/wallet/me/transactions').set('Authorization', `Bearer ${access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(3);
    // Latest first
    expect(res.body.items[0].amount_paise).toBe(3000);
    expect(res.body.items[2].amount_paise).toBe(1000);
  });
});

// --- Topup initiation ------------------------------------------------------

describe('POST /api/payments/topup', () => {
  test('happy path: creates payment, returns redirect URL', async () => {
    const { access_token } = await makeMentee();
    const res = await request(app)
      .post('/api/payments/topup')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ amount_paise: 50000 });
    expect(res.status).toBe(201);
    expect(res.body.payment.amount_paise).toBe(50000);
    expect(res.body.payment.status).toBe('created');
    expect(res.body.redirect_url).toMatch(/^http/);
    expect(res.body.provider).toBe('stub');
  });

  test('rejects below minimum', async () => {
    const { access_token } = await makeMentee();
    const res = await request(app)
      .post('/api/payments/topup')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ amount_paise: 1000 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('amount_too_small');
  });

  test('rejects above maximum', async () => {
    const { access_token } = await makeMentee();
    const res = await request(app)
      .post('/api/payments/topup')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ amount_paise: 100_000_000 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('amount_too_large');
  });

  test('rejects non-integer amount', async () => {
    const { access_token } = await makeMentee();
    const res = await request(app)
      .post('/api/payments/topup')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ amount_paise: 50.5 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_amount');
  });

  test('403 when email not verified', async () => {
    const { access_token } = await createUserWithToken({ email_verified_at: null });
    const res = await request(app)
      .post('/api/payments/topup')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ amount_paise: 50000 });
    expect(res.status).toBe(403);
  });
});

// --- Webhook ---------------------------------------------------------------

describe('POST /api/webhooks/phonepe', () => {
  async function initiateTopup(access_token, amount_paise = 50000) {
    const r = await request(app)
      .post('/api/payments/topup')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ amount_paise });
    return r.body.payment.gateway_order_id;
  }

  test('success webhook → payment succeeded + wallet credited', async () => {
    const { user, access_token } = await makeMentee();
    const order_id = await initiateTopup(access_token, 50000);

    const w = await request(app)
      .post('/api/webhooks/phonepe')
      .send(stubWebhook({ gateway_order_id: order_id, amount_paise: 50000 }));
    expect(w.status).toBe(200);
    expect(w.body.ok).toBe(true);
    expect(w.body.payment.status).toBe('succeeded');

    const bal = await query(`SELECT balance_paise FROM wallets WHERE user_id = $1 AND kind = 'mentee'`, [user.id]);
    expect(bal.rows[0].balance_paise).toBe(50000);

    // Status endpoint reflects success
    const status = await request(app)
      .get(`/api/payments/status/${order_id}`)
      .set('Authorization', `Bearer ${access_token}`);
    expect(status.body.payment.status).toBe('succeeded');
  });

  test('idempotent: replaying the same webhook does not double-credit', async () => {
    const { user, access_token } = await makeMentee();
    const order_id = await initiateTopup(access_token, 50000);

    const payload = stubWebhook({ gateway_order_id: order_id, amount_paise: 50000 });
    await request(app).post('/api/webhooks/phonepe').send(payload);
    const replay = await request(app).post('/api/webhooks/phonepe').send(payload);
    expect(replay.status).toBe(200);
    expect(replay.body.idempotent).toBe(true);

    const bal = await query(`SELECT balance_paise FROM wallets WHERE user_id = $1 AND kind = 'mentee'`, [user.id]);
    expect(bal.rows[0].balance_paise).toBe(50000); // Not 100000
  });

  test('failed webhook → payment.failed, no wallet credit', async () => {
    const { user, access_token } = await makeMentee();
    const order_id = await initiateTopup(access_token, 50000);

    const w = await request(app)
      .post('/api/webhooks/phonepe')
      .send(stubWebhook({ gateway_order_id: order_id, amount_paise: 50000, success: false }));
    expect(w.status).toBe(200);
    expect(w.body.payment.status).toBe('failed');

    const bal = await query(`SELECT balance_paise FROM wallets WHERE user_id = $1 AND kind = 'mentee'`, [user.id]);
    expect(bal.rows[0].balance_paise).toBe(0);
  });

  test('amount mismatch is rejected', async () => {
    const { access_token } = await makeMentee();
    const order_id = await initiateTopup(access_token, 50000);

    const w = await request(app)
      .post('/api/webhooks/phonepe')
      .send(stubWebhook({ gateway_order_id: order_id, amount_paise: 99999 }));
    expect(w.status).toBe(400);
    expect(w.body.code).toBe('amount_mismatch');
  });

  test('unknown order_id returns 404', async () => {
    const w = await request(app)
      .post('/api/webhooks/phonepe')
      .send(stubWebhook({ gateway_order_id: 'totally_unknown', amount_paise: 50000 }));
    expect(w.status).toBe(404);
  });

  test('top-up clears pending_penalty + reimburses platform wallet', async () => {
    const { user, access_token } = await makeMentee({ pending_penalty_paise: 5000 });
    // Platform wallet starts at 0; simulate that it previously fronted the ₹50 by debiting it negative... no, we can't do negative.
    // Instead: we don't pre-fund platform here. The topup will credit platform when it clears the penalty.

    const order_id = await initiateTopup(access_token, 50000);
    await request(app)
      .post('/api/webhooks/phonepe')
      .send(stubWebhook({ gateway_order_id: order_id, amount_paise: 50000 }));

    // Mentee wallet: credited 50000, then debited 5000 to clear penalty
    const menteeBal = await query(`SELECT balance_paise FROM wallets WHERE user_id = $1 AND kind = 'mentee'`, [user.id]);
    expect(menteeBal.rows[0].balance_paise).toBe(45000);

    // Platform wallet: credited 5000 (recovered the late-cancel front)
    const platBal = await query(`SELECT balance_paise FROM wallets WHERE kind = 'platform' LIMIT 1`);
    expect(platBal.rows[0].balance_paise).toBe(5000);

    // pending_penalty cleared
    const u = await query(`SELECT pending_penalty_paise FROM users WHERE id = $1`, [user.id]);
    expect(u.rows[0].pending_penalty_paise).toBe(0);
  });

  test('partial penalty clearance when topup < pending', async () => {
    const { user, access_token } = await makeMentee({ pending_penalty_paise: 10000 });
    const order_id = await initiateTopup(access_token, 6000);
    await request(app)
      .post('/api/webhooks/phonepe')
      .send(stubWebhook({ gateway_order_id: order_id, amount_paise: 6000 }));

    // Mentee: 6000 credit - 6000 to clear penalty (only as much as available)
    const menteeBal = await query(`SELECT balance_paise FROM wallets WHERE user_id = $1 AND kind = 'mentee'`, [user.id]);
    expect(menteeBal.rows[0].balance_paise).toBe(0);

    // Remaining pending = 10000 - 6000 = 4000
    const u = await query(`SELECT pending_penalty_paise FROM users WHERE id = $1`, [user.id]);
    expect(u.rows[0].pending_penalty_paise).toBe(4000);
  });
});
