'use strict';

// Availability is modeled as:
//   - A weekly recurring `availability_template` (day_of_week + start_time_local)
//   - Per-date `availability_override` rows (action=block|add at a specific TZ-aware moment)
//
// Bookable slots over a date range are computed by:
//   1. Expanding the template across every day in [from, to], converting the
//      mentor's local times to UTC via Postgres `(date + time) AT TIME ZONE mentor_tz`.
//   2. Subtracting any 'block' overrides at the same UTC moment.
//   3. Unioning any 'add' one-off overrides in the window.
//   4. Subtracting active bookings (status in scheduled / in_call) at the same UTC moment.
//
// Slots are 60 minutes (matches the bookings_duration_check constraint).

const { query, withTransaction } = require('../config/db');
const { bad, notFound } = require('../utils/errors');

const DEFAULT_HORIZON_DAYS = 14;
const MIN_LEAD_MINUTES = 15; // bookings must start at least 15 min from now

// --- Editor APIs (mentor self-service) --------------------------------------

async function getMyAvailability(mentor_user_id) {
  const prof = await query(
    `SELECT is_available_now, available_now_until FROM mentor_profiles WHERE user_id = $1`,
    [mentor_user_id]
  );
  const tmpl = await query(
    `SELECT id, day_of_week, start_time_local, is_active
       FROM availability_template
      WHERE mentor_user_id = $1
      ORDER BY day_of_week, start_time_local`,
    [mentor_user_id]
  );
  const overrides = await query(
    `SELECT id, slot_at, action, reason, created_at
       FROM availability_override
      WHERE mentor_user_id = $1
      ORDER BY slot_at`,
    [mentor_user_id]
  );
  const p = prof.rows[0];
  const isOnline = Boolean(p?.is_available_now && (!p?.available_now_until || new Date(p.available_now_until) > new Date()));
  return {
    template: tmpl.rows,
    overrides: overrides.rows,
    is_available_now: isOnline,
    available_now_until: isOnline ? p.available_now_until : null,
  };
}

// Replace the template atomically: delete all current rows + insert the new set.
// `slots` is an array of { day_of_week (0-6), start_time_local ('HH:MM' or 'HH:MM:SS') }.
async function replaceTemplate(mentor_user_id, slots) {
  if (!Array.isArray(slots)) throw bad('invalid_payload', 'slots must be an array');
  // Validate
  for (const s of slots) {
    if (!Number.isInteger(s.day_of_week) || s.day_of_week < 0 || s.day_of_week > 6) {
      throw bad('invalid_day_of_week', 'day_of_week must be integer 0..6 (0=Sunday)');
    }
    if (typeof s.start_time_local !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(s.start_time_local)) {
      throw bad('invalid_start_time', 'start_time_local must be HH:MM or HH:MM:SS');
    }
  }
  // Dedupe (DB UNIQUE would catch this too but clearer error from app)
  const seen = new Set();
  for (const s of slots) {
    const key = `${s.day_of_week}-${s.start_time_local}`;
    if (seen.has(key)) throw bad('duplicate_slot', `Duplicate slot in payload: ${key}`);
    seen.add(key);
  }

  return withTransaction(async (client) => {
    await client.query(
      `DELETE FROM availability_template WHERE mentor_user_id = $1`,
      [mentor_user_id]
    );
    for (const s of slots) {
      await client.query(
        `INSERT INTO availability_template
           (mentor_user_id, day_of_week, start_time_local, is_active)
         VALUES ($1, $2, $3, TRUE)`,
        [mentor_user_id, s.day_of_week, s.start_time_local]
      );
    }
    const r = await client.query(
      `SELECT id, day_of_week, start_time_local, is_active
         FROM availability_template
        WHERE mentor_user_id = $1
        ORDER BY day_of_week, start_time_local`,
      [mentor_user_id]
    );
    return r.rows;
  });
}

async function createOverride({ mentor_user_id, slot_at, action, reason }) {
  if (!slot_at) throw bad('missing_slot_at', 'slot_at (ISO timestamp) is required');
  if (!['block', 'add'].includes(action)) {
    throw bad('invalid_action', "action must be 'block' or 'add'");
  }
  const when = new Date(slot_at);
  if (Number.isNaN(when.getTime())) throw bad('invalid_slot_at', 'slot_at must be a valid ISO timestamp');

  try {
    const r = await query(
      `INSERT INTO availability_override (mentor_user_id, slot_at, action, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING id, slot_at, action, reason, created_at`,
      [mentor_user_id, when.toISOString(), action, reason || null]
    );
    return r.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw bad('override_exists', 'An override of that action already exists at that time');
    }
    throw err;
  }
}

async function deleteOverride({ mentor_user_id, override_id }) {
  const r = await query(
    `DELETE FROM availability_override WHERE id = $1 AND mentor_user_id = $2 RETURNING id`,
    [override_id, mentor_user_id]
  );
  if (r.rowCount === 0) throw notFound('override_not_found');
  return { ok: true };
}

async function setAvailableNow({ mentor_user_id, enabled, duration_minutes = 60 }) {
  const isEnabled = Boolean(enabled);
  let duration = parseInt(duration_minutes, 10);
  if (isNaN(duration) || duration <= 0) {
    duration = 60;
  }
  if (isEnabled) {
    const r = await query(
      `UPDATE mentor_profiles
          SET is_available_now = TRUE,
              available_now_until = NOW() + ($2 || ' minutes')::interval
        WHERE user_id = $1
        RETURNING is_available_now, available_now_until`,
      [mentor_user_id, `${duration}`]
    );
    if (!r.rows[0]) throw notFound('mentor_not_found', 'Mentor profile not found');
    return {
      is_available_now: true,
      available_now_until: r.rows[0].available_now_until,
    };
  } else {
    const r = await query(
      `UPDATE mentor_profiles
          SET is_available_now = FALSE,
              available_now_until = NULL
        WHERE user_id = $1
        RETURNING is_available_now, available_now_until`,
      [mentor_user_id]
    );
    if (!r.rows[0]) throw notFound('mentor_not_found', 'Mentor profile not found');
    return {
      is_available_now: false,
      available_now_until: null,
    };
  }
}

// --- Public computed-slots --------------------------------------------------

async function computeSlots({ mentor_uuid, from, to }) {
  // Resolve mentor + timezone
  const m = await query(
    `SELECT mp.user_id, mp.timezone, mp.verification_status, u.is_active
       FROM mentor_profiles mp
       JOIN users u ON u.id = mp.user_id
      WHERE mp.uuid = $1`,
    [mentor_uuid]
  );
  if (!m.rows[0]) throw notFound('mentor_not_found');
  const { user_id, timezone, verification_status, is_active } = m.rows[0];
  if (verification_status !== 'approved' || !is_active) {
    // Don't reveal pending applicants
    return { slots: [], timezone };
  }

  // Defaults: from = max(now + 15m, given), to = from + 14d
  const minStart = new Date(Date.now() + MIN_LEAD_MINUTES * 60_000);
  const fromDate = from ? new Date(from) : minStart;
  if (Number.isNaN(fromDate.getTime())) throw bad('invalid_from');
  const effectiveFrom = fromDate < minStart ? minStart : fromDate;

  const horizonEnd = new Date(effectiveFrom.getTime() + DEFAULT_HORIZON_DAYS * 86400_000);
  const toDate = to ? new Date(to) : horizonEnd;
  if (Number.isNaN(toDate.getTime())) throw bad('invalid_to');
  const effectiveTo = toDate > horizonEnd ? horizonEnd : toDate;

  if (effectiveTo <= effectiveFrom) return { slots: [], timezone };

  // The big query. Expands template + applies overrides + subtracts bookings.
  //
  // Step A — template_candidates: For each calendar day in mentor's tz between
  // [from-1d, to+1d] (padding for tz boundary), generate one timestamp per
  // matching template row. The candidate is filtered to be in [from, to).
  //
  // Step B — Subtract 'block' overrides + active bookings on identical
  // timestamps; UNION 'add' overrides.
  const sql = `
    WITH
    days AS (
      SELECT generate_series(
        ($1::timestamptz AT TIME ZONE $3)::date - INTERVAL '1 day',
        ($2::timestamptz AT TIME ZONE $3)::date + INTERVAL '1 day',
        INTERVAL '1 day'
      )::date AS d
    ),
    template_candidates AS (
      SELECT (d.d::timestamp + at.start_time_local) AT TIME ZONE $3 AS slot_at
        FROM days d
        JOIN availability_template at
          ON at.mentor_user_id = $4
         AND at.is_active = TRUE
         AND EXTRACT(DOW FROM d.d)::int = at.day_of_week
    ),
    template_in_window AS (
      SELECT slot_at FROM template_candidates
       WHERE slot_at >= $1 AND slot_at < $2
    ),
    blocks AS (
      SELECT slot_at FROM availability_override
       WHERE mentor_user_id = $4 AND action = 'block'
    ),
    adds AS (
      SELECT slot_at FROM availability_override
       WHERE mentor_user_id = $4 AND action = 'add'
         AND slot_at >= $1 AND slot_at < $2
    ),
    booked AS (
      SELECT slot_start_at FROM bookings
       WHERE mentor_user_id = $4
         AND status IN ('scheduled','in_call')
    )
    SELECT slot_at FROM (
      SELECT slot_at FROM template_in_window
       WHERE slot_at NOT IN (SELECT slot_at FROM blocks)
         AND slot_at NOT IN (SELECT slot_start_at FROM booked)
      UNION
      SELECT slot_at FROM adds
       WHERE slot_at NOT IN (SELECT slot_start_at FROM booked)
    ) s
    ORDER BY slot_at
  `;

  const result = await query(sql, [
    effectiveFrom.toISOString(),
    effectiveTo.toISOString(),
    timezone,
    user_id,
  ]);

  return {
    timezone,
    from: effectiveFrom.toISOString(),
    to: effectiveTo.toISOString(),
    slots: result.rows.map((r) => r.slot_at.toISOString()),
  };
}

async function batchGetNextAvailableSlots(mentorUserIds, { horizonDays = DEFAULT_HORIZON_DAYS } = {}) {
  if (!Array.isArray(mentorUserIds) || mentorUserIds.length === 0) {
    return new Map();
  }
  const minStart = new Date(Date.now() + MIN_LEAD_MINUTES * 60_000);
  const horizonEnd = new Date(minStart.getTime() + horizonDays * 86400_000);

  const sql = `
    WITH
    mentors AS (
      SELECT mp.user_id, COALESCE(NULLIF(mp.timezone, ''), 'Asia/Kolkata') AS timezone
      FROM mentor_profiles mp
      WHERE mp.user_id = ANY($1::bigint[])
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
        ($2::timestamptz AT TIME ZONE m.timezone)::date - INTERVAL '1 day',
        ($3::timestamptz AT TIME ZONE m.timezone)::date + INTERVAL '1 day',
        INTERVAL '1 day'
      ) AS d(d)
      WHERE EXTRACT(DOW FROM d.d)::int = at.day_of_week
    ),
    template_in_window AS (
      SELECT mentor_user_id, slot_at
      FROM template_candidates
      WHERE slot_at >= $2 AND slot_at < $3
    ),
    blocks AS (
      SELECT mentor_user_id, slot_at
      FROM availability_override
      WHERE mentor_user_id = ANY($1::bigint[])
        AND action = 'block'
    ),
    adds AS (
      SELECT mentor_user_id, slot_at
      FROM availability_override
      WHERE mentor_user_id = ANY($1::bigint[])
        AND action = 'add'
        AND slot_at >= $2 AND slot_at < $3
    ),
    booked AS (
      SELECT mentor_user_id, slot_start_at
      FROM bookings
      WHERE mentor_user_id = ANY($1::bigint[])
        AND status IN ('scheduled', 'in_call')
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
    )
    SELECT mentor_user_id,
           MIN(slot_at) AS next_slot_at,
           ARRAY_AGG(slot_at ORDER BY slot_at) AS upcoming_slots
    FROM (
      SELECT mentor_user_id, slot_at
      FROM all_slots
      ORDER BY mentor_user_id, slot_at
    ) s
    GROUP BY mentor_user_id
  `;

  const result = await query(sql, [
    mentorUserIds,
    minStart.toISOString(),
    horizonEnd.toISOString(),
  ]);

  const map = new Map();
  for (const r of result.rows) {
    const next_slot_at = r.next_slot_at ? new Date(r.next_slot_at).toISOString() : null;
    const upcoming_slots = (r.upcoming_slots || []).map((s) => new Date(s).toISOString());
    const info = {
      next_slot_at,
      upcoming_slots,
      toString: () => next_slot_at || '',
    };
    map.set(r.mentor_user_id, info);
    map[r.mentor_user_id] = info;
  }
  return map;
}

module.exports = {
  getMyAvailability,
  replaceTemplate,
  createOverride,
  deleteOverride,
  setAvailableNow,
  computeSlots,
  batchGetNextAvailableSlots,
};
