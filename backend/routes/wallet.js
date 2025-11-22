const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../config/database');
const auth = require('../middleware/auth');
const { rateLimit } = require('../middleware/auth');
const {
  getWalletBalance,
  getWalletTransactions,
  initiateWalletTopup,
  handleWalletTopupCallback
} = require('../controllers/walletController');

const router = express.Router();

// GET /api/wallet/balance - Get wallet balance (authenticated)
router.get('/balance',
  auth,
  rateLimit(100, 15 * 60 * 1000), // 100 requests per 15 minutes
  async (req, res) => {
    try {
      await getWalletBalance(req, res);
    } catch (error) {
      console.error('❌ Wallet balance route error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get wallet balance',
        code: 'SERVER_ERROR'
      });
    }
  }
);

// GET /api/wallet/transactions - Get transaction history with pagination (authenticated)
router.get('/transactions',
  auth,
  rateLimit(100, 15 * 60 * 1000), // 100 requests per 15 minutes
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be non-negative')
  ],
  async (req, res) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      await getWalletTransactions(req, res);
    } catch (error) {
      console.error('❌ Wallet transactions route error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get wallet transactions',
        code: 'SERVER_ERROR'
      });
    }
  }
);

// POST /api/wallet/topup - Initiate wallet top-up via PhonePe (authenticated, rate limited)
router.post('/topup',
  auth,
  rateLimit(20, 15 * 60 * 1000), // 20 top-ups per 15 minutes
  [
    body('amount')
      .isFloat({ min: 1, max: 50000 })
      .withMessage('Amount must be between 1 and 50000 INR')
  ],
  async (req, res) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      await initiateWalletTopup(req, res);
    } catch (error) {
      console.error('❌ Wallet top-up route error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate wallet top-up',
        code: 'SERVER_ERROR'
      });
    }
  }
);

// POST /api/wallet/callback - Handle PhonePe callback for wallet top-up (public, checksum validation)
router.post('/callback', async (req, res) => {
  try {
    await handleWalletTopupCallback(req, res);
  } catch (error) {
    console.error('❌ Wallet callback route error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Wallet API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;