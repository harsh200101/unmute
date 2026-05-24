'use strict';

const { query, withTransaction } = require('../config/db');
const { bad, conflict, notFound, forbidden } = require('../utils/errors');
const notify = require('./notificationService');

// --- Submit ----------------------------------------------------------------

async function submitReview({ user_id, booking_uuid, rating, body, is_anonymous }) {
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) {
    throw bad('invalid_rating', 'rating must be an integer 1..5');
  }

  return withTransaction(async (client) => {
    const bRes = await client.query(`SELECT * FROM bookings WHERE uuid = $1 FOR UPDATE`, [booking_uuid]);
    const booking = bRes.rows[0];
    if (!booking) throw notFound('booking_not_found');

    const role = booking.mentor_user_id === user_id ? 'mentor'
              : booking.mentee_user_id === user_id ? 'mentee' : null;
    if (!role) throw forbidden('not_a_party');

    // Only reviewable after a completed session. (No-shows and cancelled
    // bookings cannot be reviewed.)
    if (booking.status !== 'completed') {
      throw bad('not_reviewable', `Booking is ${booking.status}; can only review completed sessions`);
    }

    const direction = role === 'mentee' ? 'mentee_to_mentor' : 'mentor_to_mentee';
    const reviewer_user_id = user_id;
    const reviewee_user_id = role === 'mentee' ? booking.mentor_user_id : booking.mentee_user_id;
    const anon = direction === 'mentee_to_mentor' ? !!is_anonymous : false;

    try {
      const ins = await client.query(
        `INSERT INTO reviews
           (booking_id, reviewer_user_id, reviewee_user_id, direction, rating, body, is_anonymous)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [booking.id, reviewer_user_id, reviewee_user_id, direction, r, body || null, anon]
      );
      await notify.notify({
        client,
        user_id: reviewee_user_id,
        kind: 'review_received',
        title: `You received a ${r}-star review`,
        body: body ? body.slice(0, 200) : null,
        link_url: '/me/reviews/received',
        reference_table: 'reviews',
        reference_id: ins.rows[0].id,
        send_email: true,
      });
      return { review: publicReview(ins.rows[0], { include_internal: true }), direction };
    } catch (err) {
      if (err.code === '23505') {
        throw conflict('review_exists', 'You have already reviewed this session');
      }
      throw err;
    }
  });
}

// --- Public list (mentee → mentor reviews shown on a mentor profile) -------

async function listPublicForMentor({ mentor_uuid, limit = 20, offset = 0 }) {
  const limitN = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const offsetN = Math.max(Number(offset) || 0, 0);

  const m = await query(
    `SELECT user_id FROM mentor_profiles WHERE uuid = $1 AND verification_status = 'approved'`,
    [mentor_uuid]
  );
  if (!m.rows[0]) throw notFound('mentor_not_found');

  const rows = await query(
    `SELECT r.*, u.full_name AS reviewer_name, u.avatar_url AS reviewer_avatar
       FROM reviews r
       JOIN users u ON u.id = r.reviewer_user_id
      WHERE r.reviewee_user_id = $1
        AND r.direction = 'mentee_to_mentor'
        AND r.is_hidden = FALSE
      ORDER BY r.created_at DESC
      LIMIT ${limitN} OFFSET ${offsetN}`,
    [m.rows[0].user_id]
  );

  const total = await query(
    `SELECT COUNT(*)::int AS n FROM reviews
      WHERE reviewee_user_id = $1
        AND direction = 'mentee_to_mentor'
        AND is_hidden = FALSE`,
    [m.rows[0].user_id]
  );

  return {
    items: rows.rows.map((r) => publicReview(r, { strip_reviewer_if_anonymous: true })),
    total: total.rows[0].n,
    limit: limitN,
    offset: offsetN,
  };
}

// --- "Reviews I've given" + "Reviews about me" -----------------------------

async function listMyGiven({ user_id, limit = 50, offset = 0 }) {
  const limitN = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);
  const rows = await query(
    `SELECT r.*, u.full_name AS reviewee_name, u.avatar_url AS reviewee_avatar
       FROM reviews r
       JOIN users u ON u.id = r.reviewee_user_id
      WHERE r.reviewer_user_id = $1
      ORDER BY r.created_at DESC
      LIMIT ${limitN} OFFSET ${offsetN}`,
    [user_id]
  );
  return { items: rows.rows.map((r) => publicReview(r, { include_internal: true })), limit: limitN, offset: offsetN };
}

async function listAboutMe({ user_id, limit = 50, offset = 0 }) {
  const limitN = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);
  // Returns BOTH directions of reviews about the caller. For mentors:
  // mentee_to_mentor (public) — they can see ratings + text + reviewer
  // For mentees: mentor_to_mentee (private) — only their own mentor's score is visible
  const rows = await query(
    `SELECT r.*, u.full_name AS reviewer_name, u.avatar_url AS reviewer_avatar
       FROM reviews r
       JOIN users u ON u.id = r.reviewer_user_id
      WHERE r.reviewee_user_id = $1
      ORDER BY r.created_at DESC
      LIMIT ${limitN} OFFSET ${offsetN}`,
    [user_id]
  );
  return {
    items: rows.rows.map((r) => publicReview(r, {
      strip_reviewer_if_anonymous: true,
      include_internal: true,
    })),
    limit: limitN,
    offset: offsetN,
  };
}

// --- Admin: hide / unhide --------------------------------------------------

async function hideReview({ admin_user_id, review_id, reason }) {
  return withTransaction(async (client) => {
    const before = await client.query(`SELECT * FROM reviews WHERE id = $1`, [review_id]);
    if (!before.rows[0]) throw notFound('review_not_found');
    const after = await client.query(
      `UPDATE reviews SET is_hidden = TRUE, hidden_by_user_id = $1, hidden_reason = $2
        WHERE id = $3 RETURNING *`,
      [admin_user_id, reason || null, review_id]
    );
    await client.query(
      `INSERT INTO admin_audit_log
         (admin_user_id, action, target_table, target_id, before_state, after_state, notes)
       VALUES ($1, 'hide_review', 'reviews', $2, $3, $4, $5)`,
      [admin_user_id, review_id, before.rows[0], after.rows[0], reason || null]
    );
    return publicReview(after.rows[0], { include_internal: true });
  });
}

// --- Helpers ---------------------------------------------------------------

function publicReview(r, opts = {}) {
  const anonymize = opts.strip_reviewer_if_anonymous && r.is_anonymous && r.direction === 'mentee_to_mentor';
  return {
    uuid: r.uuid,
    booking_id: r.booking_id,
    direction: r.direction,
    rating: r.rating,
    body: r.body,
    is_anonymous: r.is_anonymous,
    reviewer: anonymize
      ? { full_name: 'Anonymous', avatar_url: null }
      : { id: r.reviewer_user_id, full_name: r.reviewer_name, avatar_url: r.reviewer_avatar },
    reviewee: r.reviewee_user_id
      ? (r.reviewee_name ? { id: r.reviewee_user_id, full_name: r.reviewee_name, avatar_url: r.reviewee_avatar } : { id: r.reviewee_user_id })
      : null,
    created_at: r.created_at,
    ...(opts.include_internal ? { is_hidden: r.is_hidden, hidden_reason: r.hidden_reason } : {}),
  };
}

module.exports = {
  submitReview,
  listPublicForMentor,
  listMyGiven,
  listAboutMe,
  hideReview,
};
