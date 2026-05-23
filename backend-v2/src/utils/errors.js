'use strict';

// Single error class for application-level failures. Carries an HTTP status
// and a stable `code` string the frontend can switch on without parsing
// English messages.

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

const bad = (code, msg, details) => new AppError(400, code, msg, details);
const unauthorized = (code = 'unauthorized', msg = 'Authentication required') =>
  new AppError(401, code, msg);
const forbidden = (code = 'forbidden', msg = 'Not allowed') => new AppError(403, code, msg);
const notFound = (code = 'not_found', msg = 'Not found') => new AppError(404, code, msg);
const conflict = (code, msg) => new AppError(409, code, msg);
const tooMany = (msg = 'Too many requests') => new AppError(429, 'rate_limited', msg);

module.exports = { AppError, bad, unauthorized, forbidden, notFound, conflict, tooMany };
