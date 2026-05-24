'use strict';

const express = require('express');
const c = require('../controllers/tagController');
const { general } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/tags', general, c.listTags);
router.get('/pricing-tiers', general, c.listPricingTiers);

module.exports = router;
