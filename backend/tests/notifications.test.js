'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, truncateAll, seedReferenceData,
  createUserWithToken, createAdminWithToken,
} = require('./_helpers');

const notify = require('../src/services/notificationService');

// --- Fixtures --------------------------------------------------------------

async function setupPlatformWallet() {
  const sys = await query(
    `INSERT INTO users (email, full_name, role, is_active, email_verified_at)
     VALUES ('system@unmute.internal', 'unmute Platform', 'admin', TRUE, NOW())
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`
  );
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'platform', 0)
     ON CONFLICT (user_id, kind) DO NOTHING`,
    [sys.rows[0].id]
  );
}

async function makeApprovedMentor() {
  const { user, access_token } = await createUserWithToken({
    role: 'mentor',
    email: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@t.local`,
  });
  const tier = (await query(`SELECT id FROM pricing_tiers WHERE name='standard'`)).rows[0];
  const mp = await query(
    `INSERT INTO mentor_profiles
       (user_id, pricing_tier_id, headline, bio, timezone, verification_status, verified_at)
     VALUES ($1, $2, 'h', 'b', 'UTC', 'approved', NOW())
     RETURNING *`,
    [user.id, tier.id]
  );
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentor', 0)
     ON CONFLICT (user_id, kind) DO NOTHING`,
    [user.id]
  );
  return { user, access_token, profile: mp.rows[0] };
}

async function makeMentee() {
  const { user, access_token } = await createUserWithToken({
    role: 'mentee',
    email: `mentee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@t.local`,
  });
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentee', 100000)
     ON CONFLICT (user_id, kind) DO NOTHING`,
    [user.id]
  );
  return { user, access_token };
}

beforeEach(async () => {
  await truncateAll();
  await seedReferenceData();
  await setupPlatformWallet();
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

// --- Direct notify() ------------------------------------------------------

describe('notificationService.notify()', () => {
  test('creates a row visible via /api/me/notifications', async () => {
    const u = await makeMentee();
    await notify.notify({
      user_id: u.user.id,
      kind: 'test',
      title: 'Hello',
      body: 'World',
    });
    const r = await request(app)
      .get('/api/me/notifications')
      .set('Authorization', `Bearer ${u.access_token}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(1);
    expect(r.body.items[0].title).toBe('Hello');
    expect(r.body.items[0].body).toBe('World');
    expect(r.body.items[0].read_at).toBeNull();
    expect(r.body.unread).toBe(1);
  });
});

// --- Endpoints -----------------------------------------------------------

describe('Notification endpoints', () => {
  test('unread-count', async () => {
    const u = await makeMentee();
    await notify.notify({ user_id: u.user.id, kind: 't', title: '1' });
    await notify.notify({ user_id: u.user.id, kind: 't', title: '2' });

    const r = await request(app)
      .get('/api/me/notifications/unread-count')
      .set('Authorization', `Bearer ${u.access_token}`);
    expect(r.body.unread).toBe(2);
  });

  test('mark single as read', async () => {
    const u = await makeMentee();
    const n = await notify.notify({ user_id: u.user.id, kind: 't', title: 'one' });

    const r = await request(app)
      .post(`/api/me/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${u.access_token}`);
    expect(r.status).toBe(200);

    const after = await query(`SELECT read_at FROM notifications WHERE id = $1`, [n.id]);
    expect(after.rows[0].read_at).toBeTruthy();
  });

  test('cannot mark another user\'s notification', async () => {
    const a = await makeMentee();
    const b = await makeMentee();
    const n = await notify.notify({ user_id: a.user.id, kind: 't', title: 'hers' });

    const r = await request(app)
      .post(`/api/me/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${b.access_token}`);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('not_your_notification');
  });

  test('mark-all-read clears unread', async () => {
    const u = await makeMentee();
    await notify.notify({ user_id: u.user.id, kind: 't', title: '1' });
    await notify.notify({ user_id: u.user.id, kind: 't', title: '2' });
    await notify.notify({ user_id: u.user.id, kind: 't', title: '3' });

    const r = await request(app)
      .post('/api/me/notifications/read-all')
      .set('Authorization', `Bearer ${u.access_token}`);
    expect(r.body.marked).toBe(3);

    const after = await request(app)
      .get('/api/me/notifications/unread-count')
      .set('Authorization', `Bearer ${u.access_token}`);
    expect(after.body.unread).toBe(0);
  });

  test('unread filter returns only unread items', async () => {
    const u = await makeMentee();
    const n1 = await notify.notify({ user_id: u.user.id, kind: 't', title: 'read me' });
    await notify.notify({ user_id: u.user.id, kind: 't', title: 'still unread' });
    await query(`UPDATE notifications SET read_at = NOW() WHERE id = $1`, [n1.id]);

    const r = await request(app)
      .get('/api/me/notifications?unread=true')
      .set('Authorization', `Bearer ${u.access_token}`);
    expect(r.body.items.length).toBe(1);
    expect(r.body.items[0].title).toBe('still unread');
  });

  test('401 without token', async () => {
    const r = await request(app).get('/api/me/notifications');
    expect(r.status).toBe(401);
  });
});

// --- Lifecycle integration ------------------------------------------------

describe('Lifecycle hooks create notifications', () => {
  async function applyMentor(mentee_access_token) {
    const tier = (await query(`SELECT id FROM pricing_tiers WHERE name='standard'`)).rows[0];
    return request(app)
      .post('/api/mentors/apply')
      .set('Authorization', `Bearer ${mentee_access_token}`)
      .send({ pricing_tier_id: tier.id, headline: 'h', bio: 'b' });
  }

  test('admin approving a mentor sends a notification to that mentor', async () => {
    const applicant = await makeMentee(); // mentee first; apply bumps role
    const admin = await createAdminWithToken();
    await applyMentor(applicant.access_token);
    const mp = (await query(`SELECT id FROM mentor_profiles WHERE user_id = $1`, [applicant.user.id])).rows[0];

    await request(app)
      .post(`/api/admin/mentor-applications/${mp.id}/approve`)
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ notes: 'Welcome' });

    const r = await request(app)
      .get('/api/me/notifications')
      .set('Authorization', `Bearer ${applicant.access_token}`);
    expect(r.body.items.length).toBe(1);
    expect(r.body.items[0].kind).toBe('mentor_approved');
  });

  test('admin rejecting sends a different notification', async () => {
    const applicant = await makeMentee();
    const admin = await createAdminWithToken();
    await applyMentor(applicant.access_token);
    const mp = (await query(`SELECT id FROM mentor_profiles WHERE user_id = $1`, [applicant.user.id])).rows[0];

    await request(app)
      .post(`/api/admin/mentor-applications/${mp.id}/reject`)
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ notes: 'Need more experience' });

    const r = await request(app)
      .get('/api/me/notifications')
      .set('Authorization', `Bearer ${applicant.access_token}`);
    expect(r.body.items[0].kind).toBe('mentor_rejected');
  });

  test('topup webhook success creates a topup_succeeded notification', async () => {
    const u = await makeMentee();
    const init = await request(app)
      .post('/api/payments/topup')
      .set('Authorization', `Bearer ${u.access_token}`)
      .send({ amount_paise: 50000 });
    const order_id = init.body.payment.gateway_order_id;

    await request(app).post('/api/webhooks/phonepe').send({
      merchantTransactionId: order_id,
      transactionId: 'T1',
      amount: 50000,
      state: 'PAYMENT_SUCCESS',
      success: true,
    });

    const r = await request(app)
      .get('/api/me/notifications')
      .set('Authorization', `Bearer ${u.access_token}`);
    expect(r.body.items.some((n) => n.kind === 'topup_succeeded')).toBe(true);
  });

  test('submitting a review notifies the reviewee', async () => {
    const mentor = await makeApprovedMentor();
    const mentee = await makeMentee();
    // Insert a completed booking directly
    const start = new Date(Date.now() - 3600_000);
    const end = new Date(start.getTime() + 60 * 60_000);
    const b = (await query(
      `INSERT INTO bookings
         (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
          per_minute_paise_snapshot, status)
       VALUES ($1, $2, $3, $4, 1000, 'completed') RETURNING *`,
      [mentor.user.id, mentee.user.id, start.toISOString(), end.toISOString()]
    )).rows[0];

    await request(app)
      .post(`/api/bookings/${b.uuid}/review`)
      .set('Authorization', `Bearer ${mentee.access_token}`)
      .send({ rating: 5, body: 'great' });

    const r = await request(app)
      .get('/api/me/notifications')
      .set('Authorization', `Bearer ${mentor.access_token}`);
    expect(r.body.items.some((n) => n.kind === 'review_received')).toBe(true);
  });
});
