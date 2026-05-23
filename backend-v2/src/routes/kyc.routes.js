'use strict';

const express = require('express');
const c = require('../controllers/kycController');
const { authJwt } = require('../middleware/authJwt');
const { requireRole } = require('../middleware/requireRole');
const { general, authStrict } = require('../middleware/rateLimit');

const router = express.Router();
router.use(authJwt);

router.post('/',     authStrict, requireRole('mentor'), c.submit);
router.get('/me',    general,    requireRole('mentor'), c.getMine);

module.exports = router;
