'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, truncateAll, seedReferenceData,
  createUserWithToken, createAdminWithToken,
} = require('./_helpers');

async function makeMentor({ balance_paise = 0, kyc_status = null } = {}) {
  const { user, access_token } = await createUserWithToken({
    role: 'mentor',
    email: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@t.local`,
  });
  const tier = (await query(`SELECT id FROM pricing_tiers WHERE name='standard'`)).rows[0];
  await query(
    `INSERT INTO mentor_profiles
       (user_id, pricing_tier_id, headline, bio, timezone, verification_status, verified_at)
     VALUES ($1, $2, 'h', 'b', 'UTC', 'approved', NOW())`,
    [user.id, tier.id]
  );
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentor', $2)
     ON CONFLICT (user_id, kind) DO UPDATE SET balance_paise = $2`,
    [user.id, balance_paise]
  );
  if (kyc_status) {
    await query(
      `INSERT INTO mentor_kyc
         (mentor_user_id, pan_number, full_name_as_per_pan,
          bank_account_number, bank_ifsc, bank_account_holder, status, reviewed_at)
       VALUES ($1, 'ABCDE1234F', 'Test User', '123456789012', 'HDFC0001234', 'Test User', $2, NOW())`,
      [user.id, kyc_status]
    );
  }
  return { user, access_token };
}

beforeEach(async () => {
  await truncateAll();
  await seedReferenceData();
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

describe('POST /api/payouts/request', () => {
  test('happy path: debits mentor wallet, creates pending withdrawal', async () => {
    const m = await makeMentor({ balance_paise: 200000, kyc_status: 'approved' }); // ₹2000
    const r = await request(app)
      .post('/api/payouts/request')
      .set('Authorization', `Bearer ${m.access_token}`)
      .send({ amount_paise: 100000 });
    expect(r.status).toBe(201);
    expect(r.body.withdrawal.status).toBe('pending');
    expect(r.body.withdrawal.amount_paise).toBe(100000);

    const w = await query(`SELECT balance_paise FROM wallets WHERE user_id = $1 AND kind = 'mentor'`, [m.user.id]);
    expect(w.rows[0].balance_paise).toBe(100000); // 200k - 100k debited
  });

  test('blocked without approved KYC', async () => {
    const m = await makeMentor({ balance_paise: 200000 });
    const r = await request(app)
      .post('/api/payouts/request')
      .set('Authorization', `Bearer ${m.access_token}`)
      .send({ amount_paise: 100000 });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('kyc_required');
  });

  test('blocked when KYC pending only', async () => {
    const m = await makeMentor({ balance_paise: 200000, kyc_status: 'pending' });
    const r = await request(app)
      .post('/api/payouts/request')
      .set('Authorization', `Bearer ${m.access_token}`)
      .send({ amount_paise: 100000 });
    expect(r.status).toBe(403);
  });

  test('rejects below ₹500 minimum', async () => {
    const m = await makeMentor({ balance_paise: 200000, kyc_status: 'approved' });
    const r = await request(app)
      .post('/api/payouts/request')
      .set('Authorization', `Bearer ${m.access_token}`)
      .send({ amount_paise: 10000 }); // ₹100
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('amount_too_small');
  });

  test('insufficient balance is refused', async () => {
    const m = await makeMentor({ balance_paise: 50000, kyc_status: 'approved' });
    const r = await request(app)
      .post('/api/payouts/request')
      .set('Authorization', `Bearer ${m.access_token}`)
      .send({ amount_paise: 100000 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('insufficient_balance');
  });

  test('non-mentor 403', async () => {
    const u = await createUserWithToken({ role: 'mentee' });
    const r = await request(app)
      .post('/api/payouts/request')
      .set('Authorization', `Bearer ${u.access_token}`)
      .send({ amount_paise: 100000 });
    expect(r.status).toBe(403);
  });
});

describe('Admin withdrawal lifecycle', () => {
  async function createPendingWithdrawal() {
    const m = await makeMentor({ balance_paise: 200000, kyc_status: 'approved' });
    const r = await request(app)
      .post('/api/payouts/request')
      .set('Authorization', `Bearer ${m.access_token}`)
      .send({ amount_paise: 100000 });
    return { mentor: m, withdrawal: r.body.withdrawal };
  }

  test('admin lists pending', async () => {
    const { withdrawal } = await createPendingWithdrawal();
    const admin = await createAdminWithToken();
    const r = await request(app)
      .get('/api/admin/withdrawals?status=pending')
      .set('Authorization', `Bearer ${admin.access_token}`);
    expect(r.body.items.length).toBe(1);
    expect(r.body.items[0].uuid).toBe(withdrawal.uuid);
  });

  test('process → complete flow + mentor notification', async () => {
    const { mentor, withdrawal } = await createPendingWithdrawal();
    const admin = await createAdminWithToken();
    // Get id
    const wid = (await query(`SELECT id FROM withdrawals WHERE uuid = $1`, [withdrawal.uuid])).rows[0].id;

    const proc = await request(app)
      .post(`/api/admin/withdrawals/${wid}/process`)
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ gateway_txn_id: 'BANK-TXN-001' });
    expect(proc.body.withdrawal.status).toBe('processing');
    expect(proc.body.withdrawal.gateway_txn_id).toBe('BANK-TXN-001');

    const comp = await request(app)
      .post(`/api/admin/withdrawals/${wid}/complete`)
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send();
    expect(comp.body.withdrawal.status).toBe('succeeded');
    expect(comp.body.withdrawal.processed_at).toBeTruthy();

    // Notification sent
    const n = await query(`SELECT * FROM notifications WHERE user_id = $1 AND kind = 'withdrawal_succeeded'`, [mentor.user.id]);
    expect(n.rowCount).toBe(1);

    // Mentor wallet stays at 100k (not refunded)
    const w = await query(`SELECT balance_paise FROM wallets WHERE user_id = $1 AND kind = 'mentor'`, [mentor.user.id]);
    expect(w.rows[0].balance_paise).toBe(100000);
  });

  test('fail flow reverses the debit', async () => {
    const { mentor, withdrawal } = await createPendingWithdrawal();
    const admin = await createAdminWithToken();
    const wid = (await query(`SELECT id FROM withdrawals WHERE uuid = $1`, [withdrawal.uuid])).rows[0].id;

    const f = await request(app)
      .post(`/api/admin/withdrawals/${wid}/fail`)
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ failure_reason: 'Bank rejected — IFSC invalid' });
    expect(f.body.withdrawal.status).toBe('failed');
    expect(f.body.withdrawal.failure_reason).toContain('IFSC');

    // Mentor wallet restored
    const w = await query(`SELECT balance_paise FROM wallets WHERE user_id = $1 AND kind = 'mentor'`, [mentor.user.id]);
    expect(w.rows[0].balance_paise).toBe(200000); // Back to original

    // Notification sent
    const n = await query(`SELECT * FROM notifications WHERE user_id = $1 AND kind = 'withdrawal_failed'`, [mentor.user.id]);
    expect(n.rowCount).toBe(1);
  });

  test('cannot complete an already-completed withdrawal', async () => {
    const { withdrawal } = await createPendingWithdrawal();
    const admin = await createAdminWithToken();
    const wid = (await query(`SELECT id FROM withdrawals WHERE uuid = $1`, [withdrawal.uuid])).rows[0].id;

    await request(app).post(`/api/admin/withdrawals/${wid}/complete`).set('Authorization', `Bearer ${admin.access_token}`).send();
    const r = await request(app).post(`/api/admin/withdrawals/${wid}/complete`).set('Authorization', `Bearer ${admin.access_token}`).send();
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_state');
  });
});

describe('GET /api/payouts/me', () => {
  test('returns mentor\'s withdrawal history', async () => {
    const m = await makeMentor({ balance_paise: 500000, kyc_status: 'approved' });
    await request(app).post('/api/payouts/request').set('Authorization', `Bearer ${m.access_token}`).send({ amount_paise: 100000 });
    await request(app).post('/api/payouts/request').set('Authorization', `Bearer ${m.access_token}`).send({ amount_paise: 150000 });

    const r = await request(app)
      .get('/api/payouts/me')
      .set('Authorization', `Bearer ${m.access_token}`);
    expect(r.body.items.length).toBe(2);
  });
});
