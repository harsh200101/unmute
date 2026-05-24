'use strict';

const users = require('../services/userService');

async function getMe(req, res, next) {
  try {
    const me = await users.getMe(req.user.id);
    res.json({ user: me });
  } catch (e) { next(e); }
}

async function patchMe(req, res, next) {
  try {
    const me = await users.updateMe(req.user.id, req.body || {});
    res.json({ user: me });
  } catch (e) { next(e); }
}

module.exports = { getMe, patchMe };
