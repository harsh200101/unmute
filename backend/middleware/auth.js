const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Enhanced authentication middleware with comprehensive security features
const auth = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token format.',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    // Verify JWT token with enhanced validation
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'unmute-platform',
      audience: 'unmute-users'
    });

    // Validate token payload structure
    if (!decoded.userId || !decoded.uuid || !decoded.email) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload.',
        code: 'INVALID_TOKEN_PAYLOAD'
      });
    }

    console.log('🔍 Authenticating user:', { userId: decoded.userId, email: decoded.email });

    // Get comprehensive user data from database
    const userQuery = `
      SELECT 
        id, uuid, email, first_name, last_name, phone, role,
        avatar_url, bio, location, social_links, preferences,
        is_verified, is_active, email_verified_at, phone_verified_at,
        last_login_at, login_count, created_at, updated_at
      FROM users 
      WHERE id = $1 AND uuid = $2
    `;

    const userResult = await db.query(userQuery, [decoded.userId, decoded.uuid]);

    if (userResult.rows.length === 0) {
      console.warn('⚠️ Token valid but user not found:', decoded.userId);
      return res.status(401).json({
        success: false,
        message: 'User not found. Please login again.',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];

    // Check if user account is active
    if (!user.is_active) {
      console.warn('⚠️ Inactive user attempted access:', user.email);
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Additional security checks
    if (decoded.email !== user.email) {
      console.warn('⚠️ Token email mismatch:', { token: decoded.email, db: user.email });
      return res.status(401).json({
        success: false,
        message: 'Token validation failed.',
        code: 'TOKEN_MISMATCH'
      });
    }

    // Format user data for request object
    const formattedUser = {
      userId: user.id,
      uuid: user.uuid,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      fullName: `${user.first_name} ${user.last_name}`.trim(),
      phone: user.phone,
      role: user.role,
      avatarUrl: user.avatar_url,
      bio: user.bio,
      location: user.location || {},
      socialLinks: user.social_links || {},
      preferences: user.preferences || {},
      isVerified: user.is_verified,
      isActive: user.is_active,
      emailVerifiedAt: user.email_verified_at,
      phoneVerifiedAt: user.phone_verified_at,
      lastLoginAt: user.last_login_at,
      loginCount: user.login_count,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };

    // Attach user to request object
    req.user = formattedUser;
    req.token = token;
    req.tokenPayload = decoded;

    console.log('✅ User authenticated:', user.email);
    next();

  } catch (error) {
    console.error('❌ Auth middleware error:', {
      message: error.message,
      name: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });

    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired. Please login again.',
        code: 'TOKEN_EXPIRED',
        expiredAt: error.expiredAt
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please login again.',
        code: 'INVALID_TOKEN'
      });
    }

    if (error.name === 'NotBeforeError') {
      return res.status(401).json({
        success: false,
        message: 'Token not active yet.',
        code: 'TOKEN_NOT_ACTIVE'
      });
    }

    // Database connection errors
    if (error.code && error.code.startsWith('ECONNREFUSED')) {
      console.error('❌ Database connection error in auth middleware');
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable.',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    // Generic error response
    return res.status(401).json({
      success: false,
      message: 'Authentication failed.',
      code: 'AUTH_FAILED'
    });
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!roles.includes(req.user.role)) {
      console.warn('⚠️ Unauthorized access attempt:', {
        user: req.user.email,
        role: req.user.role,
        required: roles
      });

      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions.',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: roles,
        current: req.user.role
      });
    }

    next();
  };
};

// Verify email requirement middleware
const requireEmailVerification = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
      code: 'AUTH_REQUIRED'
    });
  }

  if (!req.user.isVerified || !req.user.emailVerifiedAt) {
    return res.status(403).json({
      success: false,
      message: 'Email verification required.',
      code: 'EMAIL_VERIFICATION_REQUIRED'
    });
  }

  next();
};

// Mentor-specific authorization middleware
const requireMentorProfile = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        code: 'AUTH_REQUIRED'
      });
    }

    // Check if user has mentor profile
    const mentorQuery = `
      SELECT 
        id, status, verification_status, is_featured, badge_level
      FROM mentors 
      WHERE user_id = $1
    `;

    const mentorResult = await db.query(mentorQuery, [req.user.userId]);

    if (mentorResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Mentor profile required.',
        code: 'MENTOR_PROFILE_REQUIRED'
      });
    }

    const mentor = mentorResult.rows[0];

    if (mentor.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Mentor profile is not active.',
        code: 'MENTOR_INACTIVE',
        status: mentor.status
      });
    }

    if (mentor.verification_status !== 'verified') {
      return res.status(403).json({
        success: false,
        message: 'Mentor profile verification required.',
        code: 'MENTOR_NOT_VERIFIED',
        verificationStatus: mentor.verification_status
      });
    }

    // Attach mentor info to request
    req.mentor = {
      id: mentor.id,
      status: mentor.status,
      verificationStatus: mentor.verification_status,
      isFeatured: mentor.is_featured,
      badgeLevel: mentor.badge_level
    };

    next();

  } catch (error) {
    console.error('❌ Mentor profile check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify mentor profile.',
      code: 'MENTOR_CHECK_FAILED'
    });
  }
};

// Rate limiting middleware (simple implementation)
const rateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    const key = req.user?.userId || req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old entries
    if (requests.has(key)) {
      requests.set(key, requests.get(key).filter(time => time > windowStart));
    } else {
      requests.set(key, []);
    }

    const userRequests = requests.get(key);

    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    userRequests.push(now);
    requests.set(key, userRequests);

    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': Math.max(0, maxRequests - userRequests.length),
      'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
    });

    next();
  };
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.replace('Bearer ', '').trim();
    
    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'unmute-platform',
      audience: 'unmute-users'
    });

    const userResult = await db.query(
      'SELECT id, uuid, email, first_name, last_name, role, is_verified, is_active FROM users WHERE id = $1 AND uuid = $2',
      [decoded.userId, decoded.uuid]
    );

    if (userResult.rows.length > 0 && userResult.rows[0].is_active) {
      const user = userResult.rows[0];
      req.user = {
        userId: user.id,
        uuid: user.uuid,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        isVerified: user.is_verified,
        isActive: user.is_active
      };
    } else {
      req.user = null;
    }

    next();

  } catch (error) {
    // Silent fail for optional auth
    req.user = null;
    next();
  }
};

module.exports = auth;
module.exports.authorize = authorize;
module.exports.requireEmailVerification = requireEmailVerification;
module.exports.requireMentorProfile = requireMentorProfile;
module.exports.rateLimit = rateLimit;
module.exports.optionalAuth = optionalAuth;
