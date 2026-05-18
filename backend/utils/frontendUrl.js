/**
 * Single source of truth for the public frontend URL.
 *
 * Resolution order:
 *   1. CLIENT_URL  (preferred; historical default in this codebase)
 *   2. FRONTEND_URL (fallback used in a few utils)
 *   3. http://localhost:3000  (dev only)
 *
 * In NODE_ENV=production any localhost value is treated as missing — we will
 * not silently send users back to localhost on a deployed environment. If
 * nothing usable is configured in production, the process exits at startup
 * (via assertFrontendUrlConfigured) with a clear error so the misconfiguration
 * is caught immediately rather than mid-OAuth flow.
 */

const LOCALHOST_PATTERN = /localhost|127\.0\.0\.1/i;
const DEV_FALLBACK = 'http://localhost:3000';

function isLocalhost(url) {
  return !!url && LOCALHOST_PATTERN.test(url);
}

function stripTrailingSlash(url) {
  return url ? url.replace(/\/+$/, '') : url;
}

/**
 * Returns the resolved frontend URL (no trailing slash).
 * Never returns a localhost value when NODE_ENV=production.
 */
function getClientUrl() {
  const isProd = process.env.NODE_ENV === 'production';
  const candidates = [process.env.CLIENT_URL, process.env.FRONTEND_URL];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (isProd && isLocalhost(candidate)) continue;
    return stripTrailingSlash(candidate);
  }

  if (isProd) {
    // In production we have no safe default. Caller code that still receives
    // this string will at least produce a visible broken link rather than
    // silently sending users to localhost.
    console.error(
      '❌ getClientUrl(): CLIENT_URL/FRONTEND_URL are unset or point to localhost ' +
        'in production. Configure them on the deployment platform.'
    );
    return '';
  }

  return DEV_FALLBACK;
}

/**
 * Convenience: build an absolute URL on the frontend, joining a path safely.
 *   buildClientUrl('/oauth/callback') -> 'https://host/oauth/callback'
 */
function buildClientUrl(path = '/') {
  const base = getClientUrl();
  if (!base) return path; // best-effort in misconfigured prod
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

/**
 * Call once at startup. Fails fast in production if no usable URL is set.
 */
function assertFrontendUrlConfigured() {
  if (process.env.NODE_ENV !== 'production') return;
  const url = getClientUrl();
  if (!url) {
    console.error(
      '❌ FATAL: No valid frontend URL configured. ' +
        'Set CLIENT_URL (preferred) or FRONTEND_URL to the deployed frontend origin, ' +
        'e.g. https://your-app.onrender.com'
    );
    process.exit(1);
  }
  console.log(`✅ Frontend URL configured: ${url}`);
}

module.exports = {
  getClientUrl,
  buildClientUrl,
  assertFrontendUrlConfigured,
};
