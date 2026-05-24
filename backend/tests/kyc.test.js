'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, truncateAll, seedReferenceData,
  createUserWithToken, createAdminWithToken,
} = require('./_helpers');

async function makeMentor() {
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
  return { user, access_token };
}

// Aadhaar is the only required field now. PAN + bank are still accepted
// but optional; mentors can fill them later.
const VALID = {
  aadhaar_number: '123412341234',
};

beforeEach(async () => {
  await truncateAll();
  await seedReferenceData();
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

describe('POST /api/mentors/kyc', () => {
  test('happy path: aadhaar-only submission lands in pending with masked aadhaar', async () => {
    const m = await makeMentor();
    const r = await request(app)
      .post('/api/mentors/kyc')
      .set('Authorization', `Bearer ${m.access_token}`)
      .send(VALID);
    expect(r.status).toBe(201);
    expect(r.body.kyc.status).toBe('pending');
    expect(r.body.kyc.aadhaar_number_masked).toBe('XXXXXXXX1234');
    expect(r.body.kyc.pan_number_masked).toBeNull();
    expect(r.body.kyc.has_bank_details).toBe(false);
  });

  test('accepts optional PAN + bank fields when supplied', async () => {
    const m = await makeMentor();
    const r = await request(app)
      .post('/api/mentors/kyc')
      .set('Authorization', `Bearer ${m.access_token}`)
      .send({
        ...VALID,
        pan_number: 'ABCDE1234F',
        full_name_as_per_pan: 'Test User',
        bank_account_number: '123456789012',
        bank_ifsc: 'HDFC0001234',
        bank_account_holder: 'Test User',
      });
    expect(r.status).toBe(201);
    expect(r.body.kyc.pan_number_masked).toBe('ABXXXX234F');
    expect(r.body.kyc.bank_account_number_masked).toBe('XXXXXXXX9012');
    expect(r.body.kyc.has_bank_details).toBe(true);
  });

  test('rejects missing aadhaar', async () => {
    const m = await makeMentor();
    const r = await request(app)
      .post('/api/mentors/kyc')
      .set('Authorization', `Bearer ${m.access_token}`)
      .send({});
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_aadhaar');
  });

  test('rejects invalid aadhaar (not 12 digits)', async () => {
    const m = await makeMentor();
    const r = await request(app)
      .post('/api/mentors/kyc')
      .set('Authorization', `Bearer ${m.access_token}`)
      .send({ aadhaar_number: '12345' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_aadhaar');
  });

  test('rejects invalid PAN format when PAN is supplied', async () => {
    const m = await makeMentor();
    const r = await request(app)
      .post('/api/mentors/kyc')
      .set('Authorization', `Bearer ${m.access_token}`)
      .send({ ...VALID, pan_number: 'NOTAPAN' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_pan');
  });

  test('rejects invalid IFSC when IFSC is supplied', async () => {
    const m = await makeMentor();
    const r = await request(app)
      .post('/api/mentors/kyc')
      .set('Authorization', `Bearer ${m.access_token}`)
      .send({ ...VALID, bank_ifsc: 'BADIFSC' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_ifsc');
  });

  test('rejects too-short bank account when account is supplied', async () => {
    const m = await makeMentor();
    const r = await request(app)
      .post('/api/mentors/kyc')
      .set('Authorization', `Bearer ${m.access_token}`)
      .send({ ...VALID, bank_account_number: '12345' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_account');
  });

  test('non-mentor 403', async () => {
    const u = await createUserWithToken({ role: 'mentee' });
    const r = await request(app)
      .post('/api/mentors/kyc')
      .set('Authorization', `Bearer ${u.access_token}`)
      .send(VALID);
    expect(r.status).toBe(403);
    // requireRole runs before service-level check; either error code is acceptable
    expect(['mentor_only', 'insufficient_role']).toContain(r.body.code);
  });

  test('duplicate pending submission rejected', async () => {
    const m = await makeMentor();
    await request(app).post('/api/mentors/kyc').set('Authorization', `Bearer ${m.access_token}`).send(VALID);
    const r = await request(app).post('/api/mentors/kyc').set('Authorization', `Bearer ${m.access_token}`).send(VALID);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('kyc_pending');
  });

  test('resubmit allowed after rejection', async () => {
    const m = await makeMentor();
    const admin = await createAdminWithToken();
    const sub = await request(app).post('/api/mentors/kyc').set('Authorization', `Bearer ${m.access_token}`).send(VALID);
    await request(app)
      .post(`/api/admin/kyc/${sub.body.kyc.id}/reject`)
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ notes: 'Bad PAN' });

    const r = await request(app)
      .post('/api/mentors/kyc')
      .set('Authorization', `Bearer ${m.access_token}`)
      .send({ aadhaar_number: '999988887777' });
    expect(r.status).toBe(201);
    expect(r.body.kyc.status).toBe('pending');
    expect(r.body.kyc.aadhaar_number_masked).toBe('XXXXXXXX7777');
  });
});

describe('GET /api/mentors/kyc/me', () => {
  test('returns null when not submitted', async () => {
    const m = await makeMentor();
    const r = await request(app)
      .get('/api/mentors/kyc/me')
      .set('Authorization', `Bearer ${m.access_token}`);
    expect(r.status).toBe(200);
    expect(r.body.kyc).toBeNull();
  });

  test('returns submitted KYC', async () => {
    const m = await makeMentor();
    await request(app).post('/api/mentors/kyc').set('Authorization', `Bearer ${m.access_token}`).send(VALID);
    const r = await request(app)
      .get('/api/mentors/kyc/me')
      .set('Authorization', `Bearer ${m.access_token}`);
    expect(r.body.kyc.status).toBe('pending');
  });
});

describe('Admin KYC flow', () => {
  test('approve → notify, mentor can now withdraw', async () => {
    const m = await makeMentor();
    const admin = await createAdminWithToken();
    const sub = await request(app).post('/api/mentors/kyc').set('Authorization', `Bearer ${m.access_token}`).send(VALID);

    const list = await request(app)
      .get('/api/admin/kyc?status=pending')
      .set('Authorization', `Bearer ${admin.access_token}`);
    expect(list.body.items.length).toBe(1);

    const ap = await request(app)
      .post(`/api/admin/kyc/${sub.body.kyc.id}/approve`)
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ notes: 'looks good' });
    expect(ap.status).toBe(200);
    expect(ap.body.kyc.status).toBe('approved');

    // Notification sent
    const n = await query(`SELECT * FROM notifications WHERE user_id = $1 AND kind = 'kyc_approved'`, [m.user.id]);
    expect(n.rowCount).toBe(1);
  });

  test('reject → status=rejected + notification', async () => {
    const m = await makeMentor();
    const admin = await createAdminWithToken();
    const sub = await request(app).post('/api/mentors/kyc').set('Authorization', `Bearer ${m.access_token}`).send(VALID);

    const rj = await request(app)
      .post(`/api/admin/kyc/${sub.body.kyc.id}/reject`)
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ notes: 'needs better proof' });
    expect(rj.body.kyc.status).toBe('rejected');

    const n = await query(`SELECT kind FROM notifications WHERE user_id = $1`, [m.user.id]);
    expect(n.rows.some((r) => r.kind === 'kyc_rejected')).toBe(true);
  });

  test('cannot double-decide', async () => {
    const m = await makeMentor();
    const admin = await createAdminWithToken();
    const sub = await request(app).post('/api/mentors/kyc').set('Authorization', `Bearer ${m.access_token}`).send(VALID);
    await request(app).post(`/api/admin/kyc/${sub.body.kyc.id}/approve`).set('Authorization', `Bearer ${admin.access_token}`).send();
    const r = await request(app).post(`/api/admin/kyc/${sub.body.kyc.id}/approve`).set('Authorization', `Bearer ${admin.access_token}`).send();
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('already_decided');
  });

  test('non-admin 403 on admin routes', async () => {
    const m = await makeMentor();
    const r = await request(app)
      .get('/api/admin/kyc')
      .set('Authorization', `Bearer ${m.access_token}`);
    expect(r.status).toBe(403);
  });
});
