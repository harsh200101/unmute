'use strict';

const svc = require('../services/paymentsService');

async function phonepe(req, res, next) {
  try {
    const result = await svc.handleWebhook({ headers: req.headers, body: req.body });
    res.json(result);
  } catch (e) { next(e); }
}

module.exports = { phonepe };
