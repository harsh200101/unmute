'use strict';

const svc = require('../services/reviewService');
const notes = require('../services/sessionNotesService');
const adminSvc = require('../services/adminService'); // for hideReview audit (not used here)
const email = require('../services/emailService');
const { query } = require('../config/db');

async function submit(req, res, next) {
  try {
    const result = await svc.submitReview({
      user_id: req.user.id,
      booking_uuid: req.params.uuid,
      rating: req.body?.rating,
      body: req.body?.body,
      is_anonymous: req.body?.is_anonymous,
    });
    // Best-effort email notification
    try {
      const b = (await query(
        `SELECT b.uuid, mu.email AS mentor_email, mu.full_name AS mentor_name,
                me.email AS mentee_email, me.full_name AS mentee_name
           FROM bookings b
           JOIN users mu ON mu.id = b.mentor_user_id
           JOIN users me ON me.id = b.mentee_user_id
          WHERE b.uuid = $1`,
        [req.params.uuid]
      )).rows[0];
      const isToMentor = result.direction === 'mentee_to_mentor';
      await email.sendEmail({
        to: isToMentor ? b.mentor_email : b.mentee_email,
        subject: isToMentor
          ? `New review from ${result.review.is_anonymous ? 'a mentee' : b.mentee_name}`
          : `Your mentor left a note on your session`,
        text: [
          `You received a ${result.review.rating}-star review:`,
          result.review.body || '(no comment)',
        ].join('\n'),
      });
    } catch (_) { /* swallow */ }
    res.status(201).json(result);
  } catch (e) { next(e); }
}

async function listForMentor(req, res, next) {
  try {
    const result = await svc.listPublicForMentor({
      mentor_uuid: req.params.uuid,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function listMyGiven(req, res, next) {
  try {
    const result = await svc.listMyGiven({
      user_id: req.user.id, limit: req.query.limit, offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function listAboutMe(req, res, next) {
  try {
    const result = await svc.listAboutMe({
      user_id: req.user.id, limit: req.query.limit, offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

// --- Session notes ---------------------------------------------------------

async function getNotes(req, res, next) {
  try {
    const result = await notes.get({ user_id: req.user.id, booking_uuid: req.params.uuid });
    res.json(result);
  } catch (e) { next(e); }
}

async function putNotes(req, res, next) {
  try {
    const result = await notes.upsert({
      user_id: req.user.id, booking_uuid: req.params.uuid, payload: req.body || {},
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function myNotesHistory(req, res, next) {
  try {
    const result = await notes.listMyHistory({
      user_id: req.user.id, limit: req.query.limit, offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

// As a mentor on the given booking, see the mentee's notes from past
// sessions with any mentor (continuity of care). 403 if caller isn't the
// mentor on the booking.
async function menteeHistoryForMentor(req, res, next) {
  try {
    const result = await notes.listMenteeHistoryForMentor({
      mentor_user_id: req.user.id,
      booking_uuid: req.params.uuid,
    });
    res.json(result);
  } catch (e) { next(e); }
}

// --- Admin ----------------------------------------------------------------

async function adminHide(req, res, next) {
  try {
    const r = await svc.hideReview({
      admin_user_id: req.user.id,
      review_id: Number(req.params.id),
      reason: req.body?.reason,
    });
    res.json({ review: r });
  } catch (e) { next(e); }
}

module.exports = {
  submit, listForMentor, listMyGiven, listAboutMe,
  getNotes, putNotes, myNotesHistory, menteeHistoryForMentor,
  adminHide,
};
