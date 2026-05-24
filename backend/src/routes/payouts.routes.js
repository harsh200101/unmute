'use strict';

const express = require('express');
const c = require('../controllers/payoutController');
const { authJwt } = require('../middleware/authJwt');
const { requireRole } = require('../middleware/requireRole');
const { general, authStrict } = require('../middleware/rateLimit');

const router = express.Router();
router.use(authJwt);

router.post('/request', authStrict, requireRole('mentor'), c.request);
router.get('/me',       general,    requireRole('mentor'), c.listMine);

module.exports = router;
