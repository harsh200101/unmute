'use strict';

const express = require('express');
const c = require('../controllers/mentorController');
const { authJwt } = require('../middleware/authJwt');
const { requireEmailVerified } = require('../middleware/requireEmailVerified');
const { general } = require('../middleware/rateLimit');

const router = express.Router();

// Public
router.get('/featured',   general, c.listFeatured);
// Authenticated mentor-self routes need to come before :uuid (to avoid
// route collision with /mentors/me being interpreted as a uuid lookup).
router.get('/me',         general, authJwt, c.getMine);
router.patch('/me',       general, authJwt, requireEmailVerified, c.patchMine);
router.post('/apply',     general, authJwt, requireEmailVerified, c.apply);

router.get('/',           general, c.listPublic);
router.get('/:uuid',      general, c.getByUuid);

module.exports = router;
