'use strict';

const express = require('express');
const c = require('../controllers/paymentsController');
const { authJwt } = require('../middleware/authJwt');
const { requireEmailVerified } = require('../middleware/requireEmailVerified');
const { authStrict, general } = require('../middleware/rateLimit');

const router = express.Router();
router.use(authJwt);

router.post('/topup',          authStrict, requireEmailVerified, c.topup);
router.get('/status/:order_id', general,    c.getStatus);
router.get('/me',              general,    c.listMine);

module.exports = router;
