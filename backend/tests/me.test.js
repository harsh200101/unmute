'use strict';

const request = require('supertest');
const app = require('../src/server');
const { pool, truncateAll } = require('./_helpers');

async function registerAndLogin(email = 'me@example.com') {
  await request(app).post('/api/auth/register').send({
    email, password: 'longenoughpw1', full_name: 'Me Test',
  });
  const link = (global.__SENT_EMAILS__[0].text || '').match(/(http\S+)/)?.[1];
  const m = /[?&]token=([^&\s]+)/.exec(link || '');
  await request(app).post('/api/auth/verify-email').send({ token: decodeURIComponent(m[1]) });
  const login = await request(app).post('/api/auth/login').send({
    email, password: 'longenoughpw1',
  });
  return login.body.access_token;
}

beforeEach(async () => {
  await truncateAll();
  global.__SENT_EMAILS__ = [];
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

describe('GET /api/me', () => {
  test('401 when no token', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  test('401 on garbage token', async () => {
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('invalid_token');
  });

  test('returns the user with safe fields', async () => {
    const access = await registerAndLogin();
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${access}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@example.com');
    expect(res.body.user.role).toBe('mentee');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });
});

describe('PATCH /api/me', () => {
  test('updates whitelisted fields', async () => {
    const access = await registerAndLogin();
    const res = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${access}`)
      .send({
        full_name: 'Updated Name',
        bio: 'I am a test user',
        phone: '+91-99999-99999',
        gender: 'prefer_not_to_say',
        location_city: 'Bengaluru',
        preferences: { theme: 'dark', emailDigest: 'weekly' },
      });
    expect(res.status).toBe(200);
    expect(res.body.user.full_name).toBe('Updated Name');
    expect(res.body.user.bio).toBe('I am a test user');
    expect(res.body.user.gender).toBe('prefer_not_to_say');
    expect(res.body.user.preferences).toEqual({ theme: 'dark', emailDigest: 'weekly' });
  });

  test('refuses to change email / role / verification status', async () => {
    const access = await registerAndLogin();
    const res = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${access}`)
      .send({
        email: 'hacker@example.com',
        role: 'admin',
        email_verified_at: '2020-01-01',
        full_name: 'Allowed',
      });
    expect(res.status).toBe(200);
    expect(res.body.user.full_name).toBe('Allowed');
    expect(res.body.user.email).toBe('me@example.com'); // unchanged
    expect(res.body.user.role).toBe('mentee');           // unchanged
  });

  test('invalid preferences (not an object) returns 400', async () => {
    const access = await registerAndLogin();
    const res = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${access}`)
      .send({ preferences: 'not-an-object' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_preferences');
  });

  test('empty body is a no-op (returns current user)', async () => {
    const access = await registerAndLogin();
    const res = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${access}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@example.com');
  });
});
