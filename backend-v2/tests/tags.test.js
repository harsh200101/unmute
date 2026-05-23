'use strict';

const request = require('supertest');
const app = require('../src/server');
const { pool, truncateAll, seedReferenceData } = require('./_helpers');

beforeEach(async () => {
  await truncateAll();
  await seedReferenceData();
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

describe('GET /api/pricing-tiers', () => {
  test('returns the 4 seeded tiers in sort order', async () => {
    const res = await request(app).get('/api/pricing-tiers');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(4);
    expect(res.body.items.map((t) => t.name)).toEqual(['starter', 'standard', 'expert', 'premium']);
    expect(res.body.items[0].per_minute_paise).toBe(500);
  });
});

describe('GET /api/tags', () => {
  test('returns all active tags', async () => {
    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(4);
  });

  test('filters by kind=expertise', async () => {
    const res = await request(app).get('/api/tags?kind=expertise');
    expect(res.status).toBe(200);
    expect(res.body.items.every((t) => t.kind === 'expertise')).toBe(true);
  });

  test('filters by kind=industry', async () => {
    const res = await request(app).get('/api/tags?kind=industry');
    expect(res.status).toBe(200);
    expect(res.body.items.every((t) => t.kind === 'industry')).toBe(true);
  });

  test('rejects invalid kind', async () => {
    const res = await request(app).get('/api/tags?kind=bogus');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_kind');
  });
});
