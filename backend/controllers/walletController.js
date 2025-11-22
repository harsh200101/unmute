const { query, transaction } = require('../config/database');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const axios = require('axios');
const dns = require('dns').promises;
const { getWalletBalance, getWalletTransactions, creditWallet } = require('../services/walletService');

// PhonePe Configuration (same as payments.js)
const PHONEPE_CONFIG = {
  merchantId: process.env.PHONEPE_MERCHANT_ID,
  saltKey: process.env.PHONEPE_SALT_KEY,
  saltIndex: process.env.PHONEPE_SALT_INDEX,
  payApiUrl: process.env.PHONEPE_PAY_API_URL,
  statusApiUrl: process.env.PHONEPE_STATUS_API_URL,
  frontendRedirectUrl: process.env.FRONTEND_REDIRECT_URL,
  callbackUrl: process.env.PHONEPE_CALLBACK_URL
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
 * GET /api/wallet/transactions?limit=50&offset=0
 */
exports.getWalletTransactions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

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

    const transactions = await getWalletTransactions(userId, limit, offset);

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

    // Check if there's already a pending top-up for this user
    const existingTopup = await query(
      `SELECT id FROM payments
       WHERE payment_gateway = 'phonepe'
       AND payment_status = 'pending'
       AND session_id IS NULL
       AND metadata ->> 'type' = 'wallet_topup'
       AND metadata ->> 'userId' = $1`,
      [userId.toString()]
    );

    if (existingTopup.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A pending wallet top-up already exists for this user',
        code: 'PENDING_TOPUP_EXISTS'
      });
    }

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
      callbackUrl: `${PHONEPE_CONFIG.callbackUrl}/wallet`,
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

    console.log('🔍 PhonePe API URL:', PHONEPE_CONFIG.payApiUrl);

    // DNS resolution check
    try {
      const dnsResult = await dns.lookup('api-preprod.phonepe.com');
      console.log('✅ DNS resolution successful for api-preprod.phonepe.com');
    } catch (dnsError) {
      console.error('❌ DNS resolution failed for api-preprod.phonepe.com');
    }

    // Call PhonePe API
    const response = await axios.post(PHONEPE_CONFIG.payApiUrl, { request: base64Payload }, { headers });

    if (response.data.success) {
      const paymentUrl = response.data.data.instrumentResponse.redirectInfo.url;

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
  console.log('🔄 Wallet top-up callback received:', {
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
    // Check if this is the TEST SIMULATOR format
    else if (req.body.code && req.body.transactionId) {
      console.log('Processing TEST SIMULATOR payload...');
      payload = req.body;
      isTestPayload = true;
    }
    else {
      console.error('❌ Unrecognized payload format:', req.body);
      return res.status(400).json({ status: "error", message: "Invalid payload format" });
    }

    console.log('✅ Parsed payload:', payload);

    // --- CHECKSUM VALIDATION ---
    let receivedChecksum;
    let base64PayloadString;

    if (isTestPayload) {
      receivedChecksum = payload.checksum;
      const payloadToVerify = { ...payload };
      delete payloadToVerify.checksum;
      const sortedPayload = Object.keys(payloadToVerify).sort().reduce((result, key) => {
        result[key] = payloadToVerify[key];
        return result;
      }, {});
      base64PayloadString = Buffer.from(JSON.stringify(sortedPayload)).toString('base64');
    } else {
      receivedChecksum = req.headers['x-verify'];
      base64PayloadString = req.body.response;
    }

    if (!receivedChecksum) {
      console.error('❌ Checksum not found.');
      return res.status(400).json({ status: "error", message: "Checksum not found" });
    }

    // Calculate checksum
    const saltKey = PHONEPE_CONFIG.saltKey;
    const saltIndex = PHONEPE_CONFIG.saltIndex;

    let stringToHash;
    if (isTestPayload) {
      const payloadToVerify = { ...payload };
      delete payloadToVerify.checksum;
      stringToHash = JSON.stringify(payloadToVerify) + saltKey;
    } else {
      stringToHash = base64PayloadString + saltKey;
    }

    const calculatedHash = crypto.createHash('sha256').update(stringToHash).digest('hex');
    const calculatedChecksum = `${calculatedHash}###${saltIndex}`;

    if (calculatedChecksum !== receivedChecksum) {
      console.log('❌ Checksum mismatch!', {
        received: receivedChecksum,
        calculated: calculatedChecksum,
      });

      if (isTestPayload) {
        console.log('⚠️ Skipping checksum validation for test simulator payload');
      } else {
        return res.status(400).json({ status: "error", message: "Invalid checksum" });
      }
    }

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

    console.log(`🔄 Updating wallet top-up payment ${merchantTransactionId} to status: ${dbStatus}`);

    const paymentUpdate = await query(
      `UPDATE payments
       SET payment_status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE transaction_id = $1 AND metadata ->> 'type' = 'wallet_topup'
       RETURNING id, amount, metadata`,
      [merchantTransactionId, dbStatus]
    );

    console.log('💾 Payment update result:', {
      rowsAffected: paymentUpdate.rows.length
    });

    if (paymentUpdate.rows.length > 0 && dbStatus === 'completed') {
      const payment = paymentUpdate.rows[0];
      const metadata = payment.metadata || {};
      const userId = parseInt(metadata.userId);
      const amount = parseFloat(payment.amount);

      console.log(`🔄 Crediting wallet for user ${userId} with amount ${amount}`);

      // Credit the wallet
      try {
        await creditWallet(userId, amount, payment.id, 'Wallet Top-up');
        console.log('✅ Wallet credited successfully');
      } catch (creditError) {
        console.error('❌ Failed to credit wallet:', creditError);
        // Don't fail the callback, but log the error
      }
    }

    console.log(`✅ Wallet top-up callback processing completed for ${merchantTransactionId}`);

    // Redirect to payment success page
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?transactionId=${merchantTransactionId}&status=${dbStatus}&type=wallet_topup`;
    console.log('🔄 Redirecting to:', redirectUrl);

    return res.redirect(302, redirectUrl);

  } catch (error) {
    console.error('❌ Wallet top-up callback error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

module.exports = exports;