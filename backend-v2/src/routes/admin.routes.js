'use strict';

const express = require('express');
const c = require('../controllers/adminController');
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

module.exports = router;
