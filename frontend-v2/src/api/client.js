import axios from 'axios';

// Single axios instance for the whole app. Vite proxies /api → backend in dev.
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15_000,
});

// Phase 1 will add interceptors for JWT attach + 401 refresh.
export default api;
