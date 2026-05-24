'use strict';

const svc = require('../services/walletService');

async function getMyBalances(req, res, next) {
  try {
    const result = await svc.getMyBalances(req.user.id);
    res.json(result);
  } catch (e) { next(e); }
}

async function listMyTransactions(req, res, next) {
  try {
    const result = await svc.listTransactions({
      user_id: req.user.id,
      kind: req.query.kind,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

module.exports = { getMyBalances, listMyTransactions };
