'use strict';

const { verifyAccessToken } = require('../utils/jwt');
const { unauthorized } = require('../utils/errors');

// Required-auth middleware: 401 if no/bad token.
function authJwt(req, _res, next) {
  const header = req.headers.authorization || '';
  const m = /^Bearer (.+)$/.exec(header);
  if (!m) return next(unauthorized('missing_token', 'Missing Authorization Bearer token'));

  try {
    const payload = verifyAccessToken(m[1]);
    req.user = {
      id: Number(payload.sub),
      uuid: payload.uuid,
      role: payload.role,
      email_verified: !!payload.email_verified,
    };
    return next();
  } catch (err) {
    return next(unauthorized('invalid_token', 'Invalid or expired token'));
  }
}

// Soft variant: attaches req.user if a valid token is present, but doesn't
// fail when missing. Useful for "public but personalize if logged in" routes.
function authJwtOptional(req, _res, next) {
  const header = req.headers.authorization || '';
  const m = /^Bearer (.+)$/.exec(header);
  if (!m) return next();
  try {
    const payload = verifyAccessToken(m[1]);
    req.user = {
      id: Number(payload.sub),
      uuid: payload.uuid,
      role: payload.role,
      email_verified: !!payload.email_verified,
    };
  } catch (_) {
    // ignore — treat as anonymous
  }
  return next();
}

module.exports = { authJwt, authJwtOptional };
