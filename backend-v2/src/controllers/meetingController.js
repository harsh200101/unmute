'use strict';

const svc = require('../services/meetingService');

async function credentials(req, res, next) {
  try {
    const result = await svc.issueCredentials({
      booking_uuid: req.params.booking_uuid,
      user_id: req.user.id,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function joined(req, res, next) {
  try {
    const meeting = await svc.recordPresence({
      booking_uuid: req.params.booking_uuid,
      user_id: req.user.id,
      kind: 'joined',
    });
    res.json({ meeting });
  } catch (e) { next(e); }
}

async function left(req, res, next) {
  try {
    const meeting = await svc.recordPresence({
      booking_uuid: req.params.booking_uuid,
      user_id: req.user.id,
      kind: 'left',
    });
    res.json({ meeting });
  } catch (e) { next(e); }
}

async function end(req, res, next) {
  try {
    const meeting = await svc.endMeeting({
      booking_uuid: req.params.booking_uuid,
      user_id: req.user.id,
      reason: req.body?.reason,
    });
    res.json({ meeting });
  } catch (e) { next(e); }
}

async function get(req, res, next) {
  try {
    const meeting = await svc.getMeeting({
      booking_uuid: req.params.booking_uuid,
      user_id: req.user.id,
    });
    res.json({ meeting });
  } catch (e) { next(e); }
}

module.exports = { credentials, joined, left, end, get };
