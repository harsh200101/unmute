'use strict';

const express = require('express');
const c = require('../controllers/adminController');
const reviewC = require('../controllers/reviewController');
const kycC = require('../controllers/kycController');
const payoutC = require('../controllers/payoutController');
const { authJwt } = require('../middleware/authJwt');
const { requireRole } = require('../middleware/requireRole');
const { general } = require('../middleware/rateLimit');

const router = express.Router();

router.use(authJwt, requireRole('admin'), general);

router.get('/users',                                c.listUsers);
router.patch('/users/:id',                          c.patchUser);

router.get('/mentor-applications',                  c.listMentorApplications);
router.post('/mentor-applications/:id/approve',     c.approveMentor);
router.post('/mentor-applications/:id/reject',      c.rejectMentor);

router.post('/reviews/:id/hide',                    reviewC.adminHide);

router.get('/kyc',                                  kycC.adminList);
router.post('/kyc/:id/approve',                     kycC.adminApprove);
router.post('/kyc/:id/reject',                      kycC.adminReject);

router.get('/withdrawals',                          payoutC.adminList);
router.post('/withdrawals/:id/process',             payoutC.adminProcess);
router.post('/withdrawals/:id/complete',            payoutC.adminComplete);
router.post('/withdrawals/:id/fail',                payoutC.adminFail);

// Phase 12: meeting ops + refunds + audit log
router.get('/meetings/active',                      c.listActiveMeetings);
router.post('/meetings/:id/force-end',              c.forceEndMeeting);
router.post('/bookings/:id/refund',                 c.refundBooking);
router.get('/audit-log',                            c.listAuditLog);

module.exports = router;
