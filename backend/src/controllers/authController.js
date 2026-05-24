'use strict';

// Thin HTTP layer over authService. Handlers parse req, call the service,
// and shape the response. No business logic here.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const auth = require('../services/authService');
const env = require('../config/env');
const { bad, unauthorized } = require('../utils/errors');

// Cookie name + options for the refresh token.
const REFRESH_COOKIE = 'unmute_refresh';
function refreshCookieOpts() {
  // The frontend and backend live on different sites — `onrender.com` is on
  // the Public Suffix List, so `unmute-frontend.onrender.com` and
  // `unmute-backend-...onrender.com` count as separate sites. That makes the
  // refresh cookie cross-site / third-party.
  //
  // Three attributes work together in prod:
  //   - SameSite=None — required to send cookies on cross-site XHR at all.
  //   - Secure        — required by browsers whenever SameSite=None.
  //   - Partitioned   — CHIPS. Lets Chrome accept the cookie in incognito
  //                     and as third-party cookie deprecation rolls out
  //                     elsewhere. Each top-level site gets its own
  //                     partition of this cookie, which is fine because
  //                     the only site that calls /api/auth/refresh is
  //                     our own frontend.
  //
  // Locally we keep `lax` because dev uses Vite's proxy → same-origin.
  const crossSite = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? 'none' : 'lax',
    partitioned: crossSite,
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

// --- Google OAuth ------------------------------------------------------------
//
// Flow:
//   1. Frontend opens /api/auth/google → we redirect to Google's consent screen
//      with a signed CSRF state (HS256-signed short-lived JWT).
//   2. User picks an account → Google redirects to /api/auth/google/callback
//      with ?code=...&state=... → we verify state, exchange code for tokens,
//      fetch the user's profile, call loginOrCreateGoogleUser, then redirect
//      to the frontend's /oauth/callback page (refresh cookie already set).

const OAUTH_STATE_TTL_SECONDS = 600; // 10 min to complete the round-trip

function signOauthState(payload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: OAUTH_STATE_TTL_SECONDS,
    issuer: 'unmute-v2',
    audience: 'unmute-oauth-state',
  });
}
function verifyOauthState(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: 'unmute-v2',
    audience: 'unmute-oauth-state',
  });
}

async function googleStart(req, res, next) {
  try {
    if (!auth.googleConfigured()) {
      throw bad('google_not_configured', 'Google login is not enabled on this server');
    }
    // CSRF state — random nonce + a return URL the user wants to land on
    const nonce = crypto.randomBytes(16).toString('hex');
    const next_url = typeof req.query.next === 'string' ? req.query.next : '/dashboard';
    const state = signOauthState({ nonce, next_url });

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');
    url.searchParams.set('state', state);

    // If the client did a fetch (Accept: application/json), return JSON.
    // Otherwise redirect (default browser flow).
    if (req.accepts(['html', 'json']) === 'json') {
      return res.json({ url: url.toString() });
    }
    res.redirect(url.toString());
  } catch (e) { next(e); }
}

// Exchange Google authorization code for tokens, then fetch the userinfo.
async function exchangeCodeForProfile(code) {
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenResp.ok) {
    const t = await tokenResp.text().catch(() => '');
    throw new Error(`Google token exchange failed (${tokenResp.status}): ${t}`);
  }
  const tokenData = await tokenResp.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new Error('Google did not return an access_token');

  const profileResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileResp.ok) throw new Error(`Google userinfo failed (${profileResp.status})`);
  const profile = await profileResp.json();
  return {
    google_sub: profile.sub,
    email: profile.email,
    email_verified: !!profile.email_verified,
    full_name: profile.name || profile.email,
    avatar_url: profile.picture || null,
  };
}

async function googleCallback(req, res, next) {
  // We always redirect back to the frontend (success OR failure) so the user
  // never sees a raw JSON error page on the OAuth flow.
  const fail = (code) =>
    res.redirect(`${env.FRONTEND_URL}/oauth/callback?error=${encodeURIComponent(code)}`);
  try {
    if (!auth.googleConfigured()) return fail('google_not_configured');

    const { code, state, error } = req.query;
    if (error) return fail(String(error));
    if (!code || !state) return fail('missing_code_or_state');

    let nextUrl = '/dashboard';
    try {
      const decoded = verifyOauthState(String(state));
      if (decoded.next_url && decoded.next_url.startsWith('/')) nextUrl = decoded.next_url;
    } catch (_) {
      return fail('invalid_state');
    }

    const profile = await exchangeCodeForProfile(String(code));
    if (!profile.email_verified) return fail('google_email_unverified');

    const session = await auth.loginOrCreateGoogleUser(profile);

    // ⚠️ We CAN'T setRefreshCookie + redirect here in production, because:
    //   * frontend.onrender.com and backend.onrender.com are different sites
    //     (onrender.com is on the Public Suffix List).
    //   * Our refresh cookie is `SameSite=None; Secure; Partitioned`.
    //   * Partitioned cookies are keyed by the *top-level site at write time*.
    //     During Google's redirect to /api/auth/google/callback the top-level
    //     site is the backend; the cookie would be stored under the backend's
    //     partition. The frontend then tries to send it on a third-party XHR
    //     under the FRONTEND's partition → cookie not found → 400.
    //
    // Fix: redirect to the frontend with a short-lived signed `exchange` JWT.
    // The frontend XHRs back to /api/auth/oauth-exchange — that request runs
    // under the frontend's partition, so the cookie we set there lands in
    // the right partition for all future XHRs.
    const exchange_token = jwt.sign(
      {
        kind: 'oauth-exchange',
        user_id: session.user.id,
        refresh_token: session.refresh_token,
        access_token: session.access_token,
      },
      env.JWT_SECRET,
      {
        expiresIn: 60,
        issuer: 'unmute-v2',
        audience: 'unmute-oauth-exchange',
      }
    );
    res.redirect(
      `${env.FRONTEND_URL}/oauth/callback?exchange=${encodeURIComponent(exchange_token)}&next=${encodeURIComponent(nextUrl)}`
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[google callback]', e.message);
    return fail('google_oauth_failed');
  }
}

// Companion to googleCallback above. The frontend POSTs the short-lived
// exchange JWT here from its own origin, so the Set-Cookie response is
// stored under the frontend's partition — where future XHRs will find it.
async function oauthExchange(req, res, next) {
  try {
    const { exchange_token } = req.body || {};
    if (!exchange_token || typeof exchange_token !== 'string') {
      throw bad('missing_exchange_token', 'exchange_token is required');
    }
    let decoded;
    try {
      decoded = jwt.verify(exchange_token, env.JWT_SECRET, {
        issuer: 'unmute-v2',
        audience: 'unmute-oauth-exchange',
      });
    } catch (_) {
      throw bad('invalid_exchange_token', 'This sign-in link expired. Please try again.');
    }
    if (decoded.kind !== 'oauth-exchange' || !decoded.refresh_token || !decoded.access_token) {
      throw bad('invalid_exchange_token', 'This sign-in link expired. Please try again.');
    }
    setRefreshCookie(res, decoded.refresh_token);
    res.json({
      access_token: decoded.access_token,
      access_expires_in: env.JWT_ACCESS_TTL_SECONDS,
    });
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
  oauthExchange,
  REFRESH_COOKIE,
};
