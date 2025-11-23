const axios = require('axios');
const crypto = require('crypto');

/**
 * PhonePe Payment Gateway Service
 * Production-ready integration for UAT Sandbox environment
 */
class PhonePeService {
  constructor() {
    this.config = {
      baseUrl: process.env.PHONEPE_BASE_URL || 'https://api-preprod.phonepe.com/apis/pg-sandbox',
      merchantId: process.env.PHONEPE_MERCHANT_ID || 'PGTESTPAYUAT86',
      saltKey: process.env.PHONEPE_SALT_KEY || '96434309-7796-489d-8924-ab56988a6076',
      saltIndex: parseInt(process.env.PHONEPE_SALT_INDEX) || 1
    };
  }

  /**
   * Generate X-VERIFY checksum for PhonePe API requests
   * @param {Object} payload - Request payload
   * @param {string} endpointPath - API endpoint path (e.g., /pg/v1/pay)
   * @returns {string} X-VERIFY header value
   */
  generateChecksum(payload, endpointPath) {
    const jsonString = JSON.stringify(payload);
    const base64Payload = Buffer.from(jsonString, 'utf8').toString('base64');
    const stringToHash = base64Payload + endpointPath + this.config.saltKey;
    const hash = crypto.createHash('sha256').update(stringToHash, 'utf8').digest('hex');
    return hash + '###' + this.config.saltIndex;
  }

  /**
   * Generate X-VERIFY checksum for GET requests (status check)
   * @param {string} endpointPath - API endpoint path
   * @returns {string} X-VERIFY header value
   */
  generateChecksumForGet(endpointPath) {
    const stringToHash = endpointPath + this.config.saltKey;
    const hash = crypto.createHash('sha256').update(stringToHash, 'utf8').digest('hex');
    return hash + '###' + this.config.saltIndex;
  }

  /**
   * Initiate payment with PhonePe
   * @param {number} amount - Amount in INR
   * @param {string} merchantTransactionId - Unique transaction ID
   * @param {string} callbackUrl - Server-to-server callback URL
   * @param {string} redirectUrl - Client-side redirect URL
   * @param {Object} userDetails - User details {userId, phone}
   * @returns {string} PhonePe redirect URL
   */
  async initiatePayment(amount, merchantTransactionId, callbackUrl, redirectUrl, userDetails) {
    console.log(`🔄 [PhonePeService] Initiating payment:`, {
      amount: amount,
      merchantTransactionId: merchantTransactionId,
      callbackUrl: callbackUrl,
      redirectUrl: redirectUrl,
      userDetails: {
        userId: userDetails.userId,
        phone: userDetails.phone ? '[PRESENT]' : '[MISSING]'
      }
    });

    const payload = {
      merchantId: this.config.merchantId,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: userDetails.userId.toString(),
      amount: Math.round(amount * 100), // Convert to paise
      redirectUrl: redirectUrl,
      redirectMode: 'POST',
      callbackUrl: callbackUrl,
      mobileNumber: userDetails.phone || '9999999999',
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    };

    console.log(`📋 [PhonePeService] Constructed payload:`, {
      merchantId: payload.merchantId,
      merchantTransactionId: payload.merchantTransactionId,
      merchantUserId: payload.merchantUserId,
      amount: payload.amount,
      redirectUrl: payload.redirectUrl,
      redirectMode: payload.redirectMode,
      callbackUrl: payload.callbackUrl,
      mobileNumber: payload.mobileNumber,
      paymentInstrument: payload.paymentInstrument
    });

    const endpointPath = '/pg/v1/pay';
    const xVerify = this.generateChecksum(payload, endpointPath);
    const base64Payload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

    console.log(`🔐 [PhonePeService] Checksum generated:`, {
      endpointPath: endpointPath,
      xVerify: xVerify,
      base64PayloadLength: base64Payload.length
    });

    const requestUrl = `${this.config.baseUrl}${endpointPath}`;
    console.log(`🌐 [PhonePeService] Making API request to:`, requestUrl);

    try {
      const response = await axios.post(
        requestUrl,
        { request: base64Payload },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-VERIFY': xVerify
          },
          timeout: 30000 // 30 second timeout
        }
      );

      console.log(`📥 [PhonePeService] API response received:`, {
        status: response.status,
        success: response.data.success,
        code: response.data.code,
        message: response.data.message,
        hasRedirectUrl: !!(response.data.data?.instrumentResponse?.redirectInfo?.url)
      });

      if (response.data.success && response.data.data?.instrumentResponse?.redirectInfo?.url) {
        const redirectUrl = response.data.data.instrumentResponse.redirectInfo.url;
        console.log(`✅ [PhonePeService] Payment initiated successfully, redirect URL:`, redirectUrl);
        return redirectUrl;
      } else {
        console.error(`❌ [PhonePeService] Payment initiation failed:`, response.data);
        throw new Error(response.data.message || 'Payment initiation failed');
      }
    } catch (error) {
      console.error(`❌ [PhonePeService] Payment initiation error:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw new Error('Failed to initiate payment with PhonePe');
    }
  }

  /**
   * Handle PhonePe callback/webhook
   * @param {string} base64Body - Base64 encoded request body
   * @param {string} xVerifyHeader - X-VERIFY header from request
   * @returns {Object} Decoded payload
   */
  handleCallback(base64Body, xVerifyHeader) {
    // Verify checksum
    const calculatedChecksum = crypto.createHash('sha256')
      .update(base64Body + this.config.saltKey, 'utf8')
      .digest('hex') + '###' + this.config.saltIndex;

    if (calculatedChecksum !== xVerifyHeader) {
      throw new Error('Invalid checksum - callback verification failed');
    }

    // Decode payload
    const decodedPayload = Buffer.from(base64Body, 'base64').toString('utf8');
    const payload = JSON.parse(decodedPayload);

    return payload;
  }

  /**
   * Check payment status with retry logic for rate limits
   * @param {string} merchantTransactionId - Transaction ID
   * @returns {Object} Status response
   */
  async checkStatus(merchantTransactionId) {
    const endpointPath = `/pg/v1/status/${this.config.merchantId}/${merchantTransactionId}`;
    const xVerify = this.generateChecksumForGet(endpointPath);

    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      try {
        const response = await axios.get(
          `${this.config.baseUrl}${endpointPath}`,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-VERIFY': xVerify
            },
            timeout: 10000
          }
        );

        return response.data;
      } catch (error) {
        if (error.response?.status === 429 && attempt < maxAttempts - 1) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          attempt++;
        } else {
          console.error('PhonePe status check error:', error.response?.data || error.message);
          throw error;
        }
      }
    }
  }
}

module.exports = PhonePeService;