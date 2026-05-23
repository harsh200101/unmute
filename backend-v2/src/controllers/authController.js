'use strict';

// Thin HTTP layer over authService. Handlers parse req, call the service,
// and shape the response. No business logic here.

const auth = require('../services/authService');
const env = require('../config/env');
const { bad } = require('../utils/errors');

// Cookie name + options for the refresh token.
const REFRESH_COOKIE = 'unmute_refresh';
function refreshCookieOpts() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: env.JWT_REFRESH_TTL_SECONDS * 1000,
  };
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOpts());
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOpts(), maxAge: 0 });
}

async function register(req, res, next) {
  try {
    const { email, password, full_name } = req.body || {};
    const user = await auth.register({ email, password, full_name });
    res.status(201).json({ user });
  } catch (e) { next(e); }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const result = await auth.login({ email, password });
    setRefreshCookie(res, result.refresh_token);
    res.json({
      user: result.user,
      access_token: result.access_token,
      access_expires_in: result.access_expires_in,
    });
  } catch (e) { next(e); }
}

async function logout(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refresh_token;
    await auth.logout({ refresh_token: token });
    clearRefreshCookie(res);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refresh_token;
    if (!token) throw bad('missing_refresh_token', 'No refresh token provided');
    const result = await auth.refresh({ refresh_token: token });
    setRefreshCookie(res, result.refresh_token);
    res.json({
      access_token: result.access_token,
      access_expires_in: result.access_expires_in,
    });
  } catch (e) { next(e); }
}

async function verifyEmail(req, res, next) {
  try {
    const { token } = req.body || {};
    const result = await auth.verifyEmail({ token });
    res.json(result);
  } catch (e) { next(e); }
}

async function resendVerification(req, res, next) {
  try {
    const { email } = req.body || {};
    const result = await auth.resendVerification({ email });
    res.json(result);
  } catch (e) { next(e); }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body || {};
    const result = await auth.forgotPassword({ email });
    res.json(result);
  } catch (e) { next(e); }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body || {};
    const result = await auth.resetPassword({ token, password });
    res.json(result);
  } catch (e) { next(e); }
}

async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body || {};
    const result = await auth.changePassword({
      user_id: req.user.id,
      current_password,
      new_password,
    });
    res.json(result);
  } catch (e) { next(e); }
}

// --- Google OAuth shells (no-op until env vars are set) ----------------------

async function googleStart(_req, res, next) {
  try {
    if (!auth.googleConfigured()) {
      throw bad('google_not_configured', 'Google login is not enabled on this server');
    }
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');
    res.json({ url: url.toString() });
  } catch (e) { next(e); }
}

async function googleCallback(req, res, next) {
  try {
    if (!auth.googleConfigured()) {
      throw bad('google_not_configured');
    }
    // The full code exchange + ID token verification is intentionally
    // deferred to phase 1.5 (needs google-auth-library or fetch to Google).
    // The route exists so the frontend integration is wired and tests can
    // hit the endpoint to confirm the gate.
    throw bad('google_callback_not_implemented', 'Google callback handler ships in phase 1.5');
    // Sketch of the wiring (for when we implement it):
    //   const code = req.query.code;
    //   const profile = await exchangeCodeForProfile(code);
    //   const session = await auth.loginOrCreateGoogleUser(profile);
    //   setRefreshCookie(res, session.refresh_token);
    //   res.redirect(`${env.FRONTEND_URL}/oauth/callback?ok=1`);
  } catch (e) { next(e); }
}

module.exports = {
  register,
  login,
  logout,
  refresh,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  googleStart,
  googleCallback,
  REFRESH_COOKIE,
};
