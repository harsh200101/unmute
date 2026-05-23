'use strict';

const { AppError } = require('../utils/errors');
const env = require('../config/env');

// Final express error handler. Maps:
//   - AppError instances → status + code + message
//   - Validation errors (zod) → 400 with field details
//   - Anything else → 500 (with stack in non-prod)

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Zod
  if (err && err.name === 'ZodError' && Array.isArray(err.issues)) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'validation_error',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  // eslint-disable-next-line no-console
  console.error('[error]', err);
  res.status(500).json({
    error: env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Internal server error',
    code: 'internal_error',
    ...(env.NODE_ENV !== 'production' && err.stack ? { stack: err.stack.split('\n') } : {}),
  });
}

module.exports = { errorHandler };
