'use strict';

const svc = require('../services/kycService');

async function submit(req, res, next) {
  try {
    const result = await svc.submit({ user_id: req.user.id, payload: req.body || {} });
    res.status(201).json({ kyc: result });
  } catch (e) { next(e); }
}

async function getMine(req, res, next) {
  try {
    const result = await svc.getMine(req.user.id);
    res.json({ kyc: result });
  } catch (e) { next(e); }
}

async function adminList(req, res, next) {
  try {
    const result = await svc.adminList({
      status: req.query.status || 'pending',
      limit: req.query.limit, offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function adminApprove(req, res, next) {
  try {
    const result = await svc.approve({
      admin_user_id: req.user.id,
      kyc_id: Number(req.params.id),
      notes: req.body?.notes,
    });
    res.json({ kyc: result });
  } catch (e) { next(e); }
}

async function adminReject(req, res, next) {
  try {
    const result = await svc.reject({
      admin_user_id: req.user.id,
      kyc_id: Number(req.params.id),
      notes: req.body?.notes,
    });
    res.json({ kyc: result });
  } catch (e) { next(e); }
}

module.exports = { submit, getMine, adminList, adminApprove, adminReject };
