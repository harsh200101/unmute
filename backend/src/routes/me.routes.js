'use strict';

const express = require('express');
const c = require('../controllers/meController');
const { authJwt } = require('../middleware/authJwt');
const { general } = require('../middleware/rateLimit');

const router = express.Router();

router.use(authJwt);
router.get('/',  general, c.getMe);
router.patch('/', general, c.patchMe);

module.exports = router;
