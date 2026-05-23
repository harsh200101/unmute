'use strict';

const request = require('supertest');
const app = require('../src/server');
const { pool, query, truncateAll } = require('./_helpers');

// Extract a token (?token=...) from a verification/reset link captured in
// the email stub.
function extractToken(link) {
  const m = /[?&]token=([^&\s]+)/.exec(link || '');
  return m ? decodeURIComponent(m[1]) : null;
}

beforeEach(async () => {
  await truncateAll();
  global.__SENT_EMAILS__ = [];
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

describe('POST /api/auth/register', () => {
  test('creates an unverified user + sends verification email + creates mentee wallet', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'alice@example.com',
      password: 'correct-horse-battery-staple',
      full_name: 'Alice Example',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('alice@example.com');
    expect(res.body.user.email_verified).toBe(false);
    expect(res.body.user.role).toBe('mentee');

    // Wallet auto-created
    const w = await query(`SELECT kind, balance_paise FROM wallets WHERE user_id = $1`, [
      res.body.user.id,
    ]);
    expect(w.rows).toEqual(
      expect.arrayContaining([{ kind: 'mentee', balance_paise: 0 }])
    );

    // Verification email captured
    expect(global.__SENT_EMAILS__.length).toBe(1);
    expect(global.__SENT_EMAILS__[0].to).toBe('alice@example.com');
    expect(global.__SENT_EMAILS__[0].subject).toMatch(/verify/i);
  });

  test('rejects duplicate email (case-insensitive)', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'dup@example.com', password: 'longenoughpw1', full_name: 'A',
    });
    const res = await request(app).post('/api/auth/register').send({
      email: 'DUP@Example.com', password: 'longenoughpw1', full_name: 'B',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('email_in_use');
  });

  test('rejects short password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'short@example.com', password: 'abc', full_name: 'X',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('weak_password');
  });

  test('rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
  });
});

describe('Email verification', () => {
  test('register → verify-email → user is verified', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'verify@example.com', password: 'longenoughpw1', full_name: 'Vee',
    });

    const link = (global.__SENT_EMAILS__[0].text || '').match(/(http\S+)/)?.[1];
    const token = extractToken(link);
    expect(token).toBeTruthy();

    const res = await request(app).post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.user.email_verified).toBe(true);
  });

  test('replaying the same token fails with token_consumed', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'replay@example.com', password: 'longenoughpw1', full_name: 'R',
    });
    const link = (global.__SENT_EMAILS__[0].text || '').match(/(http\S+)/)?.[1];
    const token = extractToken(link);

    const ok = await request(app).post('/api/auth/verify-email').send({ token });
    expect(ok.status).toBe(200);

    const replay = await request(app).post('/api/auth/verify-email').send({ token });
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('token_consumed');
  });

  test('invalid token returns 400', async () => {
    const res = await request(app).post('/api/auth/verify-email').send({ token: 'bogus' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_token');
  });

  test('resend-verification is quiet for unknown emails (no enumeration)', async () => {
    const res = await request(app).post('/api/auth/resend-verification').send({
      email: 'unknown@example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(global.__SENT_EMAILS__.length).toBe(0);
  });

  test('resend-verification on a real unverified user re-issues', async () => {
    await request(app).post('/api/auth/register').send({
      email: 're@example.com', password: 'longenoughpw1', full_name: 'R',
    });
    global.__SENT_EMAILS__ = []; // clear initial verify email

    const res = await request(app).post('/api/auth/resend-verification').send({
      email: 're@example.com',
    });
    expect(res.status).toBe(200);
    expect(global.__SENT_EMAILS__.length).toBe(1);
  });
});

describe('POST /api/auth/login + refresh + logout', () => {
  async function registerAndVerify(email = 'l@example.com') {
    await request(app).post('/api/auth/register').send({
      email, password: 'longenoughpw1', full_name: 'L',
    });
    const link = (global.__SENT_EMAILS__[0].text || '').match(/(http\S+)/)?.[1];
    const token = extractToken(link);
    await request(app).post('/api/auth/verify-email').send({ token });
    global.__SENT_EMAILS__ = [];
  }

  test('login returns access_token + sets refresh cookie', async () => {
    await registerAndVerify();
    const res = await request(app).post('/api/auth/login').send({
      email: 'l@example.com', password: 'longenoughpw1',
    });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.user.email_verified).toBe(true);
    expect(res.headers['set-cookie'].some((c) => c.startsWith('unmute_refresh='))).toBe(true);
  });

  test('login fails on wrong password', async () => {
    await registerAndVerify();
    const res = await request(app).post('/api/auth/login').send({
      email: 'l@example.com', password: 'WRONG',
    });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('invalid_credentials');
  });

  test('refresh rotates the refresh token (old one is revoked)', async () => {
    await registerAndVerify();
    const login = await request(app).post('/api/auth/login').send({
      email: 'l@example.com', password: 'longenoughpw1',
    });
    const cookie = login.headers['set-cookie'].find((c) => c.startsWith('unmute_refresh='));

    const refresh1 = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(refresh1.status).toBe(200);
    expect(refresh1.body.access_token).toBeTruthy();
    const newCookie = refresh1.headers['set-cookie'].find((c) => c.startsWith('unmute_refresh='));
    expect(newCookie).toBeTruthy();
    expect(newCookie).not.toBe(cookie);

    // Old refresh now revoked
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('refresh_token_revoked');
  });

  test('logout revokes the refresh token', async () => {
    await registerAndVerify();
    const login = await request(app).post('/api/auth/login').send({
      email: 'l@example.com', password: 'longenoughpw1',
    });
    const cookie = login.headers['set-cookie'].find((c) => c.startsWith('unmute_refresh='));

    const lo = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(lo.status).toBe(200);

    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(refresh.status).toBe(401);
  });
});

describe('Password flows', () => {
  test('forgot-password is quiet for unknown email', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({
      email: 'nope@example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(global.__SENT_EMAILS__.length).toBe(0);
  });

  test('forgot → reset-password works end-to-end and revokes existing sessions', async () => {
    // Register + verify + login (to get a refresh token we'll prove gets revoked)
    await request(app).post('/api/auth/register').send({
      email: 'pw@example.com', password: 'oldpassword1', full_name: 'P',
    });
    const verifyLink = (global.__SENT_EMAILS__[0].text || '').match(/(http\S+)/)?.[1];
    await request(app).post('/api/auth/verify-email').send({ token: extractToken(verifyLink) });
    global.__SENT_EMAILS__ = [];

    const login = await request(app).post('/api/auth/login').send({
      email: 'pw@example.com', password: 'oldpassword1',
    });
    const cookie = login.headers['set-cookie'].find((c) => c.startsWith('unmute_refresh='));

    // Forgot
    const f = await request(app).post('/api/auth/forgot-password').send({ email: 'pw@example.com' });
    expect(f.status).toBe(200);
    expect(global.__SENT_EMAILS__.length).toBe(1);
    const resetLink = (global.__SENT_EMAILS__[0].text || '').match(/(http\S+)/)?.[1];
    const resetToken = extractToken(resetLink);

    // Reset
    const r = await request(app).post('/api/auth/reset-password').send({
      token: resetToken, password: 'newpassword1',
    });
    expect(r.status).toBe(200);

    // Old refresh token is now revoked
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(replay.status).toBe(401);

    // Old password fails
    const oldLogin = await request(app).post('/api/auth/login').send({
      email: 'pw@example.com', password: 'oldpassword1',
    });
    expect(oldLogin.status).toBe(401);

    // New password works
    const newLogin = await request(app).post('/api/auth/login').send({
      email: 'pw@example.com', password: 'newpassword1',
    });
    expect(newLogin.status).toBe(200);
  });

  test('change-password requires auth and verifies current_password', async () => {
    // Register + verify + login
    await request(app).post('/api/auth/register').send({
      email: 'cp@example.com', password: 'oldpassword1', full_name: 'C',
    });
    const v = (global.__SENT_EMAILS__[0].text || '').match(/(http\S+)/)?.[1];
    await request(app).post('/api/auth/verify-email').send({ token: extractToken(v) });
    const login = await request(app).post('/api/auth/login').send({
      email: 'cp@example.com', password: 'oldpassword1',
    });
    const access = login.body.access_token;

    // No auth → 401
    const noAuth = await request(app).post('/api/auth/change-password').send({
      current_password: 'oldpassword1', new_password: 'newpassword1',
    });
    expect(noAuth.status).toBe(401);

    // Wrong current → 400
    const wrong = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${access}`)
      .send({ current_password: 'WRONG', new_password: 'newpassword1' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('current_password_wrong');

    // Correct → 200
    const ok = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${access}`)
      .send({ current_password: 'oldpassword1', new_password: 'newpassword1' });
    expect(ok.status).toBe(200);

    // New password works for login
    const newLogin = await request(app).post('/api/auth/login').send({
      email: 'cp@example.com', password: 'newpassword1',
    });
    expect(newLogin.status).toBe(200);
  });
});

describe('Google OAuth (feature-gated)', () => {
  test('GET /api/auth/google returns 400 when Google not configured (test env)', async () => {
    const res = await request(app).get('/api/auth/google');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('google_not_configured');
  });

  test('GET /api/auth/google/callback returns 400 when not configured', async () => {
    const res = await request(app).get('/api/auth/google/callback');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('google_not_configured');
  });
});
