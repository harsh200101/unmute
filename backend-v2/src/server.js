'use strict';

// Phase 0 server stub. The only live endpoints are /healthz and /readyz so
// we can confirm the box is up and DB is reachable before we start adding
// routes in phase 1. Everything else returns 501.

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const { pool } = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const meRoutes = require('./routes/me.routes');
const mentorRoutes = require('./routes/mentors.routes');
const tagsRoutes = require('./routes/tags.routes');
const adminRoutes = require('./routes/admin.routes');
const availabilityRoutes = require('./routes/availability.routes');
const bookingRoutes = require('./routes/bookings.routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'unmute-backend-v2', env: env.NODE_ENV });
});

app.get('/readyz', async (_req, res) => {
  try {
    const result = await pool.query('SELECT 1 AS ok');
    res.json({ ok: true, db: result.rows[0].ok === 1 });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// --- Phase 1: auth + me ---
app.use('/api/auth', authRoutes);
app.use('/api/me',   meRoutes);

// --- Phase 2: mentors, tags, admin ---
app.use('/api/mentors', mentorRoutes);
app.use('/api',         tagsRoutes);          // /api/tags, /api/pricing-tiers
app.use('/api/admin',   adminRoutes);

// --- Phase 3: availability ---
app.use('/api/availability', availabilityRoutes);

// --- Phase 4: bookings ---
app.use('/api/bookings', bookingRoutes);

// Anything else under /api is not implemented yet.
app.use('/api', (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet', code: 'not_implemented' });
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found', code: 'not_found' }));

// Error handler (last)
app.use(errorHandler);

if (require.main === module) {
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
}

module.exports = app;
