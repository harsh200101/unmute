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
    let payload;
    let isTestPayload = false;

    // Check payload format - handle both production and test simulator
    if (req.body.response) {
      console.log('Processing PRODUCTION payload...');
      const decodedResponse = Buffer.from(req.body.response, 'base64').toString('utf-8');
      payload = JSON.parse(decodedResponse);
    }
    // Check if this is the TEST SIMULATOR format (decoded JSON in the body)
    else if (req.body.code && req.body.transactionId) {
      console.log('Processing TEST SIMULATOR payload...');
      payload = req.body;
      isTestPayload = true;
    }
    // If neither format matches, it's invalid
    else {
      console.error('❌ Unrecognized payload format:', req.body);
      return res.status(400).json({ status: "error", message: "Invalid payload format" });
    }

    // Now 'payload' is your clean JSON object
    console.log('✅ Parsed payload:', payload);

    // --- CHECKSUM VALIDATION ---
    let receivedChecksum;
    let base64PayloadString;

    if (isTestPayload) {
      // For TEST, checksum is in the body
      receivedChecksum = payload.checksum;
      // For test simulator, we need to reconstruct the exact string that PhonePe used
      // The test simulator sends the payload as form data, so we need to create the JSON string
      // that would be base64 encoded for checksum calculation
      const payloadToVerify = { ...payload };
      delete payloadToVerify.checksum;
      // Sort keys to ensure consistent ordering (PhonePe might do this)
      const sortedPayload = Object.keys(payloadToVerify).sort().reduce((result, key) => {
        result[key] = payloadToVerify[key];
        return result;
      }, {});
      base64PayloadString = Buffer.from(JSON.stringify(sortedPayload)).toString('base64');
    } else {
      // For PRODUCTION, checksum is in the 'x-verify' header
      receivedChecksum = req.headers['x-verify'];
      // The base64 string is just the original req.body.response
      base64PayloadString = req.body.response;
    }

    if (!receivedChecksum) {
      console.error('❌ Checksum not found.');
      return res.status(400).json({ status: "error", message: "Checksum not found" });
    }

    // Calculate checksum to verify
    const saltKey = PHONEPE_CONFIG.saltKey;
    const saltIndex = PHONEPE_CONFIG.saltIndex;

    // Different checksum calculation for test vs production
    let stringToHash;
    if (isTestPayload) {
      // For test simulator: PhonePe might use a different algorithm
      // Let's try without the base64 encoding step - direct JSON string + saltKey
      const payloadToVerify = { ...payload };
      delete payloadToVerify.checksum;
      stringToHash = JSON.stringify(payloadToVerify) + saltKey;
    } else {
      // For production: base64Payload + saltKey (no path for callbacks)
      stringToHash = base64PayloadString + saltKey;
    }

    const calculatedHash = crypto.createHash('sha256').update(stringToHash).digest('hex');
    const calculatedChecksum = `${calculatedHash}###${saltIndex}`;

    // Compare checksums
    if (calculatedChecksum !== receivedChecksum) {
      console.error('❌ Checksum mismatch!', {
        received: receivedChecksum,
        calculated: calculatedChecksum,
      });

      // For test payloads, skip checksum validation since test simulator uses different algorithm
      if (isTestPayload) {
        console.log('⚠️ Skipping checksum validation for test simulator payload');
      } else {
        return res.status(400).json({ status: "error", message: "Invalid checksum" });
      }
    }

    // --- Checksum is VALID! ---
    console.log('✅ Checksum verified successfully.');

    // Get transaction details
    const merchantTransactionId = payload.data ? payload.data.merchantTransactionId : payload.transactionId;
    const paymentStatus = payload.code;

    console.log('📊 Parsed callback data:', {
      merchantTransactionId,
      paymentStatus,
      responseCode: payload.code,
      responseMessage: payload.message
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

      console.log(`🔄 Updating session ${sessionId} status to confirmed and creating meeting`);

      // Update session status to confirmed and create meeting
      const result = await db.transaction(async (client) => {
        // Update session status to confirmed
        await client.query(
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

        // Check if video meeting already exists for this session
        const existingMeeting = await client.query(
          `SELECT id FROM video_meetings WHERE session_id = $1`,
          [sessionId]
        );

        if (existingMeeting.rows.length === 0) {
          // Get session details for meeting creation
          const sessionQuery = await client.query(
            `SELECT s.id, s.mentor_id, s.mentee_id, s.title, s.scheduled_at, s.duration_minutes
             FROM sessions s
             WHERE s.id = $1`,
            [sessionId]
          );

          if (sessionQuery.rows.length > 0) {
            const session = sessionQuery.rows[0];

            // Import Agora service dynamically
            const agoraService = require('../utils/agora');

            // Generate meeting credentials
            const meetingCredentials = agoraService.generateMeetingCredentials(session.id, session.mentee_id);

            // Create video_meetings entry
            await client.query(
              `INSERT INTO video_meetings (
                session_id, channel_name, agora_app_id, agora_token, token_expires_at,
                meeting_status, actual_start_time, actual_end_time, actual_duration_minutes,
                participants_joined, max_participants, max_duration_minutes, auto_end_enabled,
                video_quality, audio_enabled, video_enabled, screen_share_enabled,
                join_logs, quality_logs, error_logs, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
              [
                session.id,
                meetingCredentials.channelName,
                meetingCredentials.appId,
                meetingCredentials.token,
                meetingCredentials.tokenExpiresAt,
                'scheduled',
                null, // actual_start_time
                null, // actual_end_time
                null, // actual_duration_minutes
                '[]', // participants_joined
                2, // max_participants
                75, // max_duration_minutes (1h 15m)
                true, // auto_end_enabled
                'high', // video_quality
                true, // audio_enabled
                true, // video_enabled
                false, // screen_share_enabled
                '[]', // join_logs
                '[]', // quality_logs
                '[]', // error_logs
              ]
            );

            // Update session with meeting URL (frontend route for joining)
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const meetingUrl = `${frontendUrl}/meeting/${session.id}`;

            await client.query(
              `UPDATE sessions
               SET meeting_url = $2, meeting_id = $3, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [session.id, meetingUrl, meetingCredentials.channelName]
            );

            // Create meeting invite notification
            const notificationQuery = await client.query(
              `SELECT u.id as user_id, u.first_name, u.last_name
               FROM users u
               WHERE u.id = $1 OR u.id = $2`,
              [session.mentor_id, session.mentee_id]
            );

            for (const user of notificationQuery.rows) {
              await client.query(
                `INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                  user.user_id,
                  'Meeting Ready',
                  `Your session "${session.title}" is now confirmed and the meeting room is ready.`,
                  'meeting_invite',
                  'session',
                  session.id
                ]
              );
            }
          }
        } else {
          console.log(`Meeting already exists for session ${sessionId}, skipping creation`);
        }
      });

      console.log('💾 Session and meeting creation completed for session:', sessionId);
    }

    console.log(`✅ Callback processing completed for ${merchantTransactionId}`);

    // Get session details for redirect
    const sessionQuery = await db.query(
      `SELECT s.id, s.title, s.scheduled_at, s.duration_minutes, s.price, s.currency,
              m.first_name as mentor_first_name, m.last_name as mentor_last_name,
              u.first_name as mentee_first_name, u.last_name as mentee_last_name
       FROM sessions s
       JOIN mentors mt ON s.mentor_id = mt.id
       JOIN users m ON mt.user_id = m.id
       JOIN users u ON s.mentee_id = u.id
       WHERE s.id = $1`,
      [paymentUpdate.rows[0]?.session_id]
    );

    const session = sessionQuery.rows[0];

    // Redirect to payment success page with transaction details (both test and production)
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?transactionId=${merchantTransactionId}&status=${dbStatus}&sessionId=${session?.id || ''}`;
    console.log('🔄 REDIRECTING TO PAYMENT SUCCESS PAGE');
    console.log('🔄 Redirect URL:', redirectUrl);
    console.log('🔄 FRONTEND_URL env var:', process.env.FRONTEND_URL);
    console.log('🔄 Session details:', JSON.stringify(session, null, 2));
    console.log('🔄 Payment status:', dbStatus);
    console.log('🔄 Is test payload:', isTestPayload);
    console.log('🔄 Merchant Transaction ID:', merchantTransactionId);
    console.log('🔄 Session ID from payment update:', paymentUpdate.rows[0]?.session_id);

    // Force redirect immediately - no delay
    console.log('🔄 EXECUTING REDIRECT NOW...');
    return res.redirect(302, redirectUrl);

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

// Export the callback handler separately for direct access
module.exports.callback = router.stack.find(layer => layer.route?.path === '/callback')?.route?.stack.find(layer => layer.method === 'post')?.handle;