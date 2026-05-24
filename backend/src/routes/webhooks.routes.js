'use strict';

// Webhook endpoints. NO authJwt — these are called by the gateway, not the user.
// Signature verification happens inside the controller via phonepeService.

const express = require('express');
const c = require('../controllers/webhooksController');
const { general } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/phonepe', general, c.phonepe);

module.exports = router;
