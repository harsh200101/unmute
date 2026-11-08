import axios from 'axios';
import { Capacitor } from '@capacitor/core';

// Single axios instance. The access token lives in memory only; the refresh
// token sits in an httpOnly cookie set by the backend at login. On boot,
// AuthContext calls /api/auth/refresh to mint a fresh access token from
// that cookie.

let _accessToken = null;
let _onAuthChange = () => {};

export function setAccessToken(token) {
  _accessToken = token || null;
}
export function getAccessToken() {
  return _accessToken;
}
export function onAuthChange(handler) {
  _onAuthChange = handler;
}

// In dev web, baseURL is `/api` so Vite's proxy can forward to the local
// backend. In prod web or native mobile (Capacitor/Android/iOS), it must target
// the deployed backend (https://unmute-backend-4x1x.onrender.com).
const DEFAULT_PROD_API = 'https://unmute-backend-4x1x.onrender.com';
const isNative = typeof window !== 'undefined' && (
  Capacitor.isNativePlatform() ||
  (window.location.hostname === 'localhost' && window.location.protocol === 'https:')
);
const isProdWeb = typeof window !== 'undefined' && (
  window.location.hostname.endsWith('.onrender.com') ||
  (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
);
export const API_ORIGIN = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || (isNative || isProdWeb ? DEFAULT_PROD_API : '');
const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  withCredentials: true,
  timeout: 20_000,
});

// Exported for places that need to build full URLs themselves (e.g. OAuth
// redirects via window.location, which can't go through the axios instance).
export const API_BASE_URL = `${API_ORIGIN}/api`;

export function resolveApiUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const origin = API_ORIGIN || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? '' : DEFAULT_PROD_API);
  return `${origin}${cleanPath}`;
}

api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

// Coalesce concurrent 401s: only one refresh in flight at a time.
let _refreshPromise = null;

api.interceptors.response.use(
  (resp) => resp,
  async (err) => {
    const status = err?.response?.status;
    const code = err?.response?.data?.code;
    const original = err.config || {};
    const isAuthRoute = (original.url || '').includes('/auth/refresh') ||
                        (original.url || '').includes('/auth/login');

    if (status === 401 && code === 'invalid_token' && !original._retry && !isAuthRoute) {
      original._retry = true;
      try {
        const savedRefresh = typeof window !== 'undefined' ? localStorage.getItem('unmute_refresh_token') || undefined : undefined;
        _refreshPromise = _refreshPromise || api.post('/auth/refresh', { refresh_token: savedRefresh }).then((r) => {
          setAccessToken(r.data.access_token);
          if (r.data.refresh_token && typeof window !== 'undefined') {
            localStorage.setItem('unmute_refresh_token', r.data.refresh_token);
          }
          return r.data.access_token;
        }).finally(() => { _refreshPromise = null; });
        const newToken = await _refreshPromise;
        if (newToken) {
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        }
      } catch (_) {
        setAccessToken(null);
        if (typeof window !== 'undefined') {
          try { localStorage.removeItem('unmute_refresh_token'); } catch (e) {}
        }
        _onAuthChange(null);
      }
    }
    throw err;
  }
);

export default api;
