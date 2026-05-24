'use strict';

const express = require('express');
const c = require('../controllers/authController');
const { authJwt } = require('../middleware/authJwt');
const { authStrict, authVeryStrict, general } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/register',              authStrict,     c.register);
router.post('/login',                 authStrict,     c.login);
router.post('/logout',                general,        c.logout);
router.post('/refresh',               general,        c.refresh);

router.post('/verify-email',          general,        c.verifyEmail);
router.post('/resend-verification',   authStrict,     c.resendVerification);

router.post('/forgot-password',       authVeryStrict, c.forgotPassword);
router.post('/reset-password',        authStrict,     c.resetPassword);
router.post('/change-password',       authJwt, authStrict, c.changePassword);

router.get ('/google',                general,        c.googleStart);
router.get ('/google/callback',       general,        c.googleCallback);
// Frontend POSTs the short-lived JWT it received in the callback URL to
// finalise the OAuth flow. See googleCallback for the partition rationale.
router.post('/oauth-exchange',        general,        c.oauthExchange);

module.exports = router;
