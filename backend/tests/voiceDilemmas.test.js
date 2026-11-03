'use strict';

const request = require('supertest');
const app = require('../src/server');
const db = require('../src/config/db');
const { signAccessToken } = require('../src/utils/jwt');
const { seedReferenceData } = require('./_helpers');

describe('Voice Dilemmas Feature (Task 6)', () => {
  test('Mentee submits voice dilemma, mentor answers, wallet payouts settle correctly', async () => {
    await seedReferenceData();

    // Create mentee and mentor users
    const menteeRes = await db.query(`
      INSERT INTO users (full_name, email, role, email_verified_at)
      VALUES ('Mentee Tester', 'mentee_voice@test.com', 'mentee', NOW())
      ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, email_verified_at = NOW()
      RETURNING id, uuid, email, role, email_verified_at
    `);
    const mentee = menteeRes.rows[0];

    const mentorRes = await db.query(`
      INSERT INTO users (full_name, email, role, email_verified_at)
      VALUES ('Mentor Voice Guide', 'mentor_voice@test.com', 'mentor', NOW())
      ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, email_verified_at = NOW()
      RETURNING id, uuid, email, role, email_verified_at
    `);
    const mentor = mentorRes.rows[0];

    // Ensure wallets
    await db.query(`
      INSERT INTO wallets (user_id, kind, balance_paise)
      VALUES ($1, 'mentee', 20000)
      ON CONFLICT (user_id, kind) DO UPDATE SET balance_paise = 20000
    `, [mentee.id]);

    await db.query(`
      INSERT INTO wallets (user_id, kind, balance_paise)
      VALUES ($1, 'mentor', 0)
      ON CONFLICT (user_id, kind) DO UPDATE SET balance_paise = 0
    `, [mentor.id]);

    // Ensure mentor profile
    let tierRes = await db.query(`SELECT id FROM pricing_tiers LIMIT 1`);
    if (!tierRes.rows[0]) {
      const r = await db.query(
        `INSERT INTO pricing_tiers (name, display_name, per_minute_paise, sort_order)
         VALUES ('standard', 'Standard', 1000, 2)
         RETURNING id`
      );
      tierRes = r;
    }
    const tierId = tierRes.rows[0]?.id;
    await db.query(`
      INSERT INTO mentor_profiles (user_id, pricing_tier_id, headline, bio, verification_status)
      VALUES ($1, $2, 'Voice Mentor Headline', 'Voice Mentor Bio', 'approved')
      ON CONFLICT (user_id) DO UPDATE SET verification_status = 'approved'
    `, [mentor.id, tierId]);

    const menteeToken = signAccessToken(mentee);
    const mentorToken = signAccessToken(mentor);

    const dummyAudioBase64 = 'data:audio/webm;base64,' + Buffer.from('RIFFTESTAUDIODATA').toString('base64');

    // 1. Submit Voice Dilemma as Mentee
    const submitRes = await request(app)
      .post('/api/voice-dilemmas')
      .set('Authorization', `Bearer ${menteeToken}`)
      .send({
        mentor_user_id: mentor.id,
        title: 'Career Crossroads',
        category: 'career',
        text_notes: 'I feel stuck between two paths.',
        is_anonymous: true,
        audio_duration_seconds: 45,
        audio_base64: dummyAudioBase64,
      });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.dilemma).toBeDefined();
    expect(submitRes.body.dilemma.fee_paise).toBe(9900);
    expect(submitRes.body.dilemma.status).toBe('submitted');
    expect(submitRes.body.dilemma.is_anonymous).toBe(true);
    const dilemmaUuid = submitRes.body.dilemma.uuid;

    // Verify mentee wallet debited by ₹99 (9900 paise) -> 20000 - 9900 = 10100
    const menteeWallet = (await db.query(
      `SELECT balance_paise FROM wallets WHERE user_id = $1 AND kind = 'mentee'`,
      [mentee.id]
    )).rows[0];
    expect(menteeWallet.balance_paise).toBe(10100);

    // 2. Mentee lists dilemmas
    const menteeListRes = await request(app)
      .get('/api/voice-dilemmas/mine')
      .set('Authorization', `Bearer ${menteeToken}`);

    expect(menteeListRes.status).toBe(200);
    expect(menteeListRes.body.items.some(d => d.uuid === dilemmaUuid)).toBe(true);

    // 3. Mentor lists dilemmas
    const mentorListRes = await request(app)
      .get('/api/voice-dilemmas/mine')
      .set('Authorization', `Bearer ${mentorToken}`);

    expect(mentorListRes.status).toBe(200);
    const mentorView = mentorListRes.body.items.find(d => d.uuid === dilemmaUuid);
    expect(mentorView).toBeDefined();
    expect(mentorView.mentee_name).toBe('Anonymous Mentee'); // anonymity respected

    // 4. Mentor answers the dilemma
    const dummyMentorAudioBase64 = 'data:audio/webm;base64,' + Buffer.from('RIFFMENTORRESPONSEDATA').toString('base64');
    const answerRes = await request(app)
      .post(`/api/voice-dilemmas/${dilemmaUuid}/answer`)
      .set('Authorization', `Bearer ${mentorToken}`)
      .send({
        written_takeaway: 'Focus on what gives you energy rather than what prevents fear.',
        audio_duration_seconds: 60,
        audio_base64: dummyMentorAudioBase64,
      });

    expect(answerRes.status).toBe(200);
    expect(answerRes.body.dilemma.status).toBe('answered');
    expect(answerRes.body.dilemma.mentor_written_takeaway).toBe('Focus on what gives you energy rather than what prevents fear.');

    // 5. Verify mentor wallet credited by 70% of ₹99 = ₹69.30 (6930 paise)
    const mentorWallet = (await db.query(
      `SELECT balance_paise FROM wallets WHERE user_id = $1 AND kind = 'mentor'`,
      [mentor.id]
    )).rows[0];
    expect(mentorWallet.balance_paise).toBe(6930);

    // 6. Test Audio Endpoint
    const audioUrl = answerRes.body.dilemma.mentor_audio_url;
    const audioRes = await request(app).get(audioUrl);
    expect(audioRes.status).toBe(200);
  });
});
