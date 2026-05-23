'use strict';

const { forbidden, unauthorized } = require('../utils/errors');

function requireEmailVerified(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (!req.user.email_verified) {
    return next(
      forbidden('email_not_verified', 'Please verify your email before doing this')
    );
  }
  return next();
}

module.exports = { requireEmailVerified };
