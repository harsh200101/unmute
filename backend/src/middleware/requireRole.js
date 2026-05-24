'use strict';

const { forbidden, unauthorized } = require('../utils/errors');

// requireRole('admin') or requireRole('admin', 'mentor')
function requireRole(...roles) {
  return function (req, _res, next) {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden('insufficient_role', `Requires role: ${roles.join(' or ')}`));
    }
    return next();
  };
}

module.exports = { requireRole };
