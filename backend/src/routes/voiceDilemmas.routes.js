'use strict';

const express = require('express');
const c = require('../controllers/voiceDilemmaController');
const { authJwt } = require('../middleware/authJwt');
const { requireEmailVerified } = require('../middleware/requireEmailVerified');
const { general } = require('../middleware/rateLimit');

const router = express.Router();

// Audio streaming route (open to standard HTML5 audio elements)
router.get('/audio/:filename', c.serveAudio);

// Authenticated routes
router.use(authJwt);

router.post('/', general, requireEmailVerified, c.create);
router.get('/my', general, c.listMy);
router.get('/mine', general, c.listMy);
router.get('/:uuid', general, c.getOne);
router.post('/:uuid/answer', general, c.answer);

module.exports = router;
