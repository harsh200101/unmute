'use strict';

const svc = require('../services/notificationService');

async function list(req, res, next) {
  try {
    const result = await svc.list({
      user_id: req.user.id,
      unread_only: req.query.unread === 'true',
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function unreadCount(req, res, next) {
  try {
    const n = await svc.unreadCount(req.user.id);
    res.json({ unread: n });
  } catch (e) { next(e); }
}

async function markRead(req, res, next) {
  try {
    const result = await svc.markRead({
      user_id: req.user.id,
      notification_id: Number(req.params.id),
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function markAllRead(req, res, next) {
  try {
    const result = await svc.markAllRead(req.user.id);
    res.json(result);
  } catch (e) { next(e); }
}

module.exports = { list, unreadCount, markRead, markAllRead };
