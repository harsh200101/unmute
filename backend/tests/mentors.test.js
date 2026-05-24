'use strict';

const request = require('supertest');
const app = require('../src/server');
const {
  pool, query, truncateAll, seedReferenceData,
  createUserWithToken,
} = require('./_helpers');

async function getTier(name = 'standard') {
  return (await query(`SELECT * FROM pricing_tiers WHERE name = $1`, [name])).rows[0];
}
async function getTagId(slug) {
  return (await query(`SELECT id FROM tags WHERE slug = $1`, [slug])).rows[0].id;
}

beforeEach(async () => {
  await truncateAll();
  await seedReferenceData();
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

describe('POST /api/mentors/apply', () => {
  test('happy path: creates pending mentor profile + bumps role + attaches tags + creates mentor wallet', async () => {
    const { user, access_token } = await createUserWithToken();
    const tier = await getTier('standard');
    const tag1 = await getTagId('career-coaching');
    const tag2 = await getTagId('fintech');

    const res = await request(app)
      .post('/api/mentors/apply')
      .set('Authorization', `Bearer ${access_token}`)
      .send({
        pricing_tier_id: tier.id,
        headline: 'Senior PM helping you break into product',
        bio: 'Decade in tech, hiring manager at FAANG.',
        languages: ['en', 'hi'],
        years_experience: 10,
        linkedin_url: 'https://linkedin.com/in/example',
        tag_ids: [tag1, tag2],
      });

    expect(res.status).toBe(201);
    expect(res.body.mentor.verification_status).toBe('pending');
    expect(res.body.mentor.pricing_tier.name).toBe('standard');
    expect(res.body.mentor.tags.map((t) => t.slug).sort()).toEqual(['career-coaching', 'fintech']);

    // Role bumped to mentor
    const ur = await query(`SELECT role FROM users WHERE id = $1`, [user.id]);
    expect(ur.rows[0].role).toBe('mentor');

    // Mentor wallet created
    const w = await query(`SELECT kind FROM wallets WHERE user_id = $1`, [user.id]);
    expect(w.rows.some((r) => r.kind === 'mentor')).toBe(true);
  });

  test('401 without token', async () => {
    const res = await request(app).post('/api/mentors/apply').send({});
    expect(res.status).toBe(401);
  });

  test('403 when email not verified', async () => {
    const { access_token } = await createUserWithToken({ email_verified_at: null });
    const res = await request(app)
      .post('/api/mentors/apply')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ pricing_tier_id: 1, headline: 'h', bio: 'b' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('email_not_verified');
  });

  test('rejects clinical language in headline or bio', async () => {
    const { access_token } = await createUserWithToken();
    const tier = await getTier();
    // Headline that implies licensed care
    const r1 = await request(app)
      .post('/api/mentors/apply')
      .set('Authorization', `Bearer ${access_token}`)
      .send({
        pricing_tier_id: tier.id,
        headline: 'Licensed therapist helping with anxiety',
        bio: 'I offer guidance.',
      });
    expect(r1.status).toBe(400);
    expect(r1.body.code).toBe('clinical_language_detected');
    expect(r1.body.error.toLowerCase()).toContain('therapist');

    // Bio that names a disorder + treatment language
    const r2 = await request(app)
      .post('/api/mentors/apply')
      .set('Authorization', `Bearer ${access_token}`)
      .send({
        pricing_tier_id: tier.id,
        headline: 'Career mentor',
        bio: 'I can diagnose and treat PTSD with CBT.',
      });
    expect(r2.status).toBe(400);
    expect(r2.body.code).toBe('clinical_language_detected');
  });

  test('rejects missing headline/bio/tier', async () => {
    const { access_token } = await createUserWithToken();
    const res = await request(app)
      .post('/api/mentors/apply')
      .set('Authorization', `Bearer ${access_token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('rejects unknown tag_ids', async () => {
    const { access_token } = await createUserWithToken();
    const tier = await getTier();
    const res = await request(app)
      .post('/api/mentors/apply')
      .set('Authorization', `Bearer ${access_token}`)
      .send({
        pricing_tier_id: tier.id,
        headline: 'h', bio: 'b',
        tag_ids: [999999],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_tag_ids');
  });

  test('rejects duplicate application', async () => {
    const { access_token } = await createUserWithToken();
    const tier = await getTier();
    await request(app)
      .post('/api/mentors/apply')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ pricing_tier_id: tier.id, headline: 'h', bio: 'b' });

    const res2 = await request(app)
      .post('/api/mentors/apply')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ pricing_tier_id: tier.id, headline: 'h2', bio: 'b2' });
    expect(res2.status).toBe(409);
    expect(res2.body.code).toBe('mentor_profile_exists');
  });
});

describe('GET /api/mentors/me + PATCH /api/mentors/me', () => {
  async function applyMentor() {
    const { user, access_token } = await createUserWithToken();
    const tier = await getTier('standard');
    await request(app)
      .post('/api/mentors/apply')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ pricing_tier_id: tier.id, headline: 'orig headline', bio: 'orig bio' });
    return { user, access_token };
  }

  test('404 when caller has no mentor profile', async () => {
    const { access_token } = await createUserWithToken();
    const res = await request(app)
      .get('/api/mentors/me')
      .set('Authorization', `Bearer ${access_token}`);
    expect(res.status).toBe(404);
  });

  test('returns own profile (pending) with status', async () => {
    const { access_token } = await applyMentor();
    const res = await request(app)
      .get('/api/mentors/me')
      .set('Authorization', `Bearer ${access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.mentor.verification_status).toBe('pending');
  });

  test('patch updates whitelisted fields', async () => {
    const { access_token } = await applyMentor();
    const newTier = await getTier('expert');
    const res = await request(app)
      .patch('/api/mentors/me')
      .set('Authorization', `Bearer ${access_token}`)
      .send({
        headline: 'updated headline',
        pricing_tier_id: newTier.id,
        years_experience: 12,
      });
    expect(res.status).toBe(200);
    expect(res.body.mentor.headline).toBe('updated headline');
    expect(res.body.mentor.pricing_tier.name).toBe('expert');
    expect(res.body.mentor.years_experience).toBe(12);
  });

  test('patch with tag_ids replaces tag set', async () => {
    const { access_token } = await applyMentor();
    const tagA = await getTagId('fintech');
    const tagB = await getTagId('edtech');
    await request(app)
      .patch('/api/mentors/me')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ tag_ids: [tagA] });

    let res = await request(app).get('/api/mentors/me').set('Authorization', `Bearer ${access_token}`);
    expect(res.body.mentor.tags.map((t) => t.slug)).toEqual(['fintech']);

    await request(app)
      .patch('/api/mentors/me')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ tag_ids: [tagB] });

    res = await request(app).get('/api/mentors/me').set('Authorization', `Bearer ${access_token}`);
    expect(res.body.mentor.tags.map((t) => t.slug)).toEqual(['edtech']);
  });

  test('patch refuses to change verification_status', async () => {
    const { access_token, user } = await applyMentor();
    await request(app)
      .patch('/api/mentors/me')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ verification_status: 'approved' });
    const u = await query(
      `SELECT verification_status FROM mentor_profiles WHERE user_id = $1`,
      [user.id]
    );
    expect(u.rows[0].verification_status).toBe('pending');
  });
});

describe('Public mentor list + detail', () => {
  async function approveMentor(user_id) {
    await query(
      `UPDATE mentor_profiles SET verification_status='approved', verified_at=NOW() WHERE user_id=$1`,
      [user_id]
    );
  }
  async function makeApprovedMentor({ name, tier_name = 'standard', tag_slugs = [] } = {}) {
    const { user, access_token } = await createUserWithToken({ full_name: name });
    const tier = await getTier(tier_name);
    const tagIds = [];
    for (const slug of tag_slugs) tagIds.push(await getTagId(slug));
    await request(app)
      .post('/api/mentors/apply')
      .set('Authorization', `Bearer ${access_token}`)
      .send({
        pricing_tier_id: tier.id,
        headline: `${name} headline`,
        bio: `${name} bio`,
        languages: ['en'],
        tag_ids: tagIds,
      });
    await approveMentor(user.id);
    return user;
  }

  test('list returns only approved mentors', async () => {
    await makeApprovedMentor({ name: 'Approved' });
    // Pending mentor — should be hidden
    const { access_token: pending } = await createUserWithToken({ email: 'pend@test.local', full_name: 'Pending' });
    const tier = await getTier();
    await request(app)
      .post('/api/mentors/apply')
      .set('Authorization', `Bearer ${pending}`)
      .send({ pricing_tier_id: tier.id, headline: 'h', bio: 'b' });

    const res = await request(app).get('/api/mentors');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].full_name).toBe('Approved');
  });

  test('filter by tier name', async () => {
    await makeApprovedMentor({ name: 'Mentor Starter', tier_name: 'starter' });
    await makeApprovedMentor({ name: 'Mentor Expert', tier_name: 'expert' });

    const res = await request(app).get('/api/mentors?tier=expert');
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].tier_name).toBe('expert');
  });

  test('filter by tag slug', async () => {
    await makeApprovedMentor({ name: 'Career mentor', tag_slugs: ['career-coaching'] });
    await makeApprovedMentor({ name: 'Fintech mentor', tag_slugs: ['fintech'] });

    const res = await request(app).get('/api/mentors?tag=fintech');
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].full_name).toBe('Fintech mentor');
  });

  test('search by q (name/headline/bio)', async () => {
    await makeApprovedMentor({ name: 'Asha Kumar' });
    await makeApprovedMentor({ name: 'Rohan Patel' });

    const res = await request(app).get('/api/mentors?q=asha');
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].full_name).toBe('Asha Kumar');
  });

  test('GET /api/mentors/:uuid returns the approved mentor', async () => {
    const u = await makeApprovedMentor({ name: 'Detail Mentor' });
    const list = await request(app).get('/api/mentors');
    const profile_uuid = list.body.items[0].profile_uuid;

    const res = await request(app).get(`/api/mentors/${profile_uuid}`);
    expect(res.status).toBe(200);
    expect(res.body.mentor.user.full_name).toBe('Detail Mentor');
    expect(res.body.mentor.user.id).toBe(u.id);
  });

  test('GET /api/mentors/:uuid 404s for pending/unknown', async () => {
    const res = await request(app).get('/api/mentors/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  test('GET /api/mentors/featured returns top-rated (max 6)', async () => {
    for (let i = 0; i < 8; i++) await makeApprovedMentor({ name: `M${i}` });
    const res = await request(app).get('/api/mentors/featured');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(6);
  });
});
