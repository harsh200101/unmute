import api from './client.js';

// Typed-shape wrappers over the backend. Each function returns response.data.

export const auth = {
  register: (body) => api.post('/auth/register', body).then((r) => r.data),
  login:    (body) => api.post('/auth/login', body).then((r) => r.data),
  logout:   ()     => api.post('/auth/logout').then((r) => r.data),
  refresh:  ()     => api.post('/auth/refresh').then((r) => r.data),
  verifyEmail:        (token) => api.post('/auth/verify-email', { token }).then((r) => r.data),
  resendVerification: (email) => api.post('/auth/resend-verification', { email }).then((r) => r.data),
  forgotPassword:     (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword:      (token, password) => api.post('/auth/reset-password', { token, password }).then((r) => r.data),
  changePassword:     (current_password, new_password) =>
    api.post('/auth/change-password', { current_password, new_password }).then((r) => r.data),
  googleStart: () => api.get('/auth/google').then((r) => r.data),
};

export const me = {
  get:   ()      => api.get('/me').then((r) => r.data),
  patch: (body)  => api.patch('/me', body).then((r) => r.data),
};

export const mentors = {
  list: (params) => api.get('/mentors', { params }).then((r) => r.data),
  featured: () => api.get('/mentors/featured').then((r) => r.data),
  byUuid: (uuid) => api.get(`/mentors/${uuid}`).then((r) => r.data),
  reviews: (uuid, params) => api.get(`/mentors/${uuid}/reviews`, { params }).then((r) => r.data),
  apply: (body) => api.post('/mentors/apply', body).then((r) => r.data),
  getMine: () => api.get('/mentors/me').then((r) => r.data),
  patchMine: (body) => api.patch('/mentors/me', body).then((r) => r.data),
};

export const catalog = {
  tags: (kind) => api.get('/tags', { params: kind ? { kind } : {} }).then((r) => r.data),
  tiers: () => api.get('/pricing-tiers').then((r) => r.data),
};

export default { auth, me, mentors, catalog };
