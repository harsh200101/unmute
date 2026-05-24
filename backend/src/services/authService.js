'use strict';

const { query, withTransaction } = require('../config/db');
const {
  hashPassword,
  verifyPassword,
  generateToken,
  hashToken,
} = require('../utils/crypto');
const { signAccessToken } = require('../utils/jwt');
const env = require('../config/env');
const { bad, unauthorized, conflict, notFound } = require('../utils/errors');
const {
  sendEmail,
  verificationEmail,
  passwordResetEmail,
} = require('./emailService');

// Note: TTLs centralized here so all callers agree.
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TTL_MS = 60 * 60 * 1000;       // 1h

// --- Registration -----------------------------------------------------------

async function register({ email, password, full_name }) {
  if (!email || !password || !full_name) {
    throw bad('missing_fields', 'email, password and full_name are required');
  }
  if (String(password).length < 8) {
    throw bad('weak_password', 'Password must be at least 8 characters');
  }

  const password_hash = await hashPassword(password);

  let user;
  try {
    const res = await query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'mentee')
       RETURNING *`,
      [email, password_hash, full_name]
    );
    user = res.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw conflict('email_in_use', 'An account with that email already exists');
    }
    throw err;
  }

  // Ensure a mentee wallet exists for every new user
  await query(
    `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentee', 0)
     ON CONFLICT (user_id, kind) DO NOTHING`,
    [user.id]
  );

  // In production: fire-and-forget. SMTP from Render's free/starter tiers is
  // unreliable (port blocking, throttling), and a 10–30 s hang on register
  // is unusable. Users can always re-trigger /api/auth/resend-verification.
  // In dev/test: await so tests can assert on the captured email.
  const emailP = issueVerificationEmail(user).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[verification-email] send failed for', user.email, '-', err.message);
  });
  if (env.NODE_ENV !== 'production') await emailP;

  return publicUser(user);
}

// --- Email verification -----------------------------------------------------

async function issueVerificationEmail(user) {
  if (user.email_verified_at) return; // already verified, no-op

  const token = generateToken();
  const token_hash = hashToken(token);
  const expires_at = new Date(Date.now() + VERIFY_TTL_MS);

  await query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, token_hash, expires_at]
  );

  const link = `${env.FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail(verificationEmail({ to: user.email, full_name: user.full_name, link }));
}

async function resendVerification({ email }) {
  if (!email) throw bad('missing_email', 'email is required');
  const res = await query(`SELECT * FROM users WHERE email = $1`, [email]);
  const user = res.rows[0];
  // Quiet response: don't leak whether the email exists
  if (!user) return { sent: true };
  if (user.email_verified_at) return { sent: true };
  await issueVerificationEmail(user);
  return { sent: true };
}

async function verifyEmail({ token }) {
  if (!token) throw bad('missing_token', 'token is required');
  const token_hash = hashToken(token);
  return withTransaction(async (client) => {
    const tokRes = await client.query(
      `SELECT * FROM email_verification_tokens WHERE token_hash = $1 FOR UPDATE`,
      [token_hash]
    );
    const t = tokRes.rows[0];
    if (!t) throw bad('invalid_token', 'This verification link is not valid');
    if (t.consumed_at) throw bad('token_consumed', 'This link has already been used');
    if (new Date(t.expires_at) < new Date()) {
      throw bad('token_expired', 'This link has expired, request a new one');
    }
    await client.query(
      `UPDATE email_verification_tokens SET consumed_at = NOW() WHERE id = $1`,
      [t.id]
    );
    const u = await client.query(
      `UPDATE users SET email_verified_at = NOW() WHERE id = $1 RETURNING *`,
      [t.user_id]
    );
    return { user: publicUser(u.rows[0]) };
  });
}

// --- Login + refresh --------------------------------------------------------

async function login({ email, password }) {
  if (!email || !password) throw bad('missing_credentials', 'email and password are required');

  const res = await query(`SELECT * FROM users WHERE email = $1`, [email]);
  const user = res.rows[0];
  if (!user || !user.password_hash) throw unauthorized('invalid_credentials', 'Email or password is incorrect');
  if (!user.is_active) throw unauthorized('account_disabled', 'This account has been disabled');

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw unauthorized('invalid_credentials', 'Email or password is incorrect');

  return issueSession(user);
}

async function issueSession(user) {
  const access_token = signAccessToken(user);
  const refresh_token = generateToken(48);
  const token_hash = hashToken(refresh_token);
  const expires_at = new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, token_hash, expires_at]
  );

  return {
    user: publicUser(user),
    access_token,
    refresh_token,
    access_expires_in: env.JWT_ACCESS_TTL_SECONDS,
    refresh_expires_in: env.JWT_REFRESH_TTL_SECONDS,
  };
}

async function refresh({ refresh_token }) {
  if (!refresh_token) throw unauthorized('missing_refresh_token');
  const token_hash = hashToken(refresh_token);

  return withTransaction(async (client) => {
    const r = await client.query(
      `SELECT rt.*, u.* FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 FOR UPDATE`,
      [token_hash]
    );
    const row = r.rows[0];
    if (!row) throw unauthorized('invalid_refresh_token');
    if (row.revoked_at) throw unauthorized('refresh_token_revoked');
    if (new Date(row.expires_at) < new Date()) throw unauthorized('refresh_token_expired');

    // Rotate: revoke the old, issue a new pair
    await client.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);

    const user = {
      id: row.user_id,
      uuid: row.uuid,
      email: row.email,
      full_name: row.full_name,
      role: row.role,
      email_verified_at: row.email_verified_at,
      is_active: row.is_active,
    };
    const access_token = signAccessToken(user);
    const new_refresh = generateToken(48);
    const new_hash = hashToken(new_refresh);
    const new_exp = new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000);

    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, new_hash, new_exp]
    );

    return {
      access_token,
      refresh_token: new_refresh,
      access_expires_in: env.JWT_ACCESS_TTL_SECONDS,
      refresh_expires_in: env.JWT_REFRESH_TTL_SECONDS,
    };
  });
}

async function logout({ refresh_token }) {
  if (!refresh_token) return { ok: true };
  const token_hash = hashToken(refresh_token);
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [token_hash]
  );
  return { ok: true };
}

// --- Password reset (forgot / reset / change) -------------------------------

async function forgotPassword({ email }) {
  if (!email) throw bad('missing_email', 'email is required');
  const res = await query(`SELECT * FROM users WHERE email = $1`, [email]);
  const user = res.rows[0];
  // Quiet response so attackers can't enumerate emails
  if (!user || !user.is_active) return { sent: true };

  const token = generateToken();
  const token_hash = hashToken(token);
  const expires_at = new Date(Date.now() + RESET_TTL_MS);
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, token_hash, expires_at]
  );

  const link = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
  // Fire-and-forget in prod — same reasoning as register.
  const emailP = sendEmail(passwordResetEmail({ to: user.email, full_name: user.full_name, link })).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[password-reset-email] send failed for', user.email, '-', err.message);
  });
  if (env.NODE_ENV !== 'production') await emailP;
  return { sent: true };
}

async function resetPassword({ token, password }) {
  if (!token || !password) throw bad('missing_fields', 'token and password are required');
  if (String(password).length < 8) throw bad('weak_password', 'Password must be at least 8 characters');

  const token_hash = hashToken(token);
  return withTransaction(async (client) => {
    const r = await client.query(
      `SELECT * FROM password_reset_tokens WHERE token_hash = $1 FOR UPDATE`,
      [token_hash]
    );
    const t = r.rows[0];
    if (!t) throw bad('invalid_token', 'This reset link is not valid');
    if (t.consumed_at) throw bad('token_consumed', 'This link has already been used');
    if (new Date(t.expires_at) < new Date()) throw bad('token_expired', 'This link has expired');

    const password_hash = await hashPassword(password);
    await client.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [password_hash, t.user_id]
    );
    await client.query(
      `UPDATE password_reset_tokens SET consumed_at = NOW() WHERE id = $1`,
      [t.id]
    );
    // Revoke all existing refresh tokens — force re-login after a password reset
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [t.user_id]
    );
    return { ok: true };
  });
}

async function changePassword({ user_id, current_password, new_password }) {
  if (!user_id) throw unauthorized();
  if (!current_password || !new_password) {
    throw bad('missing_fields', 'current_password and new_password are required');
  }
  if (String(new_password).length < 8) throw bad('weak_password', 'New password must be at least 8 characters');

  const res = await query(`SELECT * FROM users WHERE id = $1`, [user_id]);
  const user = res.rows[0];
  if (!user) throw notFound('user_not_found');
  if (!user.password_hash) {
    throw bad('no_password_set', 'This account uses social login — set a password via forgot-password first');
  }
  const ok = await verifyPassword(current_password, user.password_hash);
  if (!ok) throw bad('current_password_wrong', 'Current password is incorrect');

  const password_hash = await hashPassword(new_password);
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [password_hash, user.id]);
  // Don't auto-revoke other sessions on change-password (the user is in
  // control). They can manually logout-all if needed in a future feature.
  return { ok: true };
}

// --- Google OAuth (feature-gated) -------------------------------------------

function googleConfigured() {
  if (env.NODE_ENV === 'test') return false;
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
}

async function loginOrCreateGoogleUser({ google_sub, email, full_name, avatar_url }) {
  if (!google_sub || !email) throw bad('google_profile_incomplete');

  // Find by google_sub OR by email (so existing email-password users
  // can later "link" Google by signing in with the matching email).
  let user;
  const bySub = await query(`SELECT * FROM users WHERE google_sub = $1`, [google_sub]);
  if (bySub.rows[0]) {
    user = bySub.rows[0];
  } else {
    const byEmail = await query(`SELECT * FROM users WHERE email = $1`, [email]);
    if (byEmail.rows[0]) {
      const r = await query(
        `UPDATE users SET google_sub = $1,
                          email_verified_at = COALESCE(email_verified_at, NOW())
         WHERE id = $2 RETURNING *`,
        [google_sub, byEmail.rows[0].id]
      );
      user = r.rows[0];
    } else {
      const r = await query(
        `INSERT INTO users (email, google_sub, full_name, avatar_url, role, email_verified_at)
         VALUES ($1, $2, $3, $4, 'mentee', NOW()) RETURNING *`,
        [email, google_sub, full_name || email, avatar_url || null]
      );
      user = r.rows[0];
      await query(
        `INSERT INTO wallets (user_id, kind, balance_paise) VALUES ($1, 'mentee', 0)
         ON CONFLICT (user_id, kind) DO NOTHING`,
        [user.id]
      );
    }
  }
  return issueSession(user);
}

// --- Helpers ----------------------------------------------------------------

function publicUser(u) {
  return {
    id: u.id,
    uuid: u.uuid,
    email: u.email,
    full_name: u.full_name,
    avatar_url: u.avatar_url,
    role: u.role,
    email_verified: !!u.email_verified_at,
    is_active: u.is_active,
    created_at: u.created_at,
  };
}

module.exports = {
  register,
  resendVerification,
  verifyEmail,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  loginOrCreateGoogleUser,
  googleConfigured,
  publicUser,
};
