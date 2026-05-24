'use strict';

const svc = require('../services/adminService');

async function listUsers(req, res, next) {
  try {
    const result = await svc.listUsers({
      q: req.query.q,
      role: req.query.role,
      is_active:
        req.query.is_active === 'true' ? true :
        req.query.is_active === 'false' ? false : undefined,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function patchUser(req, res, next) {
  try {
    const user = await svc.patchUser({
      admin_user_id: req.user.id,
      target_id: Number(req.params.id),
      patch: req.body || {},
    });
    res.json({ user });
  } catch (e) { next(e); }
}

async function listMentorApplications(req, res, next) {
  try {
    const result = await svc.listMentorApplications({
      status: req.query.status || 'pending',
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function approveMentor(req, res, next) {
  try {
    const profile = await svc.approveMentor({
      admin_user_id: req.user.id,
      mentor_id: Number(req.params.id),
      notes: req.body?.notes,
    });
    res.json({ mentor_profile: profile });
  } catch (e) { next(e); }
}

async function rejectMentor(req, res, next) {
  try {
    const profile = await svc.rejectMentor({
      admin_user_id: req.user.id,
      mentor_id: Number(req.params.id),
      notes: req.body?.notes,
    });
    res.json({ mentor_profile: profile });
  } catch (e) { next(e); }
}

async function listActiveMeetings(req, res, next) {
  try {
    const result = await svc.listActiveMeetings({
      limit: req.query.limit, offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function forceEndMeeting(req, res, next) {
  try {
    const result = await svc.forceEndMeeting({
      admin_user_id: req.user.id,
      meeting_id: Number(req.params.id),
      reason: req.body?.reason,
    });
    res.json({ meeting: result });
  } catch (e) { next(e); }
}

async function refundBooking(req, res, next) {
  try {
    const result = await svc.refundBooking({
      admin_user_id: req.user.id,
      booking_id: Number(req.params.id),
      amount_paise: req.body?.amount_paise,
      reason: req.body?.reason,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function listAuditLog(req, res, next) {
  try {
    const result = await svc.listAuditLog({
      admin_user_id: req.query.admin_user_id ? Number(req.query.admin_user_id) : undefined,
      action: req.query.action,
      target_table: req.query.target_table,
      limit: req.query.limit, offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function getStats(_req, res, next) {
  try {
    const stats = await svc.getStats();
    res.json(stats);
  } catch (e) { next(e); }
}

async function getRecentActivity(req, res, next) {
  try {
    const result = await svc.getRecentActivity({ limit: req.query.limit });
    res.json(result);
  } catch (e) { next(e); }
}

module.exports = {
  listUsers, patchUser,
  listMentorApplications, approveMentor, rejectMentor,
  listActiveMeetings, forceEndMeeting, refundBooking, listAuditLog,
  getStats, getRecentActivity,
};
