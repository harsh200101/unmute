const express = require('express');
const { body } = require('express-validator');
const db = require('../config/database');
const auth = require('../middleware/auth');
const { rateLimit } = require('../middleware/auth');
const walletController = require('../controllers/walletController');

const router = express.Router();

// POST /api/payments/pay - Initiate wallet top-up payment
router.post(
  '/pay',
  auth,
  rateLimit(20, 15 * 60 * 1000), // 20 payments per 15 minutes
  [
    body('amount')
      .isFloat({ min: 1, max: 50000 })
      .withMessage('Amount must be between 1 and 50000 INR'),
  ],
  walletController.initiateWalletTopup
);

// POST /api/payments/callback - PhonePe webhook callback for wallet top-ups
router.post('/callback', walletController.handleWalletTopupCallback);

// GET /api/payments/status/:transactionId - Check wallet top-up payment status
router.get('/status/:transactionId', auth, async (req, res) => {
  try {
    const { transactionId } = req.params;

    const paymentRes = await db.query(
      `SELECT p.payment_status, p.amount, p.metadata
       FROM payments p
       WHERE p.transaction_id = $1
       AND p.session_id IS NULL
       AND JSON_EXTRACT_PATH_TEXT(p.metadata, 'type') = 'wallet_topup'
       AND JSON_EXTRACT_PATH_TEXT(p.metadata, 'userId') = $2`,
      [transactionId, req.user.userId.toString()]
    );

    if (paymentRes.rows.length === 0) {
      return res.status(404).json({ status: 'NOT_FOUND' });
    }

    const payment = paymentRes.rows[0];
    return res.json({
      status: payment.payment_status,
      amount: payment.amount
    });

  } catch (error) {
    console.error('❌ Status check error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// POST /api/payments/payment-status - Handle PhonePe redirect (some gateways POST to redirect URL)
router.post('/payment-status', (req, res) => {
  try {
    console.log('Payment status POST received:', {
      body: req.body,
      query: req.query,
      url: req.url,
      originalUrl: req.originalUrl
    });

    // PhonePe might POST transaction data to redirect URL
    const { transactionId } = req.body;
    const queryTransactionId = req.query.transactionId;

    const finalTransactionId = transactionId || queryTransactionId;

    console.log('Extracted transaction ID:', finalTransactionId);

    if (finalTransactionId) {
      // Redirect to frontend with transaction ID
      const frontendUrl = `${process.env.FRONTEND_REDIRECT_URL}?transactionId=${finalTransactionId}`;
      console.log('Redirecting to frontend:', frontendUrl);
      return res.redirect(302, frontendUrl);
    }

    // If no transaction ID, redirect to generic payment status page
    const fallbackUrl = process.env.FRONTEND_REDIRECT_URL || 'http://localhost:3000/payment-status';
    console.log('Redirecting to fallback:', fallbackUrl);
    return res.redirect(302, fallbackUrl);
  } catch (error) {
    console.error('Payment status redirect error:', error);
    const errorUrl = 'http://localhost:3000/payment-status';
    console.log('Redirecting to error fallback:', errorUrl);
    return res.redirect(302, errorUrl);
  }
});

// Health check for payments route
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Payments API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});


module.exports = router;

// Export the callback handler separately for direct access
module.exports.callback = router.stack.find(layer => layer.route?.path === '/callback')?.route?.stack.find(layer => layer.method === 'post')?.handle;