'use strict';

const svc = require('../services/availabilityService');

async function getMine(req, res, next) {
  try {
    const result = await svc.getMyAvailability(req.user.id);
    res.json(result);
  } catch (e) { next(e); }
}

async function putTemplate(req, res, next) {
  try {
    const slots = await svc.replaceTemplate(req.user.id, req.body?.slots || []);
    res.json({ template: slots });
  } catch (e) { next(e); }
}

async function postOverride(req, res, next) {
  try {
    const ov = await svc.createOverride({
      mentor_user_id: req.user.id,
      slot_at: req.body?.slot_at,
      action: req.body?.action,
      reason: req.body?.reason,
    });
    res.status(201).json({ override: ov });
  } catch (e) { next(e); }
}

async function deleteOverride(req, res, next) {
  try {
    const result = await svc.deleteOverride({
      mentor_user_id: req.user.id,
      override_id: Number(req.params.id),
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function publicSlots(req, res, next) {
  try {
    const result = await svc.computeSlots({
      mentor_uuid: req.params.mentor_uuid,
      from: req.query.from,
      to: req.query.to,
    });
    res.json(result);
  } catch (e) { next(e); }
}

module.exports = { getMine, putTemplate, postOverride, deleteOverride, publicSlots };
