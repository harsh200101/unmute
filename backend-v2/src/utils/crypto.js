'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

// Opaque random token (URL-safe). Stored as sha256 hash; emailed verbatim.
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Constant-time equality for short strings (defensive)
function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

module.exports = { hashPassword, verifyPassword, generateToken, hashToken, safeEqual };
