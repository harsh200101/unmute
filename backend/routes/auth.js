const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const { rateLimit, authorize, requireEmailVerification } = require('../middleware/auth');
const passport = require('../config/passport');

// Enhanced validation rules for registration
const registerValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .custom(async (email) => {
      // This will be handled in the controller, but we can add basic format validation here
      if (email.length > 255) {
        throw new Error('Email address is too long');
      }
      return true;
    }),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  
  body('first_name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('First name is required and must be less than 100 characters')
    .escape(),
  
  body('last_name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Last name is required and must be less than 100 characters')
    .escape(),
  
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  
  body('date_of_birth')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid date of birth'),
  
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other', 'prefer_not_to_say'])
    .withMessage('Invalid gender option'),
  
  body('role')
    .optional()
    .isIn(['mentee', 'mentor'])
    .withMessage('Role must be either mentee or mentor'),
  
  body('location')
    .optional()
    .isObject()
    .withMessage('Location must be an object'),
  
  body('social_links')
    .optional()
    .isObject()
    .withMessage('Social links must be an object'),
  
  body('preferences')
    .optional()
    .isObject()
    .withMessage('Preferences must be an object')
];

// Enhanced validation rules for login
const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  body('remember_me')
    .optional()
    .isBoolean()
    .withMessage('Remember me must be a boolean')
];

// Validation for token refresh
const refreshTokenValidation = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
];

// Validation for profile updates
const updateProfileValidation = [
  body('first_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('First name must be less than 100 characters')
    .escape(),
  
  body('last_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Last name must be less than 100 characters')
    .escape(),
  
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  
  body('date_of_birth')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid date of birth'),
  
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other', 'prefer_not_to_say'])
    .withMessage('Invalid gender option'),
  
  body('bio')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Bio must be less than 1000 characters'),
  
  body('location')
    .optional()
    .isObject()
    .withMessage('Location must be an object'),
  
  body('social_links')
    .optional()
    .isObject()
    .withMessage('Social links must be an object'),
  
  body('preferences')
    .optional()
    .isObject()
    .withMessage('Preferences must be an object')
];

// ==========================================
// PUBLIC ROUTES (No authentication required)
// ==========================================

// User Registration
router.post('/register', 
  rateLimit(5, 15 * 60 * 1000), // 5 attempts per 15 minutes
  registerValidation, 
  authController.register
);

// User Login
router.post('/login', 
  rateLimit(10, 15 * 60 * 1000), // 10 attempts per 15 minutes
  loginValidation, 
  authController.login
);

// Refresh Access Token
router.post('/refresh-token', 
  rateLimit(20, 60 * 60 * 1000), // 20 refreshes per hour
  refreshTokenValidation, 
  authController.refreshToken
);

// Google OAuth Routes
router.get('/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

// Google OAuth Callback
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.CLIENT_URL}/oauth/callback?error=oauth_failed`,
    session: false
  }),
  (req, res) => {
    try {
      const { user, tokens } = req.user;
      const { state } = req.query; // Get state from Google's callback

      // Set secure HTTP-only cookies for tokens (optional)
      if (process.env.NODE_ENV === 'production') {
        res.cookie('accessToken', tokens.accessToken, {
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.cookie('refreshToken', tokens.refreshToken, {
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
      }

      // Redirect to frontend with success
      const redirectUrl = new URL(`${process.env.CLIENT_URL}/oauth/callback`);
      redirectUrl.searchParams.set('accessToken', tokens.accessToken);
      redirectUrl.searchParams.set('refreshToken', tokens.refreshToken);
      if (state) {
        redirectUrl.searchParams.set('state', state); // Pass state for CSRF validation
      }
      redirectUrl.searchParams.set('user', encodeURIComponent(JSON.stringify({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      })));

      res.redirect(redirectUrl.toString());

    } catch (error) {
       console.error('❌ OAuth callback error:', error);
       res.redirect(`${process.env.CLIENT_URL}/oauth/callback?error=callback_failed`);
     }
  }
);

// Password Reset Request
router.post('/forgot-password',
  rateLimit(3, 60 * 60 * 1000), // 3 attempts per hour
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail()
  ],
  authController.forgotPassword
);

// Password Reset (using token)
router.post('/reset-password',
  rateLimit(5, 60 * 60 * 1000), // 5 attempts per hour
  [
    body('token')
      .isLength({ min: 32, max: 128 })
      .withMessage('Invalid reset token'),
    body('id')
      .isInt({ min: 1 })
      .withMessage('Invalid user ID'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number')
  ],
  authController.resetPassword
);

// Send Email Verification
router.post('/send-verification-email',
  auth,
  rateLimit(3, 60 * 60 * 1000), // 3 requests per hour
  authController.sendVerificationEmail
);

// Email Verification
router.get('/verify-email/:token',
  [
    param('token')
      .isLength({ min: 32, max: 128 })
      .withMessage('Invalid verification token')
  ],
  authController.verifyEmail
);

// ==========================================
// PROTECTED ROUTES (Authentication required)
// ==========================================

// Get Current User Profile
router.get('/profile', 
  auth, 
  authController.getProfile
);

// Update User Profile
router.put('/profile', 
  auth,
  rateLimit(10, 60 * 60 * 1000), // 10 updates per hour
  updateProfileValidation,
  authController.updateProfile
);

// Logout (invalidate tokens)
router.post('/logout',
  auth,
  rateLimit(5, 60 * 1000), // 5 logouts per minute
  authController.logout
);

// Change Password
router.post('/change-password',
  auth,
  rateLimit(5, 60 * 60 * 1000), // 5 attempts per hour
  [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number'),
    
    body('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error('Password confirmation does not match');
        }
        return true;
      })
  ],
  async (req, res) => {
    try {
      // TODO: Implement change password logic
      res.json({
        success: true,
        message: 'Password changed successfully'
      });
      
    } catch (error) {
      console.error('❌ Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to change password'
      });
    }
  }
);

// Delete Account
router.delete('/account',
  auth,
  requireEmailVerification,
  [
    body('password')
      .notEmpty()
      .withMessage('Password is required for account deletion'),
    
    body('confirmation')
      .equals('DELETE_MY_ACCOUNT')
      .withMessage('Please type DELETE_MY_ACCOUNT to confirm')
  ],
  async (req, res) => {
    try {
      // TODO: Implement account deletion logic
      // 1. Verify password
      // 2. Soft delete or anonymize user data
      // 3. Clean up related data (sessions, mentoring profiles, etc.)
      
      res.json({
        success: true,
        message: 'Account deletion initiated'
      });
      
    } catch (error) {
      console.error('❌ Account deletion error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete account'
      });
    }
  }
);

// Get User Sessions (login history)
router.get('/sessions',
  auth,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const userId = req.user.userId;
      
      // TODO: Implement session history logic
      // Return login sessions, devices, locations, etc.
      
      res.json({
        success: true,
        data: {
          sessions: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 1,
            totalSessions: 0,
            limit: parseInt(limit)
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Get sessions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch sessions'
      });
    }
  }
);

// ==========================================
// ADMIN ROUTES (Admin authentication required)
// ==========================================

// Get All Users (Admin only)
router.get('/admin/users',
  auth,
  authorize('admin', 'super_admin'),
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    
    query('role')
      .optional()
      .isIn(['mentee', 'mentor', 'admin', 'super_admin'])
      .withMessage('Invalid role filter'),
    
    query('status')
      .optional()
      .isIn(['active', 'inactive', 'verified', 'unverified'])
      .withMessage('Invalid status filter')
  ],
  async (req, res) => {
    try {
      // TODO: Implement admin user list logic
      res.json({
        success: true,
        data: {
          users: [],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalUsers: 0
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Admin get users error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users'
      });
    }
  }
);

// Update User Status (Admin only)
router.patch('/admin/users/:userId/status',
  auth,
  authorize('admin', 'super_admin'),
  [
    param('userId')
      .isInt({ min: 1 })
      .withMessage('Invalid user ID'),
    
    body('is_active')
      .optional()
      .isBoolean()
      .withMessage('is_active must be a boolean'),
    
    body('is_verified')
      .optional()
      .isBoolean()
      .withMessage('is_verified must be a boolean')
  ],
  async (req, res) => {
    try {
      // TODO: Implement admin user status update logic
      res.json({
        success: true,
        message: 'User status updated successfully'
      });
      
    } catch (error) {
      console.error('❌ Admin update user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user status'
      });
    }
  }
);

// ==========================================
// HEALTH CHECK & TESTING ROUTES
// ==========================================

// Health Check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Auth service is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Test Protected Route
router.get('/test/protected', auth, (req, res) => {
  res.json({
    success: true,
    message: 'You are authenticated!',
    user: {
      id: req.user.userId,
      email: req.user.email,
      role: req.user.role
    }
  });
});

module.exports = router;
