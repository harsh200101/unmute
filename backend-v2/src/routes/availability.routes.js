'use strict';

const express = require('express');
const c = require('../controllers/availabilityController');
const { authJwt } = require('../middleware/authJwt');
const { requireRole } = require('../middleware/requireRole');
const { requireEmailVerified } = require('../middleware/requireEmailVerified');
const { general } = require('../middleware/rateLimit');

const router = express.Router();

// Mentor self-service (write side)
router.get('/me',          general, authJwt, requireRole('mentor'), c.getMine);
router.put('/template',    general, authJwt, requireRole('mentor'), requireEmailVerified, c.putTemplate);
router.post('/overrides',  general, authJwt, requireRole('mentor'), requireEmailVerified, c.postOverride);
router.delete('/overrides/:id', general, authJwt, requireRole('mentor'), c.deleteOverride);

// Public read: bookable slot timestamps for a given mentor in a window
router.get('/:mentor_uuid/slots', general, c.publicSlots);

module.exports = router;
