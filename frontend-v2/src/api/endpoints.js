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

export const wallet = {
  me:           () => api.get('/wallet/me').then((r) => r.data),
  transactions: (params) => api.get('/wallet/me/transactions', { params }).then((r) => r.data),
};

export const payments = {
  topup:    (amount_paise) => api.post('/payments/topup', { amount_paise }).then((r) => r.data),
  status:   (order_id) => api.get(`/payments/status/${order_id}`).then((r) => r.data),
  history:  (params) => api.get('/payments/me', { params }).then((r) => r.data),
  // Dev-only: simulates a PhonePe webhook callback. The backend's stub provider
  // accepts the body shape directly when env vars aren't set.
  simulateWebhook: (body) => api.post('/webhooks/phonepe', body).then((r) => r.data),
};

export const notifications = {
  list:        (params) => api.get('/me/notifications', { params }).then((r) => r.data),
  unreadCount: () => api.get('/me/notifications/unread-count').then((r) => r.data),
  markRead:    (id) => api.post(`/me/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post('/me/notifications/read-all').then((r) => r.data),
};

export const kyc = {
  submit:  (body) => api.post('/mentors/kyc', body).then((r) => r.data),
  getMine: () => api.get('/mentors/kyc/me').then((r) => r.data),
};

export const payouts = {
  request: (amount_paise) => api.post('/payouts/request', { amount_paise }).then((r) => r.data),
  listMine: (params) => api.get('/payouts/me', { params }).then((r) => r.data),
};

export const reviews = {
  given: (params) => api.get('/me/reviews/given', { params }).then((r) => r.data),
  received: (params) => api.get('/me/reviews/received', { params }).then((r) => r.data),
  submit: (booking_uuid, body) => api.post(`/bookings/${booking_uuid}/review`, body).then((r) => r.data),
  getNotes: (booking_uuid) => api.get(`/bookings/${booking_uuid}/notes`).then((r) => r.data),
  putNotes: (booking_uuid, body) => api.put(`/bookings/${booking_uuid}/notes`, body).then((r) => r.data),
  notesHistory: (params) => api.get('/me/notes-history', { params }).then((r) => r.data),
  // Mentor view: see this mentee's notes from past sessions with any mentor.
  menteeHistory: (booking_uuid) =>
    api.get(`/bookings/${booking_uuid}/mentee-history`).then((r) => r.data),
};

export const admin = {
  // Users
  listUsers: (params) => api.get('/admin/users', { params }).then((r) => r.data),
  patchUser: (id, body) => api.patch(`/admin/users/${id}`, body).then((r) => r.data),
  // Mentor applications
  listMentorApplications: (params) => api.get('/admin/mentor-applications', { params }).then((r) => r.data),
  approveMentor: (id, notes) => api.post(`/admin/mentor-applications/${id}/approve`, { notes }).then((r) => r.data),
  rejectMentor: (id, notes) => api.post(`/admin/mentor-applications/${id}/reject`, { notes }).then((r) => r.data),
  // KYC
  listKyc: (params) => api.get('/admin/kyc', { params }).then((r) => r.data),
  approveKyc: (id, notes) => api.post(`/admin/kyc/${id}/approve`, { notes }).then((r) => r.data),
  rejectKyc: (id, notes) => api.post(`/admin/kyc/${id}/reject`, { notes }).then((r) => r.data),
  // Withdrawals
  listWithdrawals: (params) => api.get('/admin/withdrawals', { params }).then((r) => r.data),
  processWithdrawal: (id, body) => api.post(`/admin/withdrawals/${id}/process`, body).then((r) => r.data),
  completeWithdrawal: (id, body) => api.post(`/admin/withdrawals/${id}/complete`, body).then((r) => r.data),
  failWithdrawal: (id, body) => api.post(`/admin/withdrawals/${id}/fail`, body).then((r) => r.data),
  // Meetings
  listActiveMeetings: (params) => api.get('/admin/meetings/active', { params }).then((r) => r.data),
  forceEndMeeting: (id, reason) => api.post(`/admin/meetings/${id}/force-end`, { reason }).then((r) => r.data),
  // Refunds
  refundBooking: (id, body) => api.post(`/admin/bookings/${id}/refund`, body).then((r) => r.data),
  // Reviews
  hideReview: (id, reason) => api.post(`/admin/reviews/${id}/hide`, { reason }).then((r) => r.data),
  // Audit log
  auditLog: (params) => api.get('/admin/audit-log', { params }).then((r) => r.data),
};

export const catalog = {
  tags: (kind) => api.get('/tags', { params: kind ? { kind } : {} }).then((r) => r.data),
  tiers: () => api.get('/pricing-tiers').then((r) => r.data),
};

export default { auth, me, mentors, catalog, availability, bookings, meetings };
