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

module.exports = {
  listUsers, patchUser,
  listMentorApplications, approveMentor, rejectMentor,
};
