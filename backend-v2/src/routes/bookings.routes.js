'use strict';

const express = require('express');
const c = require('../controllers/bookingController');
const { authJwt } = require('../middleware/authJwt');
const { requireEmailVerified } = require('../middleware/requireEmailVerified');
const { general } = require('../middleware/rateLimit');

const router = express.Router();

router.use(authJwt);

router.post('/',                          general, requireEmailVerified, c.create);
router.get('/me',                         general, c.listMine);
router.get('/:uuid',                      general, c.getOne);
router.post('/:uuid/cancel',              general, c.cancel);
router.post('/:uuid/reschedule',          general, requireEmailVerified, c.reschedule);
router.post('/:uuid/reschedule/accept',   general, c.acceptReschedule);
router.post('/:uuid/reschedule/decline',  general, c.declineReschedule);

module.exports = router;
