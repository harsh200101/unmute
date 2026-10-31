'use strict';

const svc = require('../services/paymentsService');

async function phonepe(req, res, next) {
  try {
    const result = await svc.handleWebhook({
      headers: req.headers,
      body: req.body,
      rawBody: req.rawBody,
    });
    res.json(result);
  } catch (e) { next(e); }
}

module.exports = { phonepe };
