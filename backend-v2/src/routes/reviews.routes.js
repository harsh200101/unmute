'use strict';

const express = require('express');
const c = require('../controllers/reviewController');
const { authJwt } = require('../middleware/authJwt');
const { general } = require('../middleware/rateLimit');

const router = express.Router();

// Public: mentor's reviews carousel
router.get('/mentors/:uuid/reviews', general, c.listForMentor);

// Authenticated: submit + history
router.post('/bookings/:uuid/review',   general, authJwt, c.submit);
router.get('/bookings/:uuid/notes',     general, authJwt, c.getNotes);
router.put('/bookings/:uuid/notes',     general, authJwt, c.putNotes);

router.get('/me/reviews/given',         general, authJwt, c.listMyGiven);
router.get('/me/reviews/received',      general, authJwt, c.listAboutMe);
router.get('/me/notes-history',         general, authJwt, c.myNotesHistory);

module.exports = router;
