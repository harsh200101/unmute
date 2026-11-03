'use strict';

const { query, withTransaction } = require('../config/db');
const { bad, conflict, notFound, forbidden } = require('../utils/errors');
const email = require('./emailService');
const notifications = require('./notificationService');
const availability = require('./availabilityService');

// --- Mentor language guardrails -------------------------------------------
//
// unmute is a peer mentoring + guidance platform, not licensed care.
// Mentor profiles must avoid clinical / diagnostic / treatment language so
// users (and we) aren't misled about what the platform provides.
//
// The list is matched as case-insensitive whole-word regex against the
// headline + bio. If any banned term is found, the submission is rejected
// with a structured error that names the offending words so the mentor
// can rephrase. This is enforced on both apply() and updateMine().

const BANNED_TERMS = [
  // Practitioner titles that imply licensure
  'licensed therapist', 'licensed counsellor', 'licensed counselor',
  'licensed psychologist', 'licensed psychiatrist', 'licensed clinician',
  'clinical psychologist', 'clinical psychiatrist',
  'psychiatrist', 'psychotherapist',
  // Clinical practice language
  'therapy', 'therapist', 'therapies', 'therapeutic',
  'psychotherapy', 'psychiatry', 'counseling', 'counselling',
  'diagnose', 'diagnosis', 'diagnostic',
  'treat', 'treatment', 'cure', 'heal you', 'medication',
  'prescription', 'prescribe', 'prescribed',
  // Clinical method labels
  'cbt', 'dbt', 'emdr', 'ect',
  // Disorder labels
  'ptsd', 'ocd', 'adhd', 'bipolar', 'schizophren', 'depression disorder',
  'anxiety disorder',
];

function detectBannedLanguage(textFields) {
  const found = new Set();
  for (const field of textFields) {
    if (!field) continue;
    const haystack = String(field).toLowerCase();
    for (const term of BANNED_TERMS) {
      // Whole-word(ish) match: surround with non-letter boundaries.
      // We allow inside-word matches only for compound terms (no spaces).
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = term.includes(' ')
        ? new RegExp(escaped, 'i')
        : new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i');
      if (re.test(haystack)) found.add(term);
    }
  }
  return [...found];
}

function ensureCleanMentorLanguage({ headline, bio }) {
  const offending = detectBannedLanguage([headline, bio]);
  if (offending.length > 0) {
    throw bad(
      'clinical_language_detected',
      `Mentor profiles can't use licensed-care / clinical language. ` +
      `Please rephrase the following: ${offending.join(', ')}. ` +
      `unmute is peer mentorship & guidance, not therapy.`
    );
  }
}

// --- Apply (mentee → mentor) ------------------------------------------------

// Tell every active admin (plus anything in ADMIN_NOTIFY_EMAILS) that a new
// mentor application arrived. Fire-and-forget: a mail failure must never fail
// the application itself, so every step is caught and logged.
async function notifyAdminsOfApplication({ user_id, profile }) {
  try {
    const u = (await query(`SELECT full_name, email FROM users WHERE id = $1`, [user_id])).rows[0];
    const tier = (await query(
      `SELECT display_name, per_minute_paise FROM pricing_tiers WHERE id = $1`,
      [profile.pricing_tier_id]
    )).rows[0];
    const tagIds = Array.isArray(profile.tag_ids) ? profile.tag_ids.map(Number).filter(Boolean) : [];
    const tags = tagIds.length
      ? (await query(`SELECT display_name FROM tags WHERE id = ANY($1::bigint[])`, [tagIds])).rows.map((r) => r.display_name)
      : [];
    const admins = (await query(
      `SELECT id, email FROM users
        WHERE role = 'admin' AND is_active = TRUE AND email NOT LIKE '%@unmute.internal'`
    )).rows;
    const extra = (process.env.ADMIN_NOTIFY_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const recipients = [...new Set([...admins.map((a) => a.email), ...extra].map((e) => e.toLowerCase()))];

    const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const link = `${base}/admin?tab=apps`;
    const rate_label = tier ? `${tier.display_name} (Rs ${tier.per_minute_paise / 100}/min)` : '-';

    for (const to of recipients) {
      try {
        await email.sendEmail(email.mentorApplicationAdminEmail({
          to,
          applicant_name: u?.full_name,
          applicant_email: u?.email,
          headline: profile.headline,
          bio: profile.bio,
          years_experience: profile.years_experience,
          languages: profile.languages,
          rate_label,
          tags,
          link,
        }));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[mentor-apply] admin email failed for', to, e.message);
      }
    }
    for (const a of admins) {
      await notifications.notify({
        user_id: a.id,
        kind: 'mentor_application',
        title: `New mentor application: ${u?.full_name || u?.email}`,
        body: profile.headline || null,
        link_url: '/admin?tab=apps',
      });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[mentor-apply] admin notify failed:', e.message);
  }
}

async function apply({ user_id, profile }) {
  if (!profile) throw bad('missing_profile');
  const required = ['pricing_tier_id', 'headline', 'bio'];
  for (const f of required) {
    if (!profile[f]) throw bad('missing_field', `${f} is required`);
  }
  ensureCleanMentorLanguage({ headline: profile.headline, bio: profile.bio });

  const assembled = await withTransaction(async (client) => {
    // Verify pricing tier exists + active
    const tier = await client.query(
      `SELECT id FROM pricing_tiers WHERE id = $1 AND is_active = TRUE`,
      [profile.pricing_tier_id]
    );
    if (!tier.rows[0]) throw bad('invalid_pricing_tier');

    // Validate tag_ids if provided
    const tagIds = Array.isArray(profile.tag_ids) ? profile.tag_ids.map(Number).filter(Boolean) : [];
    if (tagIds.length) {
      const t = await client.query(
        `SELECT id FROM tags WHERE id = ANY($1::bigint[]) AND is_active = TRUE`,
        [tagIds]
      );
      if (t.rowCount !== tagIds.length) throw bad('invalid_tag_ids');
    }

    // Check if a mentor profile already exists
    const existing = await client.query(
      `SELECT id, verification_status FROM mentor_profiles WHERE user_id = $1`,
      [user_id]
    );
    if (existing.rows[0]) {
      throw conflict('mentor_profile_exists', `You already have a mentor profile (status: ${existing.rows[0].verification_status})`);
    }

    // Bump user.role to 'mentor'
    await client.query(`UPDATE users SET role = 'mentor' WHERE id = $1`, [user_id]);

    // Insert the profile (verification_status defaults to 'pending')
    const res = await client.query(
      `INSERT INTO mentor_profiles
         (user_id, pricing_tier_id, headline, bio, languages,
          years_experience, linkedin_url, video_intro_url, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        user_id,
        profile.pricing_tier_id,
        profile.headline,
        profile.bio,
        profile.languages || ['en'],
        profile.years_experience || 0,
        profile.linkedin_url || null,
        profile.video_intro_url || null,
        profile.timezone || 'Asia/Kolkata',
      ]
    );
    const mentor = res.rows[0];

    // Attach tags
    for (const tid of tagIds) {
      await client.query(
        `INSERT INTO mentor_tags (mentor_user_id, tag_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [user_id, tid]
      );
    }

    // Create mentor wallet
    await client.query(
      `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentor', 0)
       ON CONFLICT (user_id, kind) DO NOTHING`,
      [user_id]
    );

    return assemble(client, mentor);
  });

  // Committed: now alert admins (not awaited, never blocks the response).
  notifyAdminsOfApplication({ user_id, profile }).catch(() => {});
  return assembled;
}

// --- Get my mentor profile --------------------------------------------------

async function getMine(user_id) {
  const r = await query(`SELECT * FROM mentor_profiles WHERE user_id = $1`, [user_id]);
  if (!r.rows[0]) throw notFound('no_mentor_profile', "You don't have a mentor profile");
  return assemble(null, r.rows[0]);
}

// --- Patch my mentor profile ------------------------------------------------

const SELF_EDITABLE = new Set([
  'pricing_tier_id', 'headline', 'bio', 'languages',
  'years_experience', 'linkedin_url', 'video_intro_url', 'timezone',
]);

async function updateMine(user_id, patch = {}) {
  // Re-validate clinical-language guardrails whenever headline or bio is
  // touched. We compare against the *new* effective values (falling back to
  // current row if not in patch), so partial updates can't sneak banned
  // language past us.
  if ('headline' in patch || 'bio' in patch) {
    const cur = await query(`SELECT headline, bio FROM mentor_profiles WHERE user_id = $1`, [user_id]);
    const effective_headline = 'headline' in patch ? patch.headline : cur.rows[0]?.headline;
    const effective_bio      = 'bio'      in patch ? patch.bio      : cur.rows[0]?.bio;
    ensureCleanMentorLanguage({ headline: effective_headline, bio: effective_bio });
  }
  return withTransaction(async (client) => {
    const cur = await client.query(
      `SELECT * FROM mentor_profiles WHERE user_id = $1 FOR UPDATE`,
      [user_id]
    );
    if (!cur.rows[0]) throw notFound('no_mentor_profile');

    const keys = Object.keys(patch).filter((k) => SELF_EDITABLE.has(k));

    if (keys.includes('pricing_tier_id')) {
      const t = await client.query(
        `SELECT id FROM pricing_tiers WHERE id = $1 AND is_active = TRUE`,
        [patch.pricing_tier_id]
      );
      if (!t.rows[0]) throw bad('invalid_pricing_tier');
    }

    if (keys.length) {
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const values = keys.map((k) => patch[k]);
      await client.query(
        `UPDATE mentor_profiles SET ${sets} WHERE user_id = $1`,
        [user_id, ...values]
      );
    }

    // Replace tags if tag_ids is provided
    if (Array.isArray(patch.tag_ids)) {
      const tagIds = patch.tag_ids.map(Number).filter(Boolean);
      if (tagIds.length) {
        const t = await client.query(
          `SELECT id FROM tags WHERE id = ANY($1::bigint[]) AND is_active = TRUE`,
          [tagIds]
        );
        if (t.rowCount !== tagIds.length) throw bad('invalid_tag_ids');
      }
      await client.query(`DELETE FROM mentor_tags WHERE mentor_user_id = $1`, [user_id]);
      for (const tid of tagIds) {
        await client.query(
          `INSERT INTO mentor_tags (mentor_user_id, tag_id) VALUES ($1, $2)`,
          [user_id, tid]
        );
      }
    }

    const r = await client.query(`SELECT * FROM mentor_profiles WHERE user_id = $1`, [user_id]);
    return assemble(client, r.rows[0]);
  });
}

// --- Public list with filters -----------------------------------------------

async function listPublic({ q, tier, language, tag, gender, available_now, limit = 20, offset = 0 } = {}) {
  const limitN = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const offsetN = Math.max(Number(offset) || 0, 0);

  const params = [];
  const where = [`m.verification_status = 'approved'`, `u.is_active = TRUE`];

  if (q) {
    params.push(`%${q}%`);
    where.push(`(u.full_name ILIKE $${params.length} OR m.headline ILIKE $${params.length} OR m.bio ILIKE $${params.length})`);
  }
  if (tier) {
    params.push(tier);
    where.push(`pt.name = $${params.length}`);
  }
  if (language) {
    params.push(language);
    where.push(`$${params.length} = ANY(m.languages)`);
  }
  if (available_now === true || available_now === 'true' || available_now === '1') {
    where.push(`(m.is_available_now = TRUE AND (m.available_now_until IS NULL OR m.available_now_until > NOW()))`);
  }
  if (gender) {
    params.push(gender);
    where.push(`u.gender = $${params.length}`);
  }
  if (tag) {
    params.push(tag);
    where.push(`EXISTS (
      SELECT 1 FROM mentor_tags mt JOIN tags tg ON tg.id = mt.tag_id
      WHERE mt.mentor_user_id = u.id AND tg.slug = $${params.length}
    )`);
  }

  const sql = `
    SELECT u.id          AS user_id,
           u.uuid        AS user_uuid,
           u.full_name,
           u.avatar_url,
           u.gender,
           u.location_city,
           u.location_country,
           m.uuid        AS profile_uuid,
           m.headline,
           m.bio,
           m.languages,
           m.years_experience,
           m.linkedin_url,
           m.video_intro_url,
           m.timezone,
           m.rating_avg,
           m.rating_count,
           m.is_available_now,
           m.available_now_until,
           pt.name           AS tier_name,
           pt.display_name   AS tier_display,
           pt.per_minute_paise
      FROM mentor_profiles m
      JOIN users u           ON u.id = m.user_id
      JOIN pricing_tiers pt  ON pt.id = m.pricing_tier_id
     WHERE ${where.join(' AND ')}
     ORDER BY (CASE WHEN m.is_available_now = TRUE AND (m.available_now_until IS NULL OR m.available_now_until > NOW()) THEN 1 ELSE 0 END) DESC, m.rating_avg DESC, m.rating_count DESC, u.full_name ASC
     LIMIT ${limitN} OFFSET ${offsetN}`;

  const rows = (await query(sql, params)).rows;
  // Attach tags & next_slot_at per row in single batch queries
  if (rows.length) {
    const ids = rows.map((r) => r.user_id);
    const [tags, availabilityMap] = await Promise.all([
      query(
        `SELECT mt.mentor_user_id, t.id, t.slug, t.display_name, t.kind
           FROM mentor_tags mt JOIN tags t ON t.id = mt.tag_id
          WHERE mt.mentor_user_id = ANY($1::bigint[]) AND t.is_active = TRUE`,
        [ids]
      ),
      availability.batchGetNextAvailableSlots(ids),
    ]);
    const byUser = new Map();
    for (const t of tags.rows) {
      if (!byUser.has(t.mentor_user_id)) byUser.set(t.mentor_user_id, []);
      byUser.get(t.mentor_user_id).push({ id: t.id, slug: t.slug, display_name: t.display_name, kind: t.kind });
    }
    for (const r of rows) {
      r.tags = byUser.get(r.user_id) || [];
      const avail = availabilityMap.get ? availabilityMap.get(r.user_id) : availabilityMap[r.user_id];
      r.next_slot_at = avail?.next_slot_at || (typeof avail === 'string' ? avail : null);
      r.is_available_now = Boolean(r.is_available_now && (!r.available_now_until || new Date(r.available_now_until) > new Date()));
    }
  }

  for (const r of rows) {
    r.is_available_now = Boolean(r.is_available_now && (!r.available_now_until || new Date(r.available_now_until) > new Date()));
  }
  return { items: rows, limit: limitN, offset: offsetN };
}

async function listFeatured() {
  const res = await listPublic({ limit: 6 });
  return res.items;
}

async function getPublicByUuid(uuid) {
  const r = await query(`SELECT * FROM mentor_profiles WHERE uuid = $1`, [uuid]);
  if (!r.rows[0]) throw notFound('mentor_not_found');
  if (r.rows[0].verification_status !== 'approved') {
    throw notFound('mentor_not_found');
  }
  return assemble(null, r.rows[0]);
}

// --- Internal: assemble a full mentor object (profile + user + tier + tags) -

async function assemble(clientOrNull, profile) {
  const exec = (text, params) =>
    clientOrNull ? clientOrNull.query(text, params) : query(text, params);

  const u = await exec(
    `SELECT id, uuid, full_name, avatar_url, email, gender, location_city, location_country
       FROM users WHERE id = $1`,
    [profile.user_id]
  );
  const tier = await exec(
    `SELECT id, name, display_name, per_minute_paise
       FROM pricing_tiers WHERE id = $1`,
    [profile.pricing_tier_id]
  );
  const tags = await exec(
    `SELECT t.id, t.slug, t.display_name, t.kind
       FROM mentor_tags mt JOIN tags t ON t.id = mt.tag_id
      WHERE mt.mentor_user_id = $1 AND t.is_active = TRUE
      ORDER BY t.kind, t.display_name`,
    [profile.user_id]
  );
  return {
    uuid: profile.uuid,
    user: u.rows[0],
    headline: profile.headline,
    bio: profile.bio,
    languages: profile.languages,
    years_experience: profile.years_experience,
    linkedin_url: profile.linkedin_url,
    video_intro_url: profile.video_intro_url,
    timezone: profile.timezone,
    verification_status: profile.verification_status,
    rating_avg: profile.rating_avg,
    rating_count: profile.rating_count,
    is_available_now: Boolean(profile.is_available_now && (!profile.available_now_until || new Date(profile.available_now_until) > new Date())),
    available_now_until: profile.available_now_until || null,
    pricing_tier: tier.rows[0],
    tags: tags.rows,
    created_at: profile.created_at,
  };
}

async function listUpcomingAvailability({ limit = 10, horizonDays = 7 } = {}) {
  const limitN = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const horizonN = Math.min(Math.max(Number(horizonDays) || 7, 1), 30);
  const minStart = new Date(Date.now() + 15 * 60_000);
  const horizonEnd = new Date(minStart.getTime() + horizonN * 86400_000);

  const sql = `
    WITH
    mentors AS (
      SELECT mp.user_id, COALESCE(NULLIF(mp.timezone, ''), 'Asia/Kolkata') AS timezone
      FROM mentor_profiles mp
      JOIN users u ON u.id = mp.user_id
      WHERE mp.verification_status = 'approved' AND u.is_active = TRUE
    ),
    template_candidates AS (
      SELECT
        m.user_id AS mentor_user_id,
        (d.d::timestamp + at.start_time_local) AT TIME ZONE m.timezone AS slot_at
      FROM mentors m
      JOIN availability_template at
        ON at.mentor_user_id = m.user_id
       AND at.is_active = TRUE
      CROSS JOIN LATERAL generate_series(
        ($1::timestamptz AT TIME ZONE m.timezone)::date - INTERVAL '1 day',
        ($2::timestamptz AT TIME ZONE m.timezone)::date + INTERVAL '1 day',
        INTERVAL '1 day'
      ) AS d(d)
      WHERE EXTRACT(DOW FROM d.d)::int = at.day_of_week
    ),
    template_in_window AS (
      SELECT mentor_user_id, slot_at
      FROM template_candidates
      WHERE slot_at >= $1 AND slot_at < $2
    ),
    blocks AS (
      SELECT ao.mentor_user_id, ao.slot_at
      FROM availability_override ao
      JOIN mentors m ON m.user_id = ao.mentor_user_id
      WHERE ao.action = 'block'
    ),
    adds AS (
      SELECT ao.mentor_user_id, ao.slot_at
      FROM availability_override ao
      JOIN mentors m ON m.user_id = ao.mentor_user_id
      WHERE ao.action = 'add'
        AND ao.slot_at >= $1 AND ao.slot_at < $2
    ),
    booked AS (
      SELECT b.mentor_user_id, b.slot_start_at
      FROM bookings b
      JOIN mentors m ON m.user_id = b.mentor_user_id
      WHERE b.status IN ('scheduled', 'in_call')
    ),
    all_slots AS (
      SELECT mentor_user_id, slot_at
      FROM template_in_window
      WHERE (mentor_user_id, slot_at) NOT IN (SELECT mentor_user_id, slot_at FROM blocks)
        AND (mentor_user_id, slot_at) NOT IN (SELECT mentor_user_id, slot_start_at FROM booked)
      UNION
      SELECT mentor_user_id, slot_at
      FROM adds
      WHERE (mentor_user_id, slot_at) NOT IN (SELECT mentor_user_id, slot_start_at FROM booked)
    ),
    earliest_per_mentor AS (
      SELECT mentor_user_id,
             MIN(slot_at) AS next_slot_at,
             ARRAY_AGG(slot_at ORDER BY slot_at) AS upcoming_slots
      FROM (
        SELECT mentor_user_id, slot_at
        FROM all_slots
        ORDER BY mentor_user_id, slot_at
      ) s
      GROUP BY mentor_user_id
    )
    SELECT u.id AS user_id,
           u.uuid AS user_uuid,
           u.full_name,
           u.avatar_url,
           u.gender,
           u.location_city,
           u.location_country,
           m.uuid AS profile_uuid,
           m.headline,
           m.bio,
           m.languages,
           m.years_experience,
           m.linkedin_url,
           m.video_intro_url,
           m.timezone,
           m.rating_avg,
           m.rating_count,
           m.is_available_now,
           m.available_now_until,
           pt.name AS tier_name,
           pt.display_name AS tier_display,
           pt.per_minute_paise,
           epm.next_slot_at,
           epm.upcoming_slots AS slots
    FROM earliest_per_mentor epm
    JOIN mentor_profiles m ON m.user_id = epm.mentor_user_id
    JOIN users u ON u.id = m.user_id
    JOIN pricing_tiers pt ON pt.id = m.pricing_tier_id
    WHERE m.verification_status = 'approved' AND u.is_active = TRUE
    ORDER BY epm.next_slot_at ASC, m.rating_avg DESC, u.full_name ASC
    LIMIT $3
  `;

  const rows = (await query(sql, [minStart.toISOString(), horizonEnd.toISOString(), limitN])).rows;

  if (rows.length) {
    const ids = rows.map((r) => r.user_id);
    const tags = await query(
      `SELECT mt.mentor_user_id, t.id, t.slug, t.display_name, t.kind
         FROM mentor_tags mt JOIN tags t ON t.id = mt.tag_id
        WHERE mt.mentor_user_id = ANY($1::bigint[]) AND t.is_active = TRUE`,
      [ids]
    );
    const byUser = new Map();
    for (const t of tags.rows) {
      if (!byUser.has(t.mentor_user_id)) byUser.set(t.mentor_user_id, []);
      byUser.get(t.mentor_user_id).push({ id: t.id, slug: t.slug, display_name: t.display_name, kind: t.kind });
    }
    for (const r of rows) {
      r.tags = byUser.get(r.user_id) || [];
      r.next_slot_at = r.next_slot_at ? new Date(r.next_slot_at).toISOString() : null;
      r.slots = (r.slots || []).map((s) => new Date(s).toISOString());
    }
  }

  return rows;
}

module.exports = {
  apply,
  getMine,
  updateMine,
  listPublic,
  listFeatured,
  getPublicByUuid,
  batchGetNextAvailableSlots: availability.batchGetNextAvailableSlots,
  listUpcomingAvailability,
};
