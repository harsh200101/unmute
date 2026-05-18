const { query, transaction } = require('../config/database');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const axios = require('axios');
const dns = require('dns').promises;
const { getWalletBalance, getWalletTransactions, creditWallet } = require('../services/walletService');
const { getClientUrl } = require('../utils/frontendUrl');

// PhonePe UAT Configuration - Production-grade
const PHONEPE_CONFIG = {
  baseUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  merchantId: 'PGTESTPAYUAT86',
  saltKey: '96434309-7796-489d-8924-ab56988a6076',
  saltIndex: 1,
  callbackUrl: process.env.PHONEPE_CALLBACK_URL || 'https://your-ngrok-url.ngrok-free.app/api/payments/callback',
  // Resolve at call time via getter so the frontend URL helper has the
  // current env. (Top-level const would freeze at module load before
  // possible env mutation; getter keeps it dynamic and safe.)
  get frontendRedirectUrl() {
    return process.env.FRONTEND_REDIRECT_URL || `${getClientUrl()}/payment/status`;
  }
};

/**
 * Get user's wallet balance
 * GET /api/wallet/balance
 */
exports.getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.userId;

    const balance = await getWalletBalance(userId);

    res.json({
      success: true,
      data: {
        balance: balance.balance,
        currency: balance.currency
      }
    });

  } catch (error) {
    console.error('❌ Get wallet balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wallet balance',
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * Get paginated wallet transaction history
 * GET /api/wallet/transactions?limit=50&offset=0&type=credit&startDate=2023-01-01&endDate=2023-12-31
 */
exports.getWalletTransactions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const type = req.query.type; // 'credit' or 'debit'
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    // Validate pagination parameters
    if (limit < 1 || limit > 100) {
      return res.status(422).json({
        success: false,
        message: 'Limit must be between 1 and 100',
        code: 'INVALID_LIMIT'
      });
    }

    if (offset < 0) {
      return res.status(422).json({
        success: false,
        message: 'Offset must be non-negative',
        code: 'INVALID_OFFSET'
      });
    }

    // Validate type filter
    if (type && !['credit', 'debit'].includes(type)) {
      return res.status(422).json({
        success: false,
        message: 'Type must be either credit or debit',
        code: 'INVALID_TYPE'
      });
    }

    // Validate date filters
    if (startDate && isNaN(Date.parse(startDate))) {
      return res.status(422).json({
        success: false,
        message: 'Invalid start date format',
        code: 'INVALID_START_DATE'
      });
    }

    if (endDate && isNaN(Date.parse(endDate))) {
      return res.status(422).json({
        success: false,
        message: 'Invalid end date format',
        code: 'INVALID_END_DATE'
      });
    }

    const transactions = await getWalletTransactions(userId, limit, offset, { type, startDate, endDate });

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          limit,
          offset,
          hasMore: transactions.length === limit
        }
      }
    });

  } catch (error) {
    console.error('❌ Get wallet transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wallet transactions',
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * Initiate wallet top-up payment
 * POST /api/wallet/topup
 */
exports.initiateWalletTopup = async (req, res) => {
  try {
    // Validate request data
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
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
      return res.status(422).json({
        success: false,
        message: 'Amount must be between 1 and 50000 INR',
        code: 'INVALID_AMOUNT'
      });
    }

    console.log('🔄 Initiating wallet top-up for user:', userId, 'amount:', amount);

    // Get user's wallet id
    const walletResult = await query(
      'SELECT id FROM wallets WHERE user_id = $1',
      [userId]
    );

    if (walletResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User wallet not found',
        code: 'WALLET_NOT_FOUND'
      });
    }

    const walletId = walletResult.rows[0].id;

    // Get user details for PhonePe payload
    const userResult = await query(
      'SELECT first_name, last_name, phone FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];
    const amountInPaisa = Math.round(amount * 100);

    // Create unique transaction ID
    const merchantTransactionId = 'WT' + crypto.randomUUID().replace(/-/g, '').substring(0, 26);

    // Prepare PhonePe payload
    const payload = {
      merchantId: PHONEPE_CONFIG.merchantId,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: userId.toString(),
      amount: amountInPaisa,
      redirectUrl: `${PHONEPE_CONFIG.frontendRedirectUrl}?transactionId=${merchantTransactionId}&type=wallet_topup`,
      redirectMode: 'POST',
      callbackUrl: PHONEPE_CONFIG.callbackUrl,
      mobileNumber: user.phone || '9999999999',
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

    // Real PhonePe API call
    console.log('🔍 PhonePe API URL:', `${PHONEPE_CONFIG.baseUrl}/pg/v1/pay`);

    // Call PhonePe API
    const response = await axios.post(`${PHONEPE_CONFIG.baseUrl}/pg/v1/pay`, { request: base64Payload }, { headers });
    const paymentUrl = response.data.data.instrumentResponse.redirectInfo.url;

    if (response.data.success) {
      // Save payment to database
      await query(
        `INSERT INTO payments (
          session_id, amount, currency, payment_gateway, transaction_id, payment_status,
          payment_method, mentor_earnings, wallet_id, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
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

      console.log('✅ Wallet top-up payment initiated:', merchantTransactionId);

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
    console.error('❌ Wallet top-up initiation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate wallet top-up',
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * Handle PhonePe callback for wallet top-up
 * POST /api/wallet/callback
 */
exports.handleWalletTopupCallback = async (req, res) => {
  const requestId = req.requestId || 'unknown';
  console.log(`🔄 [${requestId}] Wallet top-up callback received:`, {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    originalUrl: req.originalUrl,
    headers: {
      'content-type': req.headers['content-type'],
      'x-verify': req.headers['x-verify'] ? '[PRESENT]' : '[MISSING]',
      'user-agent': req.headers['user-agent'],
      'host': req.headers['host']
    },
    body: req.body,
    ip: req.ip,
    environment: {
      PHONEPE_CALLBACK_URL: process.env.PHONEPE_CALLBACK_URL,
      FRONTEND_REDIRECT_URL: process.env.FRONTEND_REDIRECT_URL,
      FRONTEND_URL: process.env.FRONTEND_URL,
      NODE_ENV: process.env.NODE_ENV
    }
  });

  try {
    // Strict validation for production PhonePe callbacks
    if (!req.body.response) {
      console.error(`❌ [${requestId}] Missing response field in callback payload`);
      return res.status(400).json({ status: "error", message: "Invalid payload format - missing response" });
    }

    const xVerifyHeader = req.headers['x-verify'];
    if (!xVerifyHeader) {
      console.error(`❌ [${requestId}] Missing X-VERIFY header`);
      return res.status(403).json({ status: "error", message: "Missing X-VERIFY header" });
    }

    console.log(`🔍 [${requestId}] Decoding base64 response...`);
    // Decode and parse payload
    const decodedResponse = Buffer.from(req.body.response, 'base64').toString('utf-8');
    const payload = JSON.parse(decodedResponse);

    console.log(`✅ [${requestId}] Parsed callback payload:`, {
      success: payload.success,
      code: payload.code,
      message: payload.message,
      merchantId: payload.data?.merchantId,
      merchantTransactionId: payload.data?.merchantTransactionId,
      transactionId: payload.data?.transactionId,
      amount: payload.data?.amount,
      state: payload.data?.state
    });

    // Validate checksum
    console.log(`🔐 [${requestId}] Validating checksum...`);
    const base64PayloadString = req.body.response;
    const stringToHash = base64PayloadString + PHONEPE_CONFIG.saltKey;
    const calculatedHash = crypto.createHash('sha256').update(stringToHash).digest('hex');
    const calculatedChecksum = `${calculatedHash}###${PHONEPE_CONFIG.saltIndex}`;

    console.log(`🔍 [${requestId}] Checksum details:`, {
      received: xVerifyHeader,
      calculated: calculatedChecksum,
      match: calculatedChecksum === xVerifyHeader
    });

    if (calculatedChecksum !== xVerifyHeader) {
      console.error(`❌ [${requestId}] Checksum validation failed`, {
        received: xVerifyHeader,
        calculated: calculatedChecksum,
      });
      return res.status(403).json({ status: "error", message: "Invalid checksum" });
    }

    console.log(`✅ [${requestId}] Checksum verified successfully`);

    // Get transaction details
    const merchantTransactionId = payload.data ? payload.data.merchantTransactionId : payload.transactionId;
    const paymentStatus = payload.code;

    console.log(`📊 [${requestId}] Parsed callback data:`, {
      merchantTransactionId,
      paymentStatus,
      responseCode: payload.code,
      responseMessage: payload.message,
      fullPayload: payload
    });

    // Update payment status
    let dbStatus = 'pending';
    if (paymentStatus === 'PAYMENT_SUCCESS') {
      dbStatus = 'completed';
    } else if (paymentStatus === 'PAYMENT_ERROR') {
      dbStatus = 'failed';
    }

    console.log(`🔄 [${requestId}] Updating wallet top-up payment ${merchantTransactionId} to status: ${dbStatus}`);

    const paymentUpdate = await query(
      `UPDATE payments
       SET payment_status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE transaction_id = $1 AND metadata ->> 'type' = 'wallet_topup'
       RETURNING id, amount, metadata`,
      [merchantTransactionId, dbStatus]
    );

    console.log(`💾 [${requestId}] Payment update result:`, {
      rowsAffected: paymentUpdate.rows.length,
      updatedPayment: paymentUpdate.rows[0] ? {
        id: paymentUpdate.rows[0].id,
        amount: paymentUpdate.rows[0].amount,
        metadata: paymentUpdate.rows[0].metadata
      } : null
    });

    if (paymentUpdate.rows.length > 0 && dbStatus === 'completed') {
      const payment = paymentUpdate.rows[0];
      const metadata = payment.metadata || {};
      const userId = parseInt(metadata.userId);
      const amount = parseFloat(payment.amount);

      console.log(`🔄 [${requestId}] Crediting wallet for user ${userId} with amount ${amount}`);

      // Credit the wallet
      try {
        await creditWallet(userId, amount, payment.id, 'Wallet Top-up');
        console.log(`✅ [${requestId}] Wallet credited successfully`);
      } catch (creditError) {
        console.error(`❌ [${requestId}] Failed to credit wallet:`, creditError);
        // Don't fail the callback, but log the error
      }
    }

    console.log(`✅ [${requestId}] Wallet top-up callback processing completed for ${merchantTransactionId}`);

    // Return 200 OK to acknowledge callback receipt (webhook standard)
    // Do not redirect - PhonePe expects 200 response for successful callback processing
    console.log(`📋 [${requestId}] Returning 200 OK response for callback acknowledgment`);
    return res.status(200).json({
      status: 'OK',
      message: 'Callback processed successfully',
      transactionId: merchantTransactionId
    });

  } catch (error) {
    console.error(`❌ [${requestId}] Wallet top-up callback error:`, error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

/**
 * Check payment status
 * GET /api/payments/status/:transactionId
 */
exports.checkPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Get payment from database
    const paymentResult = await query(
      `SELECT p.payment_status, p.amount, p.metadata
       FROM payments p
       WHERE p.transaction_id = $1
       AND p.session_id IS NULL
       AND p.metadata ->> 'type' = 'wallet_topup'
       AND p.metadata ->> 'userId' = $2`,
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

    // For now, just return pending status since we don't have status check API implemented
    // In production, you would call PhonePe status API here
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

module.exports = exports;