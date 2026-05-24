'use strict';

const express = require('express');
const c = require('../controllers/notificationController');
const { authJwt } = require('../middleware/authJwt');
const { general } = require('../middleware/rateLimit');

const router = express.Router();
router.use(authJwt);

router.get('/',              general, c.list);
router.get('/unread-count',  general, c.unreadCount);
router.post('/:id/read',     general, c.markRead);
router.post('/read-all',     general, c.markAllRead);

module.exports = router;
