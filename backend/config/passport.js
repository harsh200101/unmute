const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./database');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Enhanced Google OAuth Strategy with your optimized schema
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
  scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('🔄 Google OAuth Profile received:', profile.id);
    
    const email = profile.emails?.[0]?.value;
    const firstName = profile.name?.givenName || '';
    const lastName = profile.name?.familyName || '';
    const avatarUrl = profile.photos?.[0]?.value || null;
    const googleId = profile.id;
    
    if (!email) {
      return done(new Error('No email found in Google profile'), null);
    }

    // Use transaction for data consistency
    const result = await db.transaction(async (client) => {
      // Check if user exists by email
      const existingUser = await client.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      
      let user;
      
      if (existingUser.rows.length === 0) {
        // Create new user with comprehensive profile data
        const insertResult = await client.query(`
          INSERT INTO users (
            email,
            first_name,
            last_name,
            avatar_url,
            role,
            is_verified,
            is_active,
            email_verified_at,
            last_login_at,
            login_count,
            social_links,
            preferences
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *
        `, [
          email,
          firstName,
          lastName,
          avatarUrl,
          'mentee', // Default role - will be updated if mentor profile exists
          true, // Google accounts are verified
          true, // Active by default
          new Date(), // Email verified now
          new Date(), // First login
          1, // First login count
          JSON.stringify({
            google: googleId,
            google_avatar: avatarUrl
          }),
          JSON.stringify({
            login_provider: 'google',
            created_via: 'oauth'
          })
        ]);

        user = insertResult.rows[0];
        console.log('✅ Created new user via Google OAuth:', user.id);

        // Check if user has a mentor profile and update role accordingly
        const mentorCheck = await client.query(
          'SELECT id FROM mentors WHERE user_id = $1',
          [user.id]
        );

        if (mentorCheck.rows.length > 0) {
          // Update user role to mentor if they have a mentor profile
          const roleUpdate = await client.query(
            'UPDATE users SET role = $1 WHERE id = $2 RETURNING role',
            ['mentor', user.id]
          );
          user.role = roleUpdate.rows[0].role;
          console.log('✅ Updated user role to mentor based on existing profile');
        }

        // Log successful user creation
        console.log('👤 New user profile:', {
          id: user.id,
          uuid: user.uuid,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          role: user.role
        });

      } else {
        user = existingUser.rows[0];

        // Check if user has a mentor profile and ensure correct role
        const mentorCheck = await client.query(
          'SELECT id FROM mentors WHERE user_id = $1',
          [user.id]
        );

        const shouldBeMentor = mentorCheck.rows.length > 0;
        const currentRole = user.role;

        // Update role if there's a mismatch
        if (shouldBeMentor && currentRole !== 'mentor') {
          await client.query(
            'UPDATE users SET role = $1 WHERE id = $2',
            ['mentor', user.id]
          );
          user.role = 'mentor';
          console.log('✅ Corrected user role to mentor');
        } else if (!shouldBeMentor && currentRole === 'mentor') {
          await client.query(
            'UPDATE users SET role = $1 WHERE id = $2',
            ['mentee', user.id]
          );
          user.role = 'mentee';
          console.log('✅ Corrected user role to mentee');
        }

        // Update existing user with fresh login data
        const updateResult = await client.query(`
          UPDATE users SET
            last_login_at = CURRENT_TIMESTAMP,
            login_count = login_count + 1,
            avatar_url = COALESCE($2, avatar_url),
            social_links = COALESCE(
              social_links::jsonb || $3::jsonb,
              $3::jsonb
            ),
            is_active = true,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `, [
          user.id,
          avatarUrl,
          JSON.stringify({
            google: googleId,
            google_avatar: avatarUrl
          })
        ]);

        user = updateResult.rows[0];
        console.log('✅ Updated existing user login:', user.email);
      }
      
      return user;
    });

    // Generate enhanced JWT tokens with more user context
    const tokenPayload = {
      userId: result.id,
      uuid: result.uuid,
      email: result.email,
      role: result.role,
      isVerified: result.is_verified,
      loginProvider: 'google'
    };
    
    // Access token with shorter expiry
    const accessToken = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { 
        expiresIn: process.env.JWT_EXPIRE || '24h',
        issuer: 'unmute-platform',
        audience: 'unmute-users'
      }
    );
    
    // Refresh token with longer expiry
    const refreshToken = jwt.sign(
      { 
        userId: result.id, 
        uuid: result.uuid,
        tokenType: 'refresh' 
      },
      process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
      { 
        expiresIn: '7d',
        issuer: 'unmute-platform',
        audience: 'unmute-users'
      }
    );
    
    // Create session token for additional security
    const sessionToken = crypto.randomBytes(32).toString('hex');
    
    // Return comprehensive user data
    const userData = {
      user: {
        id: result.id,
        uuid: result.uuid,
        email: result.email,
        firstName: result.first_name,
        lastName: result.last_name,
        fullName: `${result.first_name} ${result.last_name}`.trim(),
        avatarUrl: result.avatar_url,
        role: result.role,
        isVerified: result.is_verified,
        isActive: result.is_active,
        loginCount: result.login_count,
        lastLogin: result.last_login_at,
        socialLinks: result.social_links || {},
        preferences: result.preferences || {},
        createdAt: result.created_at
      },
      tokens: {
        accessToken,
        refreshToken,
        sessionToken,
        expiresIn: process.env.JWT_EXPIRE || '24h'
      },
      authProvider: 'google'
    };
    
    console.log('🎯 OAuth authentication successful for user:', result.email);
    return done(null, userData);
    
  } catch (error) {
    console.error('❌ Google OAuth Error:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    
    // Return specific error types for better frontend handling
    if (error.code === '23505') { // Unique violation
      return done(new Error('DUPLICATE_EMAIL'), null);
    } else if (error.code === '23514') { // Check violation
      return done(new Error('INVALID_DATA'), null);
    } else {
      return done(new Error('OAUTH_FAILED'), null);
    }
  }
}));

// Enhanced serialization with user context
passport.serializeUser((userData, done) => {
  try {
    // Store minimal user identifier in session
    const sessionData = {
      userId: userData.user.id,
      uuid: userData.user.uuid,
      email: userData.user.email,
      role: userData.user.role,
      sessionToken: userData.tokens.sessionToken
    };
    
    console.log('📝 Serializing user session:', userData.user.email);
    done(null, sessionData);
  } catch (error) {
    console.error('❌ Serialization error:', error);
    done(error, null);
  }
});

// Enhanced deserialization with fresh user data
passport.deserializeUser(async (sessionData, done) => {
  try {
    console.log('🔍 Deserializing user session:', sessionData.email);
    
    // Fetch fresh user data from database
    const result = await db.query(`
      SELECT 
        id, uuid, email, first_name, last_name, avatar_url,
        role, is_verified, is_active, last_login_at, login_count,
        social_links, preferences, created_at, updated_at
      FROM users 
      WHERE id = $1 AND uuid = $2 AND is_active = true
    `, [sessionData.userId, sessionData.uuid]);
    
    if (result.rows.length === 0) {
      console.warn('⚠️ User not found during deserialization:', sessionData.email);
      return done(null, false);
    }
    
    const user = result.rows[0];
    
    // Return formatted user object
    const userData = {
      id: user.id,
      uuid: user.uuid,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      fullName: `${user.first_name} ${user.last_name}`.trim(),
      avatarUrl: user.avatar_url,
      role: user.role,
      isVerified: user.is_verified,
      isActive: user.is_active,
      loginCount: user.login_count,
      lastLogin: user.last_login_at,
      socialLinks: user.social_links || {},
      preferences: user.preferences || {},
      sessionToken: sessionData.sessionToken,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };
    
    console.log('✅ User deserialized successfully:', user.email);
    done(null, userData);
    
  } catch (error) {
    console.error('❌ Deserialization error:', error);
    done(error, null);
  }
});

// Utility function to refresh user data in session
passport.refreshUserSession = async (userId) => {
  try {
    const result = await db.query(`
      SELECT 
        id, uuid, email, first_name, last_name, avatar_url,
        role, is_verified, is_active, last_login_at, login_count,
        social_links, preferences, created_at, updated_at
      FROM users 
      WHERE id = $1 AND is_active = true
    `, [userId]);
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ Error refreshing user session:', error);
    return null;
  }
};

// Utility function to validate JWT token
passport.validateToken = (token, secret = process.env.JWT_SECRET) => {
  try {
    const decoded = jwt.verify(token, secret);
    return { valid: true, payload: decoded };
  } catch (error) {
    console.error('❌ Token validation failed:', error.message);
    return { valid: false, error: error.message };
  }
};

// Utility function to generate new tokens
passport.generateTokens = (user) => {
  const tokenPayload = {
    userId: user.id,
    uuid: user.uuid,
    email: user.email,
    role: user.role,
    isVerified: user.is_verified
  };
  
  const accessToken = jwt.sign(
    tokenPayload,
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRE || '24h',
      issuer: 'unmute-platform',
      audience: 'unmute-users'
    }
  );
  
  const refreshToken = jwt.sign(
    { 
      userId: user.id, 
      uuid: user.uuid,
      tokenType: 'refresh' 
    },
    process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
    { 
      expiresIn: '7d',
      issuer: 'unmute-platform',
      audience: 'unmute-users'
    }
  );
  
  return { accessToken, refreshToken };
};

module.exports = passport;
