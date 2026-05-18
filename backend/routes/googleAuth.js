const express = require('express');
const passport = require('../config/passport');
const { rateLimit } = require('../middleware/auth');
const crypto = require('crypto');
const { getClientUrl } = require('../utils/frontendUrl');

const router = express.Router();

// Enhanced Google OAuth initiation with comprehensive error handling
router.get('/google', 
  rateLimit(10, 15 * 60 * 1000), // 10 attempts per 15 minutes
  (req, res, next) => {
    try {
      console.log('🔄 Initiating Google OAuth flow', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer'),
        timestamp: new Date().toISOString()
      });

      // Store state parameter for CSRF protection
      const state = crypto.randomBytes(32).toString('hex');
      req.session = req.session || {};
      req.session.oauthState = state;

      // Enhanced authentication with additional options
      passport.authenticate('google', { 
        scope: ['profile', 'email'],
        accessType: 'offline', // To get refresh token
        prompt: 'select_account', // Force account selection
        state: state // CSRF protection
      })(req, res, next);

    } catch (error) {
      console.error('❌ Error initiating Google OAuth:', error);
      const redirectUrl = `${getClientUrl()}/login?error=oauth_init_failed`;
      res.redirect(redirectUrl);
    }
  }
);

// Enhanced Google OAuth callback with comprehensive handling
router.get('/google/callback',
  rateLimit(20, 15 * 60 * 1000), // 20 callbacks per 15 minutes
  
  // CSRF protection middleware
  (req, res, next) => {
    const { state } = req.query;
    const sessionState = req.session?.oauthState;

    if (!state || !sessionState || state !== sessionState) {
      console.warn('⚠️ OAuth CSRF attack detected:', {
        providedState: state,
        sessionState: sessionState,
        ip: req.ip
      });
      
      return res.redirect(`${getClientUrl()}/login?error=csrf_protection`);
    }

    // Clear the state from session
    if (req.session) {
      delete req.session.oauthState;
    }

    next();
  },

  // Passport authentication
  passport.authenticate('google', { 
    session: false,
    failureRedirect: `${getClientUrl()}/login?error=oauth_failed`
  }),
  
  // Success handler with multiple redirect strategies
  async (req, res) => {
    try {
      console.log('✅ Google OAuth callback successful');
      console.log('🔍 Backend: req.user structure:', {
        hasUser: !!req.user,
        hasUserUser: !!(req.user && req.user.user),
        hasTokens: !!(req.user && req.user.tokens),
        userKeys: req.user ? Object.keys(req.user) : null
      });

      if (!req.user || !req.user.user || !req.user.tokens) {
        console.log('🔍 Backend: Invalid OAuth response structure:', req.user);
        throw new Error('Invalid OAuth response structure');
      }

      const { user, tokens, authProvider } = req.user;
      console.log('🔍 Backend: Extracted user and tokens:', {
        userId: user.id,
        userEmail: user.email,
        hasAccessToken: !!tokens.accessToken,
        hasRefreshToken: !!tokens.refreshToken
      });
      
      // Log successful authentication
      console.log('🎯 OAuth authentication successful:', {
        userId: user.id,
        email: user.email,
        provider: authProvider,
        loginCount: user.loginCount,
        timestamp: new Date().toISOString()
      });

      // Prepare user data for frontend
      const userData = {
        id: user.id,
        uuid: user.uuid,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        isVerified: user.isVerified,
        isActive: user.isActive,
        authProvider: authProvider
      };

      // Strategy 1: Secure HTTP-Only Cookies (Production recommended)
      if (process.env.NODE_ENV === 'production' && process.env.USE_SECURE_COOKIES === 'true') {
        
        // Set secure HTTP-only cookies
        res.cookie('accessToken', tokens.accessToken, {
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          domain: process.env.COOKIE_DOMAIN
        });

        res.cookie('refreshToken', tokens.refreshToken, {
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          domain: process.env.COOKIE_DOMAIN
        });

        // Redirect without tokens in URL
        const redirectUrl = `${getClientUrl()}/auth/success?method=cookie`;
        return res.redirect(redirectUrl);
      }

      // Strategy 2: Server-rendered HTML with automatic token saving (Development)
      if (process.env.USE_HTML_TOKEN_INJECTION === 'true') {
        
        const htmlResponse = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Successful</title>
              <style>
                body { 
                  font-family: Arial, sans-serif; 
                  display: flex; 
                  justify-content: center; 
                  align-items: center; 
                  height: 100vh; 
                  margin: 0;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                }
                .container { text-align: center; }
                .spinner { 
                  border: 4px solid rgba(255,255,255,0.3);
                  border-radius: 50%;
                  border-top: 4px solid white;
                  width: 40px;
                  height: 40px;
                  animation: spin 1s linear infinite;
                  margin: 20px auto;
                }
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h2>🎉 Authentication Successful!</h2>
                <div class="spinner"></div>
                <p>Redirecting you to the application...</p>
              </div>
              
              <script>
                try {
                  // Save tokens to localStorage
                  localStorage.setItem('accessToken', '${tokens.accessToken}');
                  localStorage.setItem('refreshToken', '${tokens.refreshToken}');
                  
                  // Save user data
                  localStorage.setItem('user', JSON.stringify(${JSON.stringify(userData)}));
                  
                  // Set authentication flag
                  localStorage.setItem('isAuthenticated', 'true');
                  
                  console.log('✅ Authentication data saved successfully');
                  
                  // Redirect to application
                  setTimeout(() => {
                    window.location.href = '${getClientUrl()}/dashboard';
                  }, 2000);
                  
                } catch (error) {
                  console.error('❌ Error saving authentication data:', error);
                  alert('Authentication successful but failed to save data. Please try logging in again.');
                  window.location.href = '${getClientUrl()}/login?error=storage_failed';
                }
              </script>
            </body>
          </html>
        `;

        return res.send(htmlResponse);
      }

      // Strategy 3: URL Parameters (Default fallback)
      const params = new URLSearchParams({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expires_in: tokens.expiresIn,
        user: JSON.stringify(userData),
        method: 'url_params'
      });

      // Add state parameter if available for CSRF validation
      if (req.query.state) {
        params.set('state', req.query.state);
      }

      const redirectUrl = `${getClientUrl()}/oauth/callback?${params.toString()}`;

      // Security: Log token distribution method
      console.log('🔐 Tokens distributed via URL parameters (consider using secure cookies in production)');
      console.log('🔍 Backend: Redirecting to:', redirectUrl);

      res.redirect(redirectUrl);

    } catch (error) {
      console.error('❌ OAuth callback processing error:', {
        message: error.message,
        stack: error.stack,
        user: req.user?.user?.email,
        timestamp: new Date().toISOString()
      });

      // Determine error type for better user messaging
      let errorCode = 'oauth_callback_failed';
      
      if (error.message.includes('Invalid OAuth response')) {
        errorCode = 'oauth_response_invalid';
      } else if (error.message.includes('Token generation')) {
        errorCode = 'token_generation_failed';
      } else if (error.message.includes('Database')) {
        errorCode = 'database_error';
      }

      const redirectUrl = `${getClientUrl()}/login?error=${errorCode}`;
      res.redirect(redirectUrl);
    }
  }
);

// OAuth logout/disconnect route
router.post('/google/disconnect',
  rateLimit(5, 60 * 60 * 1000), // 5 disconnects per hour
  async (req, res) => {
    try {
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({
          success: false,
          message: 'User ID required for disconnect'
        });
      }

      // TODO: Implement Google OAuth token revocation
      // This would involve calling Google's revoke token endpoint
      // https://oauth2.googleapis.com/revoke?token={token}

      console.log('🔄 Google OAuth disconnect requested for user:', user_id);

      res.json({
        success: true,
        message: 'Google account disconnected successfully'
      });

    } catch (error) {
      console.error('❌ OAuth disconnect error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to disconnect Google account'
      });
    }
  }
);

// OAuth status check endpoint
router.get('/google/status', async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID required'
      });
    }

    // TODO: Check if user has active Google OAuth connection
    // Query social_links in user table to see if Google is connected

    res.json({
      success: true,
      data: {
        connected: false, // This would be determined from database
        provider: 'google',
        connectedAt: null,
        lastUsed: null
      }
    });

  } catch (error) {
    console.error('❌ OAuth status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check OAuth status'
    });
  }
});

// Health check for OAuth service
router.get('/health', (req, res) => {
  const health = {
    success: true,
    service: 'Google OAuth',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    config: {
      clientIdConfigured: !!process.env.GOOGLE_CLIENT_ID,
      clientSecretConfigured: !!process.env.GOOGLE_CLIENT_SECRET,
      callbackUrlConfigured: !!process.env.GOOGLE_CALLBACK_URL,
      frontendUrlConfigured: !!process.env.CLIENT_URL
    }
  };

  // Check if essential OAuth environment variables are configured
  const requiredVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    health.success = false;
    health.error = `Missing required environment variables: ${missingVars.join(', ')}`;
    return res.status(503).json(health);
  }

  res.json(health);
});

// Error handler for OAuth-specific errors
router.use((error, req, res, next) => {
  console.error('❌ OAuth route error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Redirect OAuth errors to frontend with error parameter
  const redirectUrl = `${getClientUrl()}/login?error=oauth_system_error`;
  res.redirect(redirectUrl);
});

module.exports = router;
