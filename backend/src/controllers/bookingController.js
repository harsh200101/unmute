'use strict';

const svc = require('../services/bookingService');

async function create(req, res, next) {
  try {
    const booking = await svc.createBooking({
      mentee_user_id: req.user.id,
      mentor_uuid: req.body?.mentor_uuid,
      slot_start_at: req.body?.slot_start_at,
      mentee_title: req.body?.mentee_title,
      mentee_topic: req.body?.mentee_topic,
      is_incognito: Boolean(req.body?.is_incognito),
      intent_type: req.body?.intent_type,
    });
    res.status(201).json({ booking });
  } catch (e) { next(e); }
}

async function listMine(req, res, next) {
  try {
    const result = await svc.listForUser({
      user_id: req.user.id,
      role: req.query.role,
      status: req.query.status,
      from: req.query.from,
      to: req.query.to,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function getOne(req, res, next) {
  try {
    const booking = await svc.getByUuidForUser({ user_id: req.user.id, uuid: req.params.uuid });
    res.json({ booking });
  } catch (e) { next(e); }
}

async function cancel(req, res, next) {
  try {
    const result = await svc.cancelBooking({
      user_id: req.user.id,
      uuid: req.params.uuid,
      reason: req.body?.reason,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function reschedule(req, res, next) {
  try {
    const booking = await svc.proposeReschedule({
      user_id: req.user.id,
      uuid: req.params.uuid,
      new_slot_start_at: req.body?.new_slot_start_at,
    });
    res.json({ booking });
  } catch (e) { next(e); }
}

async function acceptReschedule(req, res, next) {
  try {
    const booking = await svc.acceptReschedule({ user_id: req.user.id, uuid: req.params.uuid });
    res.json({ booking });
  } catch (e) { next(e); }
}

async function declineReschedule(req, res, next) {
  try {
    const booking = await svc.declineReschedule({ user_id: req.user.id, uuid: req.params.uuid });
    res.json({ booking });
  } catch (e) { next(e); }
}


async function createInstant(req, res, next) {
  try {
    const booking = await svc.createInstantBooking({
      mentee_user_id: req.user.id,
      mentor_uuid: req.body?.mentor_uuid,
      mentee_title: req.body?.mentee_title,
      mentee_topic: req.body?.mentee_topic,
      intent_type: req.body?.intent_type,
      is_incognito: Boolean(req.body?.is_incognito),
    });
    res.status(201).json({ booking });
  } catch (e) { next(e); }
}

module.exports = {
  create, listMine, getOne, cancel,
  reschedule, acceptReschedule, declineReschedule,
  createInstant,
};
