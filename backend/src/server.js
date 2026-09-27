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
const walletRoutes = require('./routes/wallet.routes');
const paymentsRoutes = require('./routes/payments.routes');
const webhookRoutes = require('./routes/webhooks.routes');
const meetingRoutes = require('./routes/meetings.routes');
const reviewRoutes = require('./routes/reviews.routes');
const notificationRoutes = require('./routes/notifications.routes');
const kycRoutes = require('./routes/kyc.routes');
const payoutRoutes = require('./routes/payouts.routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// We sit behind Render's edge proxy (which sets X-Forwarded-For / X-Forwarded-
// Proto). Without `trust proxy`, express-rate-limit complains and req.ip is
// always the loopback address. `1` = trust the single hop in front of us.
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

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

// Report the resolved mailer so "is email actually configured?" is answerable
// without digging through Render logs. env.js refuses to boot when smtp is
// selected without SMTP_USER/SMTP_PASS, so a healthy /healthz already implies
// the mailer is configured — this just names it. Never expose SMTP_PASS.
app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    service: 'unmute-backend-v2',
    env: env.NODE_ENV,
    email: {
      provider: env.EMAIL_PROVIDER,
      host: env.EMAIL_PROVIDER === 'smtp' ? `${env.SMTP_HOST}:${env.SMTP_PORT}` : null,
      from: env.EMAIL_FROM || null,
      // Distinguishes "credentials present" from "credentials missing" without
      // revealing them. Only meaningful for the smtp provider.
      authenticated: env.EMAIL_PROVIDER === 'smtp' ? Boolean(env.SMTP_USER && env.SMTP_PASS) : null,
    },
  });
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

// --- Phase 5: wallet + payments + webhooks ---
app.use('/api/wallet',   walletRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/webhooks', webhookRoutes);

// --- Phase 6: meeting room ---
app.use('/api/meetings', meetingRoutes);

// --- Phase 9: reviews + session notes (routes spread across /api/*) ---
app.use('/api', reviewRoutes);

// --- Phase 10: in-app notifications ---
app.use('/api/me/notifications', notificationRoutes);

// --- Phase 11: KYC + mentor payouts ---
app.use('/api/mentors/kyc', kycRoutes);
app.use('/api/payouts',     payoutRoutes);

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
    // Start the background billing scheduler (no-op in test env)
    // eslint-disable-next-line global-require
    require('./jobs/scheduler').start();
  });
}

module.exports = app;
