'use strict';

const svc = require('../services/payoutService');

async function request(req, res, next) {
  try {
    const result = await svc.request({
      user_id: req.user.id,
      amount_paise: req.body?.amount_paise,
    });
    res.status(201).json({ withdrawal: result });
  } catch (e) { next(e); }
}

async function listMine(req, res, next) {
  try {
    const result = await svc.listMine({
      user_id: req.user.id,
      limit: req.query.limit, offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function adminList(req, res, next) {
  try {
    const result = await svc.adminList({
      status: req.query.status,
      limit: req.query.limit, offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function adminProcess(req, res, next) {
  try {
    const result = await svc.process({
      admin_user_id: req.user.id,
      withdrawal_id: Number(req.params.id),
      gateway_txn_id: req.body?.gateway_txn_id,
    });
    res.json({ withdrawal: result });
  } catch (e) { next(e); }
}

async function adminComplete(req, res, next) {
  try {
    const result = await svc.complete({
      admin_user_id: req.user.id,
      withdrawal_id: Number(req.params.id),
      gateway_txn_id: req.body?.gateway_txn_id,
    });
    res.json({ withdrawal: result });
  } catch (e) { next(e); }
}

async function adminFail(req, res, next) {
  try {
    const result = await svc.fail({
      admin_user_id: req.user.id,
      withdrawal_id: Number(req.params.id),
      failure_reason: req.body?.failure_reason,
    });
    res.json({ withdrawal: result });
  } catch (e) { next(e); }
}

module.exports = {
  request, listMine,
  adminList, adminProcess, adminComplete, adminFail,
};
