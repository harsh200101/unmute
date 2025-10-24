const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const auth = require('../middleware/auth');
const { rateLimit } = require('../middleware/auth');
const axios = require('axios');
const crypto = require('crypto');
const dns = require('dns').promises;

const router = express.Router();

// PhonePe Configuration
const PHONEPE_CONFIG = {
  merchantId: process.env.PHONEPE_MERCHANT_ID,
  saltKey: process.env.PHONEPE_SALT_KEY,
  saltIndex: process.env.PHONEPE_SALT_INDEX,
  payApiUrl: process.env.PHONEPE_PAY_API_URL,
  statusApiUrl: process.env.PHONEPE_STATUS_API_URL,
  frontendRedirectUrl: process.env.FRONTEND_REDIRECT_URL,
  callbackUrl: process.env.PHONEPE_CALLBACK_URL
};

// POST /api/payments/pay - Initiate PhonePe payment
router.post(
  '/pay',
  auth,
  rateLimit(20, 15 * 60 * 1000), // 20 payments per 15 minutes
  [
    body('sessionId')
      .isInt({ min: 1 })
      .withMessage('Valid sessionId is required'),
    body('amount')
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be a positive number'),
  ],
  async (req, res) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { sessionId, amount } = req.body;
      const userId = req.user.userId;

      // Get session details
      const sessionRes = await db.query(
        `SELECT s.id, s.price, s.currency, s.mentor_id, s.mentee_id, s.status,
                u.first_name, u.last_name, u.phone
         FROM sessions s
         JOIN users u ON s.mentee_id = u.id
         WHERE s.id = $1 AND s.mentee_id = $2`,
        [sessionId, userId]
      );

      if (sessionRes.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Session not found or access denied'
        });
      }

      const session = sessionRes.rows[0];

      // Check if payment already exists and is pending
      const existingPayment = await db.query(
        `SELECT id, payment_status FROM payments WHERE session_id = $1 AND payment_status = 'pending'`,
        [sessionId]
      );

      if (existingPayment.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'A pending payment already exists for this session'
        });
      }

      // Amount in rupees (default to session price if not provided)
      const amountInRupees = amount || session.price;
      const amountInPaisa = Math.round(amountInRupees * 100);

      // Create unique transaction ID
      const merchantTransactionId = 'M' + crypto.randomUUID().replace(/-/g, '').substring(0, 28);

      // Prepare PhonePe payload
      const payload = {
        merchantId: PHONEPE_CONFIG.merchantId,
        merchantTransactionId: merchantTransactionId,
        merchantUserId: userId.toString(),
        amount: amountInPaisa,
        redirectUrl: `${PHONEPE_CONFIG.frontendRedirectUrl}?transactionId=${merchantTransactionId}`,
        redirectMode: 'POST',
        callbackUrl: PHONEPE_CONFIG.callbackUrl,
        mobileNumber: session.phone || '9999999999',
        paymentInstrument: {
          type: 'PAY_PAGE'
        }
      };

      // Create base64 encoded payload
      const jsonPayload = JSON.stringify(payload);
      const base64Payload = Buffer.from(jsonPayload).toString('base64');

      // Create X-VERIFY signature
      const verificationString = `${base64Payload}/pg/v1/pay${PHONEPE_CONFIG.saltKey}`;
      const sha256Hash = crypto.createHash('sha256').update(verificationString).digest('hex');
      const xVerifySignature = `${sha256Hash}###${PHONEPE_CONFIG.saltIndex}`;

      const headers = {
        'Content-Type': 'application/json',
        'X-VERIFY': xVerifySignature,
        'accept': 'application/json'
      };

      // Log PhonePe config for debugging
      console.log('🔍 PhonePe API URL:', PHONEPE_CONFIG.payApiUrl);
      console.log('🔍 Merchant ID:', PHONEPE_CONFIG.merchantId);

      // DNS resolution check
      try {
        const dnsResult = await dns.lookup('api-preprod.phonepe.com');
        console.log('✅ DNS resolution successful for api-preprod.phonepe.com:', dnsResult.address);
      } catch (dnsError) {
        console.error('❌ DNS resolution failed for api-preprod.phonepe.com:', dnsError.message);
      }

      // Call PhonePe API
      const response = await axios.post(PHONEPE_CONFIG.payApiUrl, { request: base64Payload }, { headers });

      if (response.data.success) {
        const paymentUrl = response.data.data.instrumentResponse.redirectInfo.url;

        // Calculate mentor earnings (amount - platform fee)
        // Using 10% platform fee as in session creation
        const platformFeeRate = parseFloat(process.env.PLATFORM_FEE_RATE || '0.1');
        const platformFee = amountInRupees * platformFeeRate;
        const mentorEarnings = amountInRupees - platformFee;

        // Save payment to database
        await db.query(
          `INSERT INTO payments (
            session_id, amount, currency, platform_fee, mentor_earnings,
            payment_gateway, transaction_id, payment_status, payment_method,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            sessionId,
            amountInRupees,
            'INR',
            platformFee,
            mentorEarnings,
            'phonepe',
            merchantTransactionId,
            'pending',
            'bank_transfer'
          ]
        );

        return res.json({
          success: true,
          redirectUrl: paymentUrl,
          transactionId: merchantTransactionId
        });
      } else {
        return res.status(400).json({
          success: false,
          message: response.data.message || 'Payment initiation failed'
        });
      }
    } catch (error) {
      console.error('❌ Payment initiation error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status,
        code: error.code,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers
        }
      });

      // Additional DNS check on error
      if (error.code === 'ENOTFOUND') {
        try {
          const dnsResult = await dns.lookup('api-preprod.phonepe.com');
          console.log('🔍 DNS lookup on error:', dnsResult);
        } catch (dnsError) {
          console.error('🔍 DNS lookup failed on error:', dnsError.message);
        }
      }
      return res.status(500).json({
        success: false,
        message: 'Failed to initiate payment',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? {
          code: error.code,
          response: error.response?.data
        } : undefined
      });
    }
  }
);

// POST /api/payments/callback - PhonePe webhook callback
router.post('/callback', async (req, res) => {
  console.log('🔄 PhonePe callback received:', {
    timestamp: new Date().toISOString(),
    headers: req.headers,
    body: req.body,
    ip: req.ip
  });

  try {
    const responsePayload = req.body;

    if (!responsePayload || !responsePayload.response) {
      console.log('❌ Invalid payload received:', responsePayload);
      return res.status(400).json({ status: 'error', message: 'Invalid payload' });
    }

    // Decode base64 response
    const base64DecodedResponse = Buffer.from(responsePayload.response, 'base64').toString('utf-8');

    // Verify signature
    const xVerifyHeader = req.headers['x-verify'];
    if (!xVerifyHeader) {
      return res.status(400).json({ status: 'error', message: 'Missing X-VERIFY header' });
    }

    const verificationString = `${responsePayload.response}${PHONEPE_CONFIG.saltKey}`;
    const sha256Hash = crypto.createHash('sha256').update(verificationString).digest('hex');
    const recreatedSignature = `${sha256Hash}###${PHONEPE_CONFIG.saltIndex}`;

    if (recreatedSignature !== xVerifyHeader) {
      console.warn('Signature verification failed!');
      return res.status(400).json({ status: 'error', message: 'Signature verification failed' });
    }

    // Parse response
    const responseData = JSON.parse(base64DecodedResponse);
    const merchantTransactionId = responseData.data.merchantTransactionId;
    const paymentStatus = responseData.code;

    console.log('📊 Parsed callback data:', {
      merchantTransactionId,
      paymentStatus,
      responseCode: responseData.code,
      responseMessage: responseData.message
    });

    // Update payment status
    let dbStatus = 'pending';
    if (paymentStatus === 'PAYMENT_SUCCESS') {
      dbStatus = 'completed';
    } else if (paymentStatus === 'PAYMENT_ERROR') {
      dbStatus = 'failed';
    }

    console.log(`🔄 Updating payment ${merchantTransactionId} to status: ${dbStatus}`);

    const paymentUpdate = await db.query(
      `UPDATE payments
       SET payment_status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE transaction_id = $1
       RETURNING session_id`,
      [merchantTransactionId, dbStatus]
    );

    console.log('💾 Payment update result:', {
      rowsAffected: paymentUpdate.rows.length,
      sessionId: paymentUpdate.rows[0]?.session_id
    });

    if (paymentUpdate.rows.length > 0 && dbStatus === 'completed') {
      const sessionId = paymentUpdate.rows[0].session_id;

      console.log(`🔄 Updating session ${sessionId} status to confirmed`);

      // Update session status to confirmed
      const sessionUpdate = await db.query(
        `UPDATE sessions
         SET status = CASE
                       WHEN status IN ('pending', 'scheduled') THEN 'confirmed'
                       ELSE status
                     END,
             confirmed_at = CASE
                              WHEN status IN ('pending', 'scheduled') THEN CURRENT_TIMESTAMP
                              ELSE confirmed_at
                            END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [sessionId]
      );

      console.log('💾 Session update result:', {
        rowsAffected: sessionUpdate.rows.length
      });
    }

    console.log(`✅ Callback processing completed for ${merchantTransactionId}`);
    return res.json({ status: 'ok' });

  } catch (error) {
    console.error('❌ Callback error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// GET /api/payments/status/:transactionId - Check payment status
router.get('/status/:transactionId', auth, async (req, res) => {
  try {
    const { transactionId } = req.params;

    const paymentRes = await db.query(
      `SELECT p.payment_status, p.amount, s.id as session_id
       FROM payments p
       LEFT JOIN sessions s ON p.session_id = s.id
       WHERE p.transaction_id = $1 AND s.mentee_id = $2`,
      [transactionId, req.user.userId]
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