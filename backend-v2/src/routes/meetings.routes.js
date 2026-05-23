'use strict';

const express = require('express');
const c = require('../controllers/meetingController');
const { authJwt } = require('../middleware/authJwt');
const { general } = require('../middleware/rateLimit');

const router = express.Router();
router.use(authJwt);

router.get('/:booking_uuid/credentials',  general, c.credentials);
router.get('/:booking_uuid',              general, c.get);
router.post('/:booking_uuid/events/joined', general, c.joined);
router.post('/:booking_uuid/events/left',   general, c.left);
router.post('/:booking_uuid/end',           general, c.end);

module.exports = router;
