'use strict';

const request = require('supertest');
const app = require('../src/server');
const { pool } = require('./_helpers');

afterAll(async () => {
  await pool.end().catch(() => {});
});

describe('Server smoke (phase 0)', () => {
  test('GET /healthz returns 200 + ok:true', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('unmute-backend-v2');
  });

  // Guards the config leak that motivated reporting the mailer here: this
  // endpoint is public and unauthenticated, so it must never disclose
  // credentials. Regression-tested because the field is easy to "improve"
  // into something dangerous later.
  test('GET /healthz reports mail config but never the password', async () => {
    const res = await request(app).get('/healthz');
    expect(res.body.email).toBeDefined();
    expect(res.body.email.provider).toBe('stub'); // pinned by _globalSetup
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/smtp_pass/i);
    expect(serialized).not.toContain(process.env.SMTP_PASS || '\u0000');
  });

  test('GET /readyz returns 200 + db:true when DB is reachable', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db).toBe(true);
  });

  test('GET /api/anything returns 501 (placeholder until phase 1)', async () => {
    const res = await request(app).get('/api/nothing-here');
    expect(res.status).toBe(501);
  });

  test('GET /unknown returns 404', async () => {
    const res = await request(app).get('/totally-not-a-route');
    expect(res.status).toBe(404);
  });
});
