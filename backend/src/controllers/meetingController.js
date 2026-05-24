'use strict';

const svc = require('../services/meetingService');
const billing = require('../services/billingEngine');
const messages = require('../services/meetingMessageService');
const { query } = require('../config/db');
const { notFound } = require('../utils/errors');

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

async function billingHud(req, res, next) {
  try {
    const m = (await query(
      `SELECT m.id FROM meetings m JOIN bookings b ON b.id = m.booking_id WHERE b.uuid = $1`,
      [req.params.booking_uuid]
    )).rows[0];
    if (!m) throw notFound('meeting_not_found');
    const snap = await billing.billingSnapshot({ meeting_id: m.id, user_id: req.user.id });
    res.json(snap);
  } catch (e) { next(e); }
}

async function listMessages(req, res, next) {
  try {
    const result = await messages.list({
      booking_uuid: req.params.booking_uuid,
      user_id: req.user.id,
      since_id: req.query.since_id,
      limit: req.query.limit,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function sendMessage(req, res, next) {
  try {
    const result = await messages.send({
      booking_uuid: req.params.booking_uuid,
      user_id: req.user.id,
      body: req.body?.body,
    });
    res.status(201).json(result);
  } catch (e) { next(e); }
}

module.exports = { credentials, joined, left, end, get, billingHud, listMessages, sendMessage };

