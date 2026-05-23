'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Access tokens are short-lived JWTs carrying user identity. They are sent
// in the Authorization: Bearer header.
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, uuid: user.uuid, role: user.role, email_verified: !!user.email_verified_at },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL_SECONDS, issuer: 'unmute-v2', audience: 'unmute-app' }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { issuer: 'unmute-v2', audience: 'unmute-app' });
}

// Refresh tokens are opaque random strings (NOT JWTs). They live in the
// refresh_tokens table as a sha256 hash + expiry. The frontend stores the
// raw token in an httpOnly cookie. Rotated on every refresh.
//
// See utils/crypto.js for generateToken/hashToken.

module.exports = { signAccessToken, verifyAccessToken };
