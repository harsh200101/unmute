const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

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
const generateResetToken = () => crypto.randomBytes(32).toString('hex');
const transporter = nodemailer.createTransport({
  service: 'gmail', // Or 'SendGrid', etc.
  auth: {
    user: process.env.EMAIL_USER, // Add to .env
    pass: process.env.EMAIL_PASS  // Add to .env
  }
});
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
  return {
    id: user.id,
    uuid: user.uuid,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: `${user.first_name} ${user.last_name}`.trim(),
    phone: user.phone,
    dateOfBirth: user.date_of_birth,
    gender: user.gender,
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

    // Use transaction for user creation
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
      return rows[0];
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

  try {
    // Find user (don't reveal if exists)
    const userResult = await db.query('SELECT id, email FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];

    // Always respond the same way
    if (!user) {
      return res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent.' });
    }

    // Generate token and expiry
    const token = generateResetToken();
    const tokenHash = await hashToken(token);
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Store hashed token
    await db.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiry]
    );

    // Send email
    const resetUrl = `http://yourfrontend.com/reset-password?token=${token}&id=${user.id}`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Reset Your Password',
      text: `Click this link to reset your password: ${resetUrl}. This link expires in 1 hour.`
    };

    await transporter.sendMail(mailOptions);

    res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
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
    const tokenRecord = tokenResult.rows.find(async (row) => await bcrypt.compare(token, row.token_hash));

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
        avatar_url = COALESCE($7, avatar_url),
        bio = COALESCE($8, bio),
        location = COALESCE($9::jsonb, location),
        social_links = COALESCE($10::jsonb, social_links),
        preferences = COALESCE($11::jsonb, preferences),
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

module.exports = {
  register: exports.register,
  login: exports.login,
  refreshToken: exports.refreshToken,
  logout: exports.logout,
  getProfile: exports.getProfile,
  updateProfile: exports.updateProfile,
  generateTokens,
  formatUserResponse
};
