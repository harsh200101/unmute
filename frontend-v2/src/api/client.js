import axios from 'axios';

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

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 20_000,
});

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
        _refreshPromise = _refreshPromise || api.post('/auth/refresh').then((r) => {
          setAccessToken(r.data.access_token);
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
        _onAuthChange(null);
      }
    }
    throw err;
  }
);

export default api;
