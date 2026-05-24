'use strict';

// Targeted rate limiters. Pickier than a single global limit because:
//   - register/login should be strict (brute force protection)
//   - forgot-password should be very strict (don't let attackers spam users)
//   - everything else is generous so the dashboard doesn't break

const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const isTest = env.NODE_ENV === 'test';

function buildLimiter({ windowMs, max, code }) {
  return rateLimit({
    windowMs,
    max: isTest ? 1_000_000 : max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'Too many requests', code });
    },
  });
}

// Strict: 10 attempts per 15 min per IP
const authStrict = buildLimiter({ windowMs: 15 * 60_000, max: 10, code: 'rate_limited_auth' });

// Very strict: 5 attempts per hour (forgot-password)
const authVeryStrict = buildLimiter({
  windowMs: 60 * 60_000,
  max: 5,
  code: 'rate_limited_password_reset',
});

// Generous: everything else
const general = buildLimiter({ windowMs: 15 * 60_000, max: 1000, code: 'rate_limited' });

module.exports = { authStrict, authVeryStrict, general };
