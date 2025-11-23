const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');

// Enhanced token generation with comprehensive payload
const generateTokens = (user) => {
  const payload = {
    userId: user.id,
    uuid: user.uuid,
    email: user.email,
    role: user.role,
    isVerified: user.is_verified,
    isActive: user.is_active
  };
  const accessToken = jwt.sign(
    payload,
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

  return {
    accessToken,
    refreshToken,
    expiresIn: process.env.JWT_EXPIRE || '24h',
    tokenType: 'Bearer'
  };
};

// Format user response data
const formatUserResponse = (user) => {
  // Calculate age from date of birth
  let age = null;
  if (user.date_of_birth) {
    const birthDate = new Date(user.date_of_birth);
    const today = new Date();
    age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
  }

  return {
    id: user.id,
    uuid: user.uuid,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: `${user.first_name} ${user.last_name}`.trim(),
    phone: user.phone,
    dateOfBirth: user.date_of_birth,
    age: age,
    gender: user.gender,
    maritalStatus: user.marital_status,
    preferredLanguage: user.preferred_language,
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
};

// Register new user with comprehensive validation
exports.register = async (req, res) => {
  try {
    // Validate request data
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      email,
      password,
      first_name,
      last_name,
      phone = null,
      date_of_birth = null,
      gender = null,
      role = 'mentee',
      avatar_url = null,
      bio = null,
      location = null,
      social_links = {},
      preferences = {}
    } = req.body;

    // Validate role
    if (!['mentee', 'mentor'].includes(role)) {
      return res.status(422).json({
        success: false,
        message: 'Invalid role. Must be either "mentee" or "mentor"',
        code: 'INVALID_ROLE'
      });
    }

    console.log('🔄 Registering new user:', email);

    // Check if user already exists
    const existingUserQuery = 'SELECT id FROM users WHERE email = $1';
    const existingUser = await db.query(existingUserQuery, [email]);
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered',
        code: 'EMAIL_EXISTS'
      });
    }

    // Hash password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Use transaction for user creation and potential mentor record
    const result = await db.transaction(async (client) => {
      const insertQuery = `
        INSERT INTO users (
          email,
          password_hash,
          first_name,
          last_name,
          phone,
          date_of_birth,
          gender,
          role,
          avatar_url,
          bio,
          location,
          social_links,
          preferences,
          is_verified,
          is_active,
          login_count
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
      `;

      const values = [
        email.toLowerCase().trim(),
        hashedPassword,
        first_name.trim(),
        last_name.trim(),
        phone,
        date_of_birth,
        gender,
        role,
        avatar_url,
        bio,
        location ? JSON.stringify(location) : null,
        JSON.stringify(social_links),
        JSON.stringify({
          ...preferences,
          registration_method: 'email',
          registration_ip: req.ip,
          registration_user_agent: req.get('User-Agent')
        }),
        false, // is_verified - email verification required
        true, // is_active
        0 // login_count
      ];

      const { rows } = await client.query(insertQuery, values);
      const user = rows[0];

      // If user selected mentor role, create mentor record automatically
      if (role === 'mentor') {
        console.log('🔄 Creating mentor record for new user:', user.id);

        const mentorInsertQuery = `
          INSERT INTO mentors (
            user_id, specializations, industries, skills, languages, hourly_rate, currency,
            years_experience, profile_image, video_intro_url, portfolio_urls, timezone,
            instant_booking, auto_accept_bookings, advance_booking_days, min_session_duration,
            max_session_duration, session_buffer_minutes, status, verification_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        `;

        const mentorValues = [
          user.id, // user_id
          [], // specializations
          [], // industries
          [], // skills
          ['en'], // languages
          75, // hourly_rate
          'INR', // currency
          0, // years_experience
          null, // profile_image
          null, // video_intro_url
          [], // portfolio_urls
          'Asia/Calcutta', // timezone
          false, // instant_booking
          false, // auto_accept_bookings
          30, // advance_booking_days
          30, // min_session_duration
          120, // max_session_duration
          15, // session_buffer_minutes
          'active', // status
          'pending' // verification_status
        ];

        await client.query(mentorInsertQuery, mentorValues);
        console.log('✅ Mentor record created for user:', user.id);
      }

      return user;
    });

    const user = result;

    // Generate authentication tokens
    const tokens = generateTokens(user);

    // Log successful registration
    console.log('✅ User registered successfully:', {
      id: user.id,
      uuid: user.uuid,
      email: user.email,
      role: user.role
    });

    // Send registration response
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: formatUserResponse(user),
        tokens,
        requiresEmailVerification: !user.is_verified
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error);

    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      const field = error.constraint?.includes('email') ? 'email' : 'field';
      return res.status(409).json({
        success: false,
        message: `${field} already exists`,
        code: 'DUPLICATE_ENTRY'
      });
    }

    if (error.code === '23514') { // Check constraint violation
      return res.status(422).json({
        success: false,
        message: 'Invalid data provided',
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed',
      code: 'SERVER_ERROR'
    });
  }
};
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  console.log('🚨 FORGOT PASSWORD FUNCTION CALLED FOR EMAIL:', email);

  try {
    console.log('🔍 Forgot password request for email:', email);

    // Find user (don't reveal if exists)
    const userResult = await db.query('SELECT id, email FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];

    console.log('🔍 User lookup result:', user ? `✅ USER FOUND with ID: ${user.id}, Email: ${user.email}` : '❌ USER NOT FOUND');
    console.log('🔍 Total users found in query:', userResult.rows.length);

    // Always respond the same way
    if (!user) {
      console.log('⚠️ No user found for email:', email);
      return res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent.' });
    }

    console.log('✅ User found, proceeding with password reset for user ID:', user.id);

    // Generate token and expiry
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(token, 12);
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    console.log('🔑 Generated reset token, expires at:', expiry);

    // Store hashed token
    const insertResult = await db.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiry]
    );

    console.log('💾 Password reset token stored in database');

    // Send email
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}&id=${user.id}`;
    console.log('📧 Attempting to send password reset email to:', user.email);
    console.log('🔗 Reset URL:', resetUrl);

    await sendPasswordResetEmail(user.email, resetUrl);

    console.log('✅ Password reset email sent successfully');

    res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, id, newPassword } = req.body;

  try {
    // Find token record
    const tokenResult = await db.query(
      'SELECT token_hash, expires_at, used_at FROM password_reset_tokens WHERE user_id = $1',
      [id]
    );

    // Find valid token by checking each one asynchronously
    let tokenRecord = null;
    for (const row of tokenResult.rows) {
      const isValidToken = await bcrypt.compare(token, row.token_hash);
      if (isValidToken) {
        tokenRecord = row;
        break;
      }
    }

    if (!tokenRecord || tokenRecord.used_at || new Date() > tokenRecord.expires_at) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update user's password
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, id]);

    // Mark token as used and delete all tokens for this user
    await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [id]);

    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
// Login existing user with enhanced security
exports.login = async (req, res) => {
  try {
    const { email, password, remember_me = false } = req.body;

    console.log('🔄 Login attempt for:', email);

    // Get user with comprehensive data
    const userQuery = `
      SELECT 
        id, uuid, email, password_hash, first_name, last_name,
        phone, date_of_birth, gender, role, avatar_url, bio,
        location, social_links, preferences, is_verified, is_active,
        email_verified_at, phone_verified_at, last_login_at, login_count,
        created_at, updated_at
      FROM users 
      WHERE email = $1
    `;
    
    const { rows } = await db.query(userQuery, [email.toLowerCase().trim()]);
    const user = rows[0];

    if (!user) {
      console.log('❌ Login failed: User not found -', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      console.log('❌ Login failed: Invalid password -', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check if account is active
    if (!user.is_active) {
      console.log('❌ Login failed: Account inactive -', email);
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Update user login information
    const updateResult = await db.query(`
      UPDATE users SET 
        last_login_at = CURRENT_TIMESTAMP,
        login_count = login_count + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING last_login_at, login_count
    `, [user.id]);

    // Update user object with fresh login data
    user.last_login_at = updateResult.rows[0].last_login_at;
    user.login_count = updateResult.rows[0].login_count;

    // Generate authentication tokens
    const tokens = generateTokens(user);

    // Log successful login
    console.log('✅ Login successful:', {
      id: user.id,
      email: user.email,
      loginCount: user.login_count
    });

    // Send login response
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: formatUserResponse(user),
        tokens,
        firstTimeLogin: user.login_count === 1
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      code: 'SERVER_ERROR'
    });
  }
};

// Refresh authentication tokens
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required',
        code: 'TOKEN_REQUIRED'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET
    );

    if (decoded.tokenType !== 'refresh') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type',
        code: 'INVALID_TOKEN'
      });
    }

    // Get current user data
    const userQuery = `
      SELECT id, uuid, email, role, is_verified, is_active
      FROM users 
      WHERE id = $1 AND uuid = $2 AND is_active = true
    `;
    
    const { rows } = await db.query(userQuery, [decoded.userId, decoded.uuid]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Generate new tokens
    const newTokens = generateTokens(user);

    console.log('✅ Tokens refreshed for user:', user.email);

    res.json({
      success: true,
      message: 'Tokens refreshed successfully',
      data: {
        tokens: newTokens
      }
    });

  } catch (error) {
    console.error('❌ Token refresh error:', error);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
        code: 'INVALID_TOKEN'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Token refresh failed',
      code: 'SERVER_ERROR'
    });
  }
};

// Logout user (invalidate tokens)
exports.logout = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (userId) {
      // Update user's last activity
      await db.query(
        'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [userId]
      );
      
      console.log('✅ User logged out:', userId);
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      code: 'SERVER_ERROR'
    });
  }
};

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const userQuery = `
      SELECT *
      FROM users 
      WHERE id = $1 AND is_active = true
    `;
    
    const { rows } = await db.query(userQuery, [userId]);
    const user = rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: {
        user: formatUserResponse(user)
      }
    });

  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      code: 'SERVER_ERROR'
    });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      first_name,
      last_name,
      phone,
      date_of_birth,
      gender,
      marital_status,
      preferred_language,
      avatar_url,
      bio,
      location,
      social_links,
      preferences
    } = req.body;

    const updateQuery = `
      UPDATE users SET
        first_name = COALESCE($2, first_name),
        last_name = COALESCE($3, last_name),
        phone = COALESCE($4, phone),
        date_of_birth = COALESCE($5, date_of_birth),
        gender = COALESCE($6, gender),
        marital_status = COALESCE($7, marital_status),
        preferred_language = COALESCE($8, preferred_language),
        avatar_url = COALESCE($9, avatar_url),
        bio = COALESCE($10, bio),
        location = COALESCE($11::jsonb, location),
        social_links = COALESCE($12::jsonb, social_links),
        preferences = COALESCE($13::jsonb, preferences),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND is_active = true
      RETURNING *
    `;

    const values = [
      userId,
      first_name,
      last_name,
      phone,
      date_of_birth,
      gender,
      marital_status,
      preferred_language,
      avatar_url,
      bio,
      location ? JSON.stringify(location) : null,
      social_links ? JSON.stringify(social_links) : null,
      preferences ? JSON.stringify(preferences) : null
    ];

    const { rows } = await db.query(updateQuery, values);
    const user = rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    console.log('✅ Profile updated for user:', user.email);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: formatUserResponse(user)
      }
    });

  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      code: 'SERVER_ERROR'
    });
  }
};

// Send email verification
exports.sendVerificationEmail = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user email
    const userQuery = 'SELECT email, is_verified FROM users WHERE id = $1 AND is_active = true';
    const userResult = await db.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];

    // Check if already verified
    if (user.is_verified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified',
        code: 'ALREADY_VERIFIED'
      });
    }

    // Generate verification token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(token, 12);
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store token in database (delete any existing tokens first)
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);

    await db.query(
      'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash, expiry]
    );

    // Send verification email
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}&id=${userId}`;

    await sendVerificationEmail(user.email, verificationUrl);

    console.log('✅ Verification email sent to:', user.email);

    res.json({
      success: true,
      message: 'Verification email sent successfully'
    });

  } catch (error) {
    console.error('❌ Send verification email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification email',
      code: 'SERVER_ERROR'
    });
  }
};

// Verify email with token
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const { id: userId } = req.query;

    if (!token || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Token and user ID are required',
        code: 'MISSING_PARAMS'
      });
    }

    // Get token record
    const tokenQuery = `
      SELECT token_hash, expires_at, used_at
      FROM email_verification_tokens
      WHERE user_id = $1
    `;
    const tokenResult = await db.query(tokenQuery, [userId]);

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token',
        code: 'INVALID_TOKEN'
      });
    }

    const tokenRecord = tokenResult.rows[0];

    // Check if token is used or expired
    if (tokenRecord.used_at || new Date() > tokenRecord.expires_at) {
      return res.status(400).json({
        success: false,
        message: 'Verification token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    // Verify token
    const isValidToken = await bcrypt.compare(token, tokenRecord.token_hash);
    if (!isValidToken) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token',
        code: 'INVALID_TOKEN'
      });
    }

    // Update user as verified and mark token as used
    await db.transaction(async (client) => {
      // Update user
      await client.query(
        'UPDATE users SET is_verified = true, email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [userId]
      );

      // Mark token as used
      await client.query(
        'UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1',
        [userId]
      );
    });

    console.log('✅ Email verified for user:', userId);

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    console.error('❌ Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify email',
      code: 'SERVER_ERROR'
    });
  }
};

module.exports = {
  register: exports.register,
  login: exports.login,
  refreshToken: exports.refreshToken,
  logout: exports.logout,
  getProfile: exports.getProfile,
  updateProfile: exports.updateProfile,
  sendVerificationEmail: exports.sendVerificationEmail,
  verifyEmail: exports.verifyEmail,
  forgotPassword: exports.forgotPassword,
  resetPassword: exports.resetPassword,
  generateTokens,
  formatUserResponse
};
