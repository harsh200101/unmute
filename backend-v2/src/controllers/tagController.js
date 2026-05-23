'use strict';

const svc = require('../services/tagService');

async function listTags(req, res, next) {
  try {
    const items = await svc.listTags({ kind: req.query.kind });
    res.json({ items });
  } catch (e) { next(e); }
}

async function listPricingTiers(_req, res, next) {
  try {
    const items = await svc.listPricingTiers();
    res.json({ items });
  } catch (e) { next(e); }
}

module.exports = { listTags, listPricingTiers };
