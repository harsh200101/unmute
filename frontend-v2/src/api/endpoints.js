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

export const availability = {
  getMine: () => api.get('/availability/me').then((r) => r.data),
  putTemplate: (slots) => api.put('/availability/template', { slots }).then((r) => r.data),
  addOverride: (body) => api.post('/availability/overrides', body).then((r) => r.data),
  deleteOverride: (id) => api.delete(`/availability/overrides/${id}`).then((r) => r.data),
  slots: (mentor_uuid, params) => api.get(`/availability/${mentor_uuid}/slots`, { params }).then((r) => r.data),
};

export const bookings = {
  create: (body) => api.post('/bookings', body).then((r) => r.data),
  listMine: (params) => api.get('/bookings/me', { params }).then((r) => r.data),
  byUuid: (uuid) => api.get(`/bookings/${uuid}`).then((r) => r.data),
  cancel: (uuid, reason) => api.post(`/bookings/${uuid}/cancel`, { reason }).then((r) => r.data),
  reschedule: (uuid, new_slot_start_at) =>
    api.post(`/bookings/${uuid}/reschedule`, { new_slot_start_at }).then((r) => r.data),
  acceptReschedule: (uuid) => api.post(`/bookings/${uuid}/reschedule/accept`).then((r) => r.data),
  declineReschedule: (uuid) => api.post(`/bookings/${uuid}/reschedule/decline`).then((r) => r.data),
};

export const meetings = {
  credentials: (booking_uuid) => api.get(`/meetings/${booking_uuid}/credentials`).then((r) => r.data),
  get:         (booking_uuid) => api.get(`/meetings/${booking_uuid}`).then((r) => r.data),
  billing:     (booking_uuid) => api.get(`/meetings/${booking_uuid}/billing`).then((r) => r.data),
  joined:      (booking_uuid) => api.post(`/meetings/${booking_uuid}/events/joined`).then((r) => r.data),
  left:        (booking_uuid) => api.post(`/meetings/${booking_uuid}/events/left`).then((r) => r.data),
  end:         (booking_uuid, reason) => api.post(`/meetings/${booking_uuid}/end`, { reason }).then((r) => r.data),
};

export const catalog = {
  tags: (kind) => api.get('/tags', { params: kind ? { kind } : {} }).then((r) => r.data),
  tiers: () => api.get('/pricing-tiers').then((r) => r.data),
};

export default { auth, me, mentors, catalog, availability, bookings, meetings };
