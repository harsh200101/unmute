require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const compression = require('compression');
const passport = require('./config/passport');
const db = require('./config/database');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
// Import utilities for health checks
const stripeUtil = require('./utils/stripe');
const zoomUtil = require('./utils/zoom');
const { getClientUrl, assertFrontendUrlConfigured } = require('./utils/frontendUrl');
const sessionLifecycleJob = require('./services/sessionLifecycleJob');

const app = express();

// Trust proxy only in production for security
app.set('trust proxy', process.env.NODE_ENV === 'production');

// ==========================================
// ENVIRONMENT VALIDATION
// ==========================================

function validateEnvironment() {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'SESSION_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing);
    process.exit(1);
  }

  console.log('✅ Environment variables validated');
}

validateEnvironment();

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["https://js.stripe.com", "https://hooks.stripe.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.CLIENT_URL,
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5000/'
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('⚠️ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count']
}));

// ==========================================
// SESSION & AUTHENTICATION (PostgreSQL Only)
// ==========================================

// PostgreSQL session store configuration
const sessionStore = new pgSession({
  pool: db.pool, // Use existing PostgreSQL pool
  tableName: 'user_sessions', // Custom table name
  createTableIfMissing: true, // Auto-create table if missing
  schemaName: 'public', // PostgreSQL schema
  ttl: 24 * 60 * 60, // 24 hours in seconds
  pruneSessionInterval: 60 * 15, // Clean expired sessions every 15 minutes
  errorLog: console.error
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'unmute.sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
  }
}));

console.log('✅ Using PostgreSQL for session storage');

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// ==========================================
// RATE LIMITING
// ==========================================

// Paths that should never count against the rate limit. Use originalUrl
// because inside an `app.use('/api/', ...)` mount, req.path is relative to
// the mount (e.g. '/health'), so checks against '/api/health' silently
// never match. originalUrl always carries the full request path.
const RATE_LIMIT_SKIP_PREFIXES = [
  '/api/health',
  '/api/meetings/test/',
  '/api/test/agora-config'
];

const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => RATE_LIMIT_SKIP_PREFIXES.some(p => req.originalUrl.startsWith(p))
});

// General API rate limiting.
// Raised from 100 -> 1000 per 15 min (~66 req/min) because the previous
// cap was below the steady-state needs of an authenticated SPA: the
// appointments dashboard alone fetches sessions, wallet, notifications and
// pending reschedule requests on mount, and refreshes every 30s while an
// in-progress session exists. The previous cap caused users to see
// "Too many requests" toasts and stale reschedule-request lists within a
// couple of minutes of normal usage. Auth endpoints stay tightly capped
// below to keep brute-force protection.
app.use('/api/', createRateLimit(
  15 * 60 * 1000, // 15 minutes
  1000,
  'Too many requests, please try again later'
));

// Stricter rate limiting for auth endpoints
app.use('/api/auth/', createRateLimit(
  15 * 60 * 1000, // 15 minutes
  50, // bumped from 20 to leave a little headroom for legitimate retries
  'Too many authentication attempts'
));

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(compression());

const morganFormat = process.env.NODE_ENV === 'production' 
  ? 'combined' 
  : ':method :url :status :response-time ms - :res[content-length]';

app.use(morgan(morganFormat, {
  skip: (req) => {
    return process.env.NODE_ENV === 'production' && req.path === '/api/health';
  }
}));

app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf, encoding) => {
    if (req.path.includes('/webhooks/')) {
      req.rawBody = buf;
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

app.use(express.static('public', {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static('uploads'));

// Request ID middleware
app.use((req, res, next) => {
  req.requestId = Math.random().toString(36).substr(2, 9);
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// ==========================================
// DATABASE INITIALIZATION
// ==========================================

async function initializeDatabase() {
  const maxRetries = 5;
  let retries = 0;

  // Wait 3 seconds before first attempt to allow DNS/network to stabilize
  console.log('⏳ Waiting for database to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  while (retries < maxRetries) {
    try {
      console.log(`🔄 Testing database connection (attempt ${retries + 1}/${maxRetries})...`);
      await db.testConnection();
      console.log('✅ Database initialized successfully');

      const stats = db.getPoolStats?.();
      if (stats) {
        console.log('📊 Database pool stats:', stats);
      }

      return;
    } catch (error) {
      retries++;
      console.error(`❌ Database initialization failed (attempt ${retries}/${maxRetries}):`, error.message);

      if (retries >= maxRetries) {
        console.error('💥 Max database connection retries reached. Exiting.');
        process.exit(1);
      }

      // Exponential backoff: 2s, 4s, 6s, 8s
      const delay = retries * 2 * 1000;
      console.log(`🔄 Retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// ==========================================
// HEALTH CHECKS & MONITORING
// ==========================================

app.get('/api/health', async (req, res) => {
  const startTime = Date.now();
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {}
  };

  // Database health check
  try {
    const dbStart = Date.now();
    await db.query('SELECT 1 as health_check');
    health.services.database = {
      status: 'healthy',
      responseTime: Date.now() - dbStart,
      pool: db.getPoolStats ? db.getPoolStats() : null
    };
  } catch (error) {
    health.status = 'unhealthy';
    health.services.database = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Session store health check
  try {
    health.services.sessions = {
      status: 'healthy',
      store: 'PostgreSQL',
      tableName: 'user_sessions'
    };
  } catch (error) {
    health.services.sessions = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // External services health checks
  try {
    const stripeHealth = await stripeUtil.healthCheck();
    health.services.stripe = stripeHealth;
  } catch (error) {
    health.services.stripe = {
      status: 'unhealthy',
      error: error.message
    };
  }

  try {
    const zoomHealth = await zoomUtil.healthCheck();
    health.services.zoom = zoomHealth;
  } catch (error) {
    health.services.zoom = {
      status: 'unhealthy',
      error: error.message
    };
  }

  health.totalResponseTime = Date.now() - startTime;
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

app.get('/api/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});

app.get('/api/alive', (req, res) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

// ==========================================
// API ROUTES
// ==========================================

app.get('/', (req, res) => {
  res.json({
    message: 'Unmute Mentoring Platform API',
    version: '2.0.0',
    status: 'Running',
    timestamp: new Date().toISOString(),
    database: 'PostgreSQL',
    sessions: 'PostgreSQL',
    health: '/api/health'
  });
});

app.get('/api', (req, res) => {
  res.json({
    name: 'Unmute API',
    version: '2.0.0',
    endpoints: {
      auth: '/api/auth',
      mentors: '/api/mentors',
      sessions: '/api/sessions',
      payments: '/api/payments',
      billing: '/api/billing',
      wallet: '/api/wallet',
      health: '/api/health'
    },
    features: [
      'User Authentication',
      'Google OAuth',
      'Mentor Management',
      'Session Booking',
      'Payment Processing',
      'Billing Engine',
      'Wallet System',
      'Video Meetings',
      'PostgreSQL Sessions'
    ]
  });
});

// Test route for Agora configuration (no auth required) - placed before other API routes
console.log('🔧 Registering Agora test route...');
app.get('/api/test/agora-config', async (req, res) => {
  try {
    console.log('🔧 Testing Agora configuration...');

    const agoraService = require('./utils/agora');

    // Test token generation
    const testChannel = 'test_channel_' + Date.now();
    const testUid = 999;
    const token = agoraService.generateToken(testChannel, testUid);

    console.log('🔧 Agora test successful:', {
      appIdConfigured: !!process.env.AGORA_APP_ID,
      appCertificateConfigured: !!process.env.AGORA_APP_CERTIFICATE,
      tokenGenerated: !!token,
      tokenLength: token.length
    });

    res.json({
      success: true,
      message: 'Agora configuration test successful',
      data: {
        appIdConfigured: !!process.env.AGORA_APP_ID,
        appCertificateConfigured: !!process.env.AGORA_APP_CERTIFICATE,
        tokenGenerated: !!token,
        tokenLength: token.length,
        testChannel,
        testUid
      }
    });

  } catch (error) {
    console.error('🔧 Agora configuration test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Agora configuration test failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Configuration error'
    });
  }
});

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/googleAuth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/mentors', require('./routes/mentors'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/meetings', require('./routes/videoMeetings'));

// Categories endpoint - Database-driven
app.get('/api/categories', async (req, res) => {
  try {
    console.log('🔍 Fetching categories from database');

    const query = `
      SELECT
        c.id,
        c.name,
        c.slug,
        c.description,
        c.icon_url,
        c.color_hex,
        c.sort_order,
        COUNT(mc.mentor_id) as mentor_count
      FROM categories c
      LEFT JOIN mentor_categories mc ON c.id = mc.category_id
      LEFT JOIN mentors m ON mc.mentor_id = m.id AND m.status = 'active' AND m.verification_status = 'approved'
      WHERE c.is_active = true
      GROUP BY c.id
      ORDER BY c.sort_order, c.name
    `;

    const result = await db.query(query);

    const categories = result.rows.map(category => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      iconUrl: category.icon_url,
      colorHex: category.color_hex,
      sortOrder: category.sort_order,
      mentorCount: parseInt(category.mentor_count || 0)
    }));

    res.json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Mentor meta endpoints - Database-driven
app.get('/api/mentors/meta/categories', async (req, res) => {
  try {
    console.log('🔍 Fetching mentor meta categories from database');

    const query = `
      SELECT
        c.id,
        c.name,
        c.slug,
        c.description,
        c.icon_url,
        c.color_hex,
        c.sort_order,
        COUNT(mc.mentor_id) as mentor_count
      FROM categories c
      LEFT JOIN mentor_categories mc ON c.id = mc.category_id
      LEFT JOIN mentors m ON mc.mentor_id = m.id AND m.status = 'active' AND m.verification_status = 'verified'
      WHERE c.is_active = true
      GROUP BY c.id
      ORDER BY c.sort_order, c.name
    `;

    const result = await db.query(query);

    const categories = result.rows.map(category => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      iconUrl: category.icon_url,
      colorHex: category.color_hex,
      sortOrder: category.sort_order,
      mentorCount: parseInt(category.mentor_count || 0)
    }));

    res.json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('❌ Error fetching mentor meta categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Featured mentors and reviews endpoints are now handled by routes/mentors.js and routes/reviews.js


// POST /payment/callback/wallet - Handle PhonePe wallet callback (PhonePe POSTs to this URL)
app.post('/payment/callback/wallet', async (req, res) => {
  try {
    console.log('🔄 PhonePe wallet callback received at /payment/callback/wallet (SERVER LEVEL):', {
      timestamp: new Date().toISOString(),
      body: req.body,
      query: req.query,
      url: req.url,
      originalUrl: req.originalUrl,
      headers: req.headers,
      ip: req.ip
    });

    // Import the wallet callback handler function directly
    const walletRoutes = require('./routes/wallet');
    const callbackHandler = walletRoutes.stack?.find(layer => layer.route?.path === '/callback')?.route?.stack.find(layer => layer.method === 'post')?.handle;

    if (!callbackHandler) {
      console.error('❌ Wallet callback handler not found in wallet routes');
      return res.status(500).json({ status: 'error', message: 'Wallet callback handler not available' });
    }

    console.log('✅ Found wallet callback handler, executing...');

    // Call the wallet callback handler directly
    return callbackHandler(req, res);
  } catch (error) {
    console.error('❌ Wallet callback error at server level:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// POST /payment/status - Handle PhonePe redirect (PhonePe POSTs to redirect URL)
app.post('/payment/status', async (req, res) => {
  const requestId = req.requestId || 'unknown';
  try {
    console.log(`🔄 [${requestId}] Payment status POST received at /payment/status:`, {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      originalUrl: req.originalUrl,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        'host': req.headers['host'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'referer': req.headers['referer']
      },
      body: req.body,
      query: req.query,
      ip: req.ip,
      environment: {
        FRONTEND_REDIRECT_URL: process.env.FRONTEND_REDIRECT_URL,
        FRONTEND_URL: process.env.FRONTEND_URL,
        NODE_ENV: process.env.NODE_ENV
      }
    });

    // PhonePe might POST transaction data to redirect URL
    const { transactionId, code, merchantId, amount } = req.body;
    const queryTransactionId = req.query.transactionId;

    const finalTransactionId = transactionId || queryTransactionId;

    console.log(`📋 [${requestId}] Transaction data extraction:`, {
      bodyTransactionId: transactionId,
      queryTransactionId: queryTransactionId,
      finalTransactionId: finalTransactionId,
      paymentCode: code,
      merchantId: merchantId,
      amount: amount
    });

    let status = 'unknown';

    if (finalTransactionId) {
      // Query database for actual payment status
      try {
        const paymentResult = await db.query(
          `SELECT payment_status FROM payments
           WHERE transaction_id = $1
           AND session_id IS NULL
           AND metadata ->> 'type' = 'wallet_topup'`,
          [finalTransactionId]
        );

        if (paymentResult.rows.length > 0) {
          status = paymentResult.rows[0].payment_status;
          console.log(`✅ [${requestId}] Retrieved payment status from database:`, status);
        } else {
          console.log(`⚠️ [${requestId}] Payment not found in database for transaction:`, finalTransactionId);
          status = 'not_found';
        }
      } catch (dbError) {
        console.error(`❌ [${requestId}] Database query error:`, dbError);
        status = 'error';
      }

      // Redirect to frontend with transaction ID and status
      const frontendUrl = `${getClientUrl()}/payment/status?transactionId=${finalTransactionId}&status=${status}&type=wallet_topup`;
      console.log(`🔄 [${requestId}] REDIRECTING TO FRONTEND - URL:`, frontendUrl);
      console.log(`📋 [${requestId}] REDIRECT RESPONSE:`, {
        statusCode: 302,
        locationHeader: frontendUrl,
        contentType: 'text/plain',
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString()
      });

      // Set explicit headers before redirect
      res.setHeader('Location', frontendUrl);
      res.setHeader('Content-Type', 'text/plain');

      console.log(`🚨 [${requestId}] ABOUT TO SEND 302 REDIRECT to: ${frontendUrl}`);
      return res.redirect(302, frontendUrl);
    }

    // If no transaction ID, redirect to generic payment status page
    const fallbackUrl = `${getClientUrl()}/payment/status?status=unknown`;
    console.log(`🔄 [${requestId}] No transaction ID found, redirecting to fallback:`, fallbackUrl);
    return res.redirect(302, fallbackUrl);
  } catch (error) {
    console.error(`❌ [${requestId}] Payment status redirect error:`, error);
    const errorUrl = `${getClientUrl()}/payment/status?status=error`;
    console.log(`🔄 [${requestId}] Redirecting to error fallback:`, errorUrl);
    return res.redirect(302, errorUrl);
  }
});

// Webhook routes with raw body parsing
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res, next) => {
  // Stripe webhook handler would go here
  res.json({ received: true });
});

app.use('/api/webhooks/zoom', express.raw({ type: 'application/json' }), (req, res, next) => {
  // Zoom webhook handler would go here
  res.json({ received: true });
});

// ==========================================
// ERROR HANDLING
// ==========================================

app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    requestId: req.requestId
  });
});

app.use((err, req, res, next) => {
  const errorId = req.requestId;
  
  console.error(`❌ Error [${errorId}]:`, {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  const status = err.status || err.statusCode || 500;
  
  const errorResponse = {
    error: 'Internal Server Error',
    message: status === 500 && process.env.NODE_ENV === 'production' 
      ? 'Something went wrong!' 
      : err.message,
    requestId: errorId,
    timestamp: new Date().toISOString()
  };

  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.details = err;
  }

  res.status(status).json(errorResponse);
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================

async function gracefulShutdown(signal) {
  console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);
  
  try {
    if (db.closePool) {
      await db.closePool();
      console.log('✅ Database connections closed');
    }
    
    if (sessionStore && sessionStore.close) {
      sessionStore.close();
      console.log('✅ Session store closed');
    }
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// ==========================================
// SERVER STARTUP
// ==========================================

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, async () => {
  console.log(`🚀 Unmute API Server started successfully!`);
  console.log(`📍 Server: http://${HOST}:${PORT}`);
  console.log(`🏠 Health: http://${HOST}:${PORT}/api/health`);
  console.log(`🔐 Google OAuth: http://${HOST}:${PORT}/api/auth/google`);
  console.log(`📚 API Docs: http://${HOST}:${PORT}/api`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🗄️ Database: PostgreSQL`);
  console.log(`📱 Client URL: ${getClientUrl()}`);
  assertFrontendUrlConfigured();
  
  await initializeDatabase();
  sessionLifecycleJob.start();
  console.log('✅ Server initialization complete!');
});

module.exports = app;
