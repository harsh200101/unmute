const { query } = require('../config/database');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const axios = require('axios');
const PhonePeService = require('../services/phonePeService');
const { creditWallet } = require('../services/walletService');

const phonePeService = new PhonePeService();

/**
 * Initiate wallet top-up payment
 * POST /api/payments/initiate
 */
exports.initiatePayment = async (req, res) => {
  const requestId = req.requestId || 'unknown';
  try {
    console.log(`🔄 [${requestId}] Payment initiation started:`, {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      body: req.body,
      user: req.user ? { userId: req.user.userId, email: req.user.email } : null,
      environment: {
        PHONEPE_CALLBACK_URL: process.env.PHONEPE_CALLBACK_URL,
        FRONTEND_REDIRECT_URL: process.env.FRONTEND_REDIRECT_URL,
        FRONTEND_URL: process.env.FRONTEND_URL
      }
    });

    // Validate request data
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log(`❌ [${requestId}] Validation failed:`, errors.array());
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { amount } = req.body;
    const userId = req.user.userId;

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 50000) {
      console.log(`❌ [${requestId}] Invalid amount:`, { amount, type: typeof amount });
      return res.status(422).json({
        success: false,
        message: 'Amount must be between 1 and 50000 INR',
        code: 'INVALID_AMOUNT'
      });
    }

    console.log(`🔄 [${requestId}] Initiating wallet top-up payment for user:`, userId, 'amount:', amount);

    // Get user's wallet id
    const walletResult = await query(
      'SELECT id FROM wallets WHERE user_id = $1',
      [userId]
    );

    if (walletResult.rows.length === 0) {
      console.log(`❌ [${requestId}] User wallet not found for user:`, userId);
      return res.status(404).json({
        success: false,
        message: 'User wallet not found',
        code: 'WALLET_NOT_FOUND'
      });
    }

    const walletId = walletResult.rows[0].id;
    console.log(`✅ [${requestId}] Found wallet ID:`, walletId);

    // Get user details for PhonePe payload
    const userResult = await query(
      'SELECT first_name, last_name, phone FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      console.log(`❌ [${requestId}] User not found:`, userId);
      return res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];
    console.log(`✅ [${requestId}] Found user details:`, {
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone ? '[PRESENT]' : '[MISSING]'
    });

    // Create unique transaction ID
    const merchantTransactionId = 'WT' + crypto.randomUUID().replace(/-/g, '').substring(0, 26);
    console.log(`🆔 [${requestId}] Generated transaction ID:`, merchantTransactionId);

    // Prepare URLs
    const callbackUrl = process.env.PHONEPE_CALLBACK_URL;
    const redirectUrl = `${process.env.FRONTEND_REDIRECT_URL}?transactionId=${merchantTransactionId}&type=wallet_topup`;

    console.log(`🔗 [${requestId}] URLs configured:`, {
      callbackUrl: callbackUrl,
      redirectUrl: redirectUrl
    });

    // Always use real PhonePe API
    console.log(`🔍 [${requestId}] Initiating real PhonePe payment`);
    const phonePeRedirectUrl = await phonePeService.initiatePayment(
      amount,
      merchantTransactionId,
      callbackUrl,
      redirectUrl,
      {
        userId: userId,
        phone: user.phone
      }
    );

    console.log(`✅ [${requestId}] PhonePe API response - redirect URL:`, phonePeRedirectUrl);

    // Save payment to database
    const paymentInsert = await query(
      `INSERT INTO payments (
        session_id, amount, currency, payment_gateway, transaction_id, payment_status,
        payment_method, mentor_earnings, wallet_id, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
      [
        null, // session_id is NULL for wallet top-ups
        amount,
        'INR',
        'phonepe',
        merchantTransactionId,
        'pending',
        'bank_transfer',
        0, // mentor_earnings is 0 for wallet top-ups
        walletId, // wallet_id for wallet top-ups
        JSON.stringify({
          type: 'wallet_topup',
          userId: userId.toString(),
          description: 'Wallet Top-up'
        })
      ]
    );

    console.log(`💾 [${requestId}] Payment saved to database:`, {
      paymentId: paymentInsert.rows[0].id,
      transactionId: merchantTransactionId,
      amount: amount,
      status: 'pending'
    });

    console.log(`✅ [${requestId}] Payment initiated successfully:`, merchantTransactionId);

    const responseData = {
      success: true,
      redirectUrl: phonePeRedirectUrl,
      transactionId: merchantTransactionId
    };

    console.log(`📤 [${requestId}] Sending response:`, responseData);

    return res.json(responseData);

  } catch (error) {
    console.error(`❌ [${requestId}] Payment initiation error:`, error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate payment',
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * Handle PhonePe callback/webhook
 * POST /api/payments/callback
 */
exports.handleCallback = async (req, res) => {
  console.log('🔄 Payment callback received:', {
    timestamp: new Date().toISOString(),
    headers: req.headers,
    body: req.body,
    ip: req.ip
  });

  try {
    // Handle both production and test payload formats
    let base64Body;
    if (req.body.response) {
      // Production format
      base64Body = req.body.response;
    } else if (req.body.code && req.body.transactionId) {
      // Test format (if needed)
      base64Body = Buffer.from(JSON.stringify(req.body)).toString('base64');
    } else {
      console.error('❌ Unrecognized callback payload format');
      return res.status(400).json({ status: "error", message: "Invalid payload format" });
    }

    const xVerifyHeader = req.headers['x-verify'];

    let payload;
    if (xVerifyHeader) {
      // Production callback with X-VERIFY header
      payload = phonePeService.handleCallback(base64Body, xVerifyHeader);
    } else {
      // Simulator callback without X-VERIFY header
      console.log('⚠️ Processing simulator callback without X-VERIFY header');
      payload = JSON.parse(Buffer.from(base64Body, 'base64').toString('utf8'));
    }

    console.log('✅ Callback payload verified:', payload);

    // Extract transaction details
    const merchantTransactionId = payload.data?.merchantTransactionId || payload.transactionId;
    const paymentStatus = payload.code;

    console.log('📊 Processing callback:', {
      merchantTransactionId,
      paymentStatus,
      responseCode: payload.code,
      responseMessage: payload.message
    });

    // Determine database status
    let dbStatus = 'pending';
    if (paymentStatus === 'PAYMENT_SUCCESS') {
      dbStatus = 'completed';
    } else if (paymentStatus === 'PAYMENT_ERROR' || paymentStatus === 'PAYMENT_DECLINED') {
      dbStatus = 'failed';
    }

    // Update payment status (idempotent - handle duplicate callbacks)
    const paymentUpdate = await query(
      `UPDATE payments
       SET payment_status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE transaction_id = $1 AND payment_status != 'completed'
       RETURNING id, amount, metadata`,
      [merchantTransactionId, dbStatus]
    );

    console.log('💾 Payment update result:', {
      rowsAffected: paymentUpdate.rows.length,
      newStatus: dbStatus
    });

    // Credit wallet if payment completed and not already processed
    if (dbStatus === 'completed' && paymentUpdate.rows.length > 0) {
      const payment = paymentUpdate.rows[0];
      const metadata = JSON.parse(payment.metadata || '{}');
      const userId = parseInt(metadata.userId);
      const amount = parseFloat(payment.amount);

      console.log(`🔄 Crediting wallet for user ${userId} with amount ${amount}`);

      try {
        await creditWallet(userId, amount, payment.id, 'Wallet Top-up');
        console.log('✅ Wallet credited successfully');
      } catch (creditError) {
        console.error('❌ Failed to credit wallet:', creditError);
        // Don't fail callback, but log error
      }
    }

    console.log(`✅ Payment callback processing completed for ${merchantTransactionId}`);

    // Return 200 OK to acknowledge callback receipt (webhook standard)
    // Do not redirect - PhonePe expects 200 response for successful callback processing
    return res.status(200).json({
      status: 'OK',
      message: 'Callback processed successfully',
      transactionId: merchantTransactionId
    });

  } catch (error) {
    console.error('❌ Payment callback error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error processing callback'
    });
  }
};

/**
 * Check payment status
 * GET /api/payments/status/:transactionId
 */
exports.checkStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Get payment from database
    const paymentResult = await query(
      `SELECT p.payment_status, p.amount, p.metadata
       FROM payments p
       WHERE p.transaction_id = $1
       AND p.session_id IS NULL
       AND JSON_EXTRACT_PATH_TEXT(p.metadata, 'type') = 'wallet_topup'
       AND JSON_EXTRACT_PATH_TEXT(p.metadata, 'userId') = $2`,
      [transactionId, req.user.userId.toString()]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ status: 'NOT_FOUND' });
    }

    const payment = paymentResult.rows[0];

    // If already completed/failed, return cached status
    if (payment.payment_status !== 'pending') {
      return res.json({
        status: payment.payment_status,
        amount: payment.amount
      });
    }

    // Check with PhonePe
    try {
      const statusResponse = await phonePeService.checkStatus(transactionId);

      if (statusResponse.success && statusResponse.data) {
        const phonePeStatus = statusResponse.data.state;

        // Update local status if changed
        let dbStatus = payment.payment_status;
        if (phonePeStatus === 'COMPLETED' && dbStatus !== 'completed') {
          dbStatus = 'completed';
          await query('UPDATE payments SET payment_status = $1 WHERE transaction_id = $2', [dbStatus, transactionId]);
        } else if (phonePeStatus === 'FAILED' && dbStatus !== 'failed') {
          dbStatus = 'failed';
          await query('UPDATE payments SET payment_status = $1 WHERE transaction_id = $2', [dbStatus, transactionId]);
        }

        return res.json({
          status: dbStatus,
          amount: payment.amount
        });
      }
    } catch (phonePeError) {
      console.error('PhonePe status check failed:', phonePeError);
      // Fall back to database status
    }

    // Return database status as fallback
    return res.json({
      status: payment.payment_status,
      amount: payment.amount
    });

  } catch (error) {
    console.error('❌ Status check error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};