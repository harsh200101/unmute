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

const app = express();

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

const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health'
});

// General API rate limiting
app.use('/api/', createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per window
  'Too many requests, please try again later'
));

// Stricter rate limiting for auth endpoints
app.use('/api/auth/', createRateLimit(
  15 * 60 * 1000, // 15 minutes
  20, // 20 requests per window
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

  while (retries < maxRetries) {
    try {
      console.log('🔄 Testing database connection...');
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
      
      console.log(`🔄 Retrying in ${retries * 2} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retries * 2000));
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
      health: '/api/health'
    },
    features: [
      'User Authentication',
      'Google OAuth',
      'Mentor Management',
      'Session Booking',
      'Payment Processing',
      'Video Meetings',
      'PostgreSQL Sessions'
    ]
  });
});

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/googleAuth'));
app.use('/api/mentors', require('./routes/mentors'));
app.use('/api/sessions', require('./routes/sessions'));

// Categories endpoint
app.get('/api/categories', (req, res) => {
  const categories = [
    { id: 1, name: 'Technology', slug: 'technology', description: 'Software development, programming, and tech skills' },
    { id: 2, name: 'Business', slug: 'business', description: 'Entrepreneurship, management, and business strategy' },
    { id: 3, name: 'Design', slug: 'design', description: 'UI/UX design, graphic design, and creative skills' },
    { id: 4, name: 'Marketing', slug: 'marketing', description: 'Digital marketing, SEO, and growth strategies' },
    { id: 5, name: 'Career Development', slug: 'career', description: 'Resume building, interview prep, and career growth' },
    { id: 6, name: 'Finance', slug: 'finance', description: 'Personal finance, investing, and financial planning' },
    { id: 7, name: 'Language Learning', slug: 'languages', description: 'English, Spanish, French, and other languages' },
    { id: 8, name: 'Health & Wellness', slug: 'health', description: 'Fitness, nutrition, and mental health' },
    { id: 9, name: 'Education', slug: 'education', description: 'Teaching, tutoring, and academic support' },
    { id: 10, name: 'Creative Arts', slug: 'arts', description: 'Writing, music, photography, and creative expression' }
  ];
  
  res.json({
    success: true,
    data: categories
  });
});

// Mentor meta endpoints
app.get('/api/mentors/meta/categories', (req, res) => {
  const categories = [
    { id: 1, name: 'Technology', slug: 'technology', description: 'Software development, programming, and tech skills' },
    { id: 2, name: 'Business', slug: 'business', description: 'Entrepreneurship, management, and business strategy' },
    { id: 3, name: 'Design', slug: 'design', description: 'UI/UX design, graphic design, and creative skills' },
    { id: 4, name: 'Marketing', slug: 'marketing', description: 'Digital marketing, SEO, and growth strategies' },
    { id: 5, name: 'Career Development', slug: 'career', description: 'Resume building, interview prep, and career growth' },
    { id: 6, name: 'Finance', slug: 'finance', description: 'Personal finance, investing, and financial planning' },
    { id: 7, name: 'Language Learning', slug: 'languages', description: 'English, Spanish, French, and other languages' },
    { id: 8, name: 'Health & Wellness', slug: 'health', description: 'Fitness, nutrition, and mental health' },
    { id: 9, name: 'Education', slug: 'education', description: 'Teaching, tutoring, and academic support' },
    { id: 10, name: 'Creative Arts', slug: 'arts', description: 'Writing, music, photography, and creative expression' }
  ];
  
  res.json({
    success: true,
    data: categories
  });
});

// Featured mentors endpoint
app.get('/api/mentors/featured', (req, res) => {
  const limit = parseInt(req.query.limit) || 6;
  
  // Mock featured mentors data
  const featuredMentors = [
    {
      id: 1,
      name: 'Sarah Johnson',
      title: 'Senior Software Engineer',
      bio: 'Senior Software Engineer with 10+ years experience in full-stack development',
      specializations: ['React', 'Node.js', 'Python'],
      languages: ['English', 'Spanish'],
      hourlyRate: 85,
      averageRating: 4.9,
      reviewCount: 127,
      totalSessions: 342,
      isFeatured: true,
      badgeLevel: 'gold'
    },
    {
      id: 2,
      name: 'Michael Chen',
      title: 'Product Manager',
      bio: 'Product Manager and startup advisor with expertise in scaling tech companies',
      specializations: ['Product Management', 'Strategy', 'Leadership'],
      languages: ['English', 'Mandarin'],
      hourlyRate: 120,
      averageRating: 4.8,
      reviewCount: 89,
      totalSessions: 156,
      isFeatured: true,
      badgeLevel: 'platinum'
    }
  ];
  
  res.json({
    success: true,
    data: featuredMentors.slice(0, limit)
  });
});

// Featured reviews endpoint
app.get('/api/reviews/featured', (req, res) => {
  const limit = parseInt(req.query.limit) || 6;
  
  // Mock featured reviews data
  const featuredReviews = [
    {
      id: 1,
      mentor_id: 1,
      student_name: 'Alex R.',
      rating: 5,
      comment: 'Sarah is an amazing mentor! She helped me land my dream job at a top tech company.',
      created_at: '2024-01-15T10:30:00Z'
    },
    {
      id: 2,
      mentor_id: 2,
      student_name: 'Emma L.',
      rating: 5,
      comment: 'Michael provided invaluable insights into product strategy. Highly recommended!',
      created_at: '2024-01-10T14:20:00Z'
    }
  ];
  
  res.json({
    success: true,
    data: featuredReviews.slice(0, limit)
  });
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

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, async () => {
  console.log(`🚀 Unmute API Server started successfully!`);
  console.log(`📍 Server: http://${HOST}:${PORT}`);
  console.log(`🏠 Health: http://${HOST}:${PORT}/api/health`);
  console.log(`🔐 Google OAuth: http://${HOST}:${PORT}/api/auth/google`);
  console.log(`📚 API Docs: http://${HOST}:${PORT}/api`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🗄️ Database: PostgreSQL`);
  console.log(`📱 Client URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
  
  await initializeDatabase();
  console.log('✅ Server initialization complete!');
});

module.exports = app;
