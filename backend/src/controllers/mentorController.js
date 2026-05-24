'use strict';

const m = require('../services/mentorService');

async function listPublic(req, res, next) {
  try {
    const result = await m.listPublic(req.query);
    res.json(result);
  } catch (e) { next(e); }
}

async function listFeatured(_req, res, next) {
  try {
    const items = await m.listFeatured();
    res.json({ items });
  } catch (e) { next(e); }
}

async function getByUuid(req, res, next) {
  try {
    const result = await m.getPublicByUuid(req.params.uuid);
    res.json({ mentor: result });
  } catch (e) { next(e); }
}

async function apply(req, res, next) {
  try {
    const result = await m.apply({ user_id: req.user.id, profile: req.body });
    res.status(201).json({ mentor: result });
  } catch (e) { next(e); }
}

async function getMine(req, res, next) {
  try {
    const result = await m.getMine(req.user.id);
    res.json({ mentor: result });
  } catch (e) { next(e); }
}

async function patchMine(req, res, next) {
  try {
    const result = await m.updateMine(req.user.id, req.body || {});
    res.json({ mentor: result });
  } catch (e) { next(e); }
}

module.exports = { listPublic, listFeatured, getByUuid, apply, getMine, patchMine };
