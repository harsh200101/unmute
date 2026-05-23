'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, truncateAll, seedReferenceData,
  createUserWithToken, createAdminWithToken,
} = require('./_helpers');

beforeEach(async () => {
  await truncateAll();
  await seedReferenceData();
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

async function getTier(name = 'standard') {
  return (await query(`SELECT * FROM pricing_tiers WHERE name = $1`, [name])).rows[0];
}

async function applyMentor() {
  const { user, access_token } = await createUserWithToken({ full_name: 'Applicant' });
  const tier = await getTier();
  const res = await request(app)
    .post('/api/mentors/apply')
    .set('Authorization', `Bearer ${access_token}`)
    .send({ pricing_tier_id: tier.id, headline: 'h', bio: 'b' });
  const mentor_profile = await query(`SELECT * FROM mentor_profiles WHERE user_id = $1`, [user.id]);
  return { user, access_token, mentor_id: mentor_profile.rows[0].id, applyRes: res };
}

describe('Admin auth gate', () => {
  test('non-admin gets 403 on /api/admin/users', async () => {
    const { access_token } = await createUserWithToken();
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${access_token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('insufficient_role');
  });

  test('no token gets 401', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/users + PATCH /api/admin/users/:id', () => {
  test('admin can list + paginate', async () => {
    const { access_token } = await createAdminWithToken();
    await createUserWithToken({ email: 'a@t.com', full_name: 'A' });
    await createUserWithToken({ email: 'b@t.com', full_name: 'B' });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(3); // admin + 2
    expect(typeof res.body.total).toBe('number');
  });

  test('search by q (name or email)', async () => {
    const { access_token } = await createAdminWithToken();
    await createUserWithToken({ email: 'asha.kumar@t.com', full_name: 'Asha Kumar' });
    await createUserWithToken({ email: 'rohan@t.com', full_name: 'Rohan Patel' });

    const res = await request(app)
      .get('/api/admin/users?q=asha')
      .set('Authorization', `Bearer ${access_token}`);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].email).toBe('asha.kumar@t.com');
  });

  test('patch toggles is_active', async () => {
    const { access_token } = await createAdminWithToken();
    const target = await createUserWithToken({ email: 'target@t.com' });

    const res = await request(app)
      .patch(`/api/admin/users/${target.user.id}`)
      .set('Authorization', `Bearer ${access_token}`)
      .send({ is_active: false });
    expect(res.status).toBe(200);
    expect(res.body.user.is_active).toBe(false);

    // Disabled user can't login
    const login = await request(app).post('/api/auth/login').send({
      email: 'target@t.com', password: 'longenoughpw1',
    });
    expect(login.status).toBe(401);
    expect(login.body.code).toBe('account_disabled');
  });

  test('audit log records the patch', async () => {
    const { user: adminUser, access_token } = await createAdminWithToken();
    const target = await createUserWithToken({ email: 'audit@t.com' });

    await request(app)
      .patch(`/api/admin/users/${target.user.id}`)
      .set('Authorization', `Bearer ${access_token}`)
      .send({ is_active: false });

    const audit = await query(
      `SELECT * FROM admin_audit_log WHERE admin_user_id = $1 AND target_table = 'users'`,
      [adminUser.id]
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].action).toBe('patch_user');
    expect(audit.rows[0].target_id).toBe(target.user.id);
  });

  test('rejects unknown field', async () => {
    const { access_token } = await createAdminWithToken();
    const target = await createUserWithToken({ email: 'rej@t.com' });
    const res = await request(app)
      .patch(`/api/admin/users/${target.user.id}`)
      .set('Authorization', `Bearer ${access_token}`)
      .send({ email: 'newemail@t.com' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('no_editable_fields');
  });
});

describe('Mentor application approval flow', () => {
  test('admin lists pending applications', async () => {
    const { access_token: adminTok } = await createAdminWithToken();
    await applyMentor();

    const res = await request(app)
      .get('/api/admin/mentor-applications')
      .set('Authorization', `Bearer ${adminTok}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].verification_status).toBe('pending');
  });

  test('approve marks profile approved + makes it visible in public list', async () => {
    const { access_token: adminTok } = await createAdminWithToken();
    const { mentor_id } = await applyMentor();

    const res = await request(app)
      .post(`/api/admin/mentor-applications/${mentor_id}/approve`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ notes: 'Looks great' });
    expect(res.status).toBe(200);
    expect(res.body.mentor_profile.verification_status).toBe('approved');
    expect(res.body.mentor_profile.verified_at).toBeTruthy();

    // Now visible in public list
    const list = await request(app).get('/api/mentors');
    expect(list.body.items.length).toBe(1);
  });

  test('reject marks profile rejected + demotes user back to mentee', async () => {
    const { access_token: adminTok } = await createAdminWithToken();
    const { mentor_id, user } = await applyMentor();

    const res = await request(app)
      .post(`/api/admin/mentor-applications/${mentor_id}/reject`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ notes: 'Profile too thin' });
    expect(res.status).toBe(200);
    expect(res.body.mentor_profile.verification_status).toBe('rejected');

    const ur = await query(`SELECT role FROM users WHERE id = $1`, [user.id]);
    expect(ur.rows[0].role).toBe('mentee');
  });

  test('cannot approve twice (idempotency-ish error)', async () => {
    const { access_token: adminTok } = await createAdminWithToken();
    const { mentor_id } = await applyMentor();

    await request(app)
      .post(`/api/admin/mentor-applications/${mentor_id}/approve`)
      .set('Authorization', `Bearer ${adminTok}`);
    const second = await request(app)
      .post(`/api/admin/mentor-applications/${mentor_id}/approve`)
      .set('Authorization', `Bearer ${adminTok}`);
    expect(second.status).toBe(400);
    expect(second.body.code).toBe('already_decided');
  });

  test('approve writes admin audit log', async () => {
    const { user: adminUser, access_token: adminTok } = await createAdminWithToken();
    const { mentor_id } = await applyMentor();

    await request(app)
      .post(`/api/admin/mentor-applications/${mentor_id}/approve`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ notes: 'ok' });

    const audit = await query(
      `SELECT * FROM admin_audit_log WHERE admin_user_id = $1 AND action = 'approve_mentor'`,
      [adminUser.id]
    );
    expect(audit.rowCount).toBe(1);
  });
});
