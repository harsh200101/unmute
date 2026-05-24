'use strict';

const express = require('express');
const c = require('../controllers/walletController');
const { authJwt } = require('../middleware/authJwt');
const { general } = require('../middleware/rateLimit');

const router = express.Router();
router.use(authJwt);

router.get('/me',              general, c.getMyBalances);
router.get('/me/transactions', general, c.listMyTransactions);

module.exports = router;
