const Stripe = require('stripe');
const db = require('../config/database');
const { sendPaymentSuccessEmail } = require('./emailService');
const { getClientUrl } = require('./frontendUrl');

class StripePayments {
  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16', // Latest stable API version
      maxNetworkRetries: 3, // Retry failed requests
      timeout: 15000, // 15 second timeout
      telemetry: false // Disable telemetry for privacy
    });

    // Platform configuration
    this.config = {
      defaultCurrency: process.env.DEFAULT_CURRENCY || 'INR',
      platformFeeRate: parseFloat(process.env.PLATFORM_FEE_RATE) || 0.10, // 10%
      processingFeeFixed: parseFloat(process.env.PROCESSING_FEE_FIXED) || 25, // ₹25 (converted from $0.30)
      processingFeeRate: parseFloat(process.env.PROCESSING_FEE_RATE) || 0.029, // 2.9%
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
    };

    console.log('✅ Stripe initialized successfully');
  }

  // ==========================================
  // PAYMENT INTENTS - Core payment processing
  // ==========================================

  /**
   * Create a payment intent for session booking
   * @param {Object} params - Payment parameters
   * @param {number} params.amount - Amount in cents
   * @param {string} params.currency - Currency code
   * @param {Object} params.metadata - Payment metadata
   * @param {string} params.description - Payment description
   * @param {string} params.receipt_email - Customer email for receipt
   * @param {string} params.customer_id - Stripe customer ID (optional)
   * @returns {Promise<Object>} Stripe PaymentIntent object
   */
  async createPaymentIntent({
    amount,
    currency = this.config.defaultCurrency,
    metadata = {},
    description = '',
    receipt_email = '',
    customer_id = null,
    payment_method_types = ['card'],
    capture_method = 'automatic',
    confirmation_method = 'automatic'
  }) {
    try {
      // Validate amount
      if (!amount || amount < 4150) { // Minimum ₹50 (converted from $0.50 USD)
        throw new Error('Amount must be at least ₹50 INR');
      }

      // Enhanced metadata with platform info
      const enhancedMetadata = {
        platform: 'unmute',
        created_at: new Date().toISOString(),
        version: '1.0',
        ...metadata
      };

      console.log('🔄 Creating Stripe PaymentIntent:', {
        amount,
        currency,
        description,
        metadata: enhancedMetadata
      });

      const paymentIntentParams = {
        amount: Math.round(amount), // Ensure integer
        currency: currency.toLowerCase(),
        metadata: enhancedMetadata,
        description,
        payment_method_types,
        capture_method,
        confirmation_method,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never' // Keep users on your site
        }
      };

      // Add customer if provided
      if (customer_id) {
        paymentIntentParams.customer = customer_id;
      }

      // Add receipt email if provided
      if (receipt_email) {
        paymentIntentParams.receipt_email = receipt_email;
      }

      const paymentIntent = await this.stripe.paymentIntents.create(paymentIntentParams);

      console.log('✅ PaymentIntent created:', paymentIntent.id);

      return {
        id: paymentIntent.id,
        client_secret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        metadata: paymentIntent.metadata,
        created: paymentIntent.created
      };

    } catch (error) {
      console.error('❌ Stripe createPaymentIntent error:', {
        message: error.message,
        type: error.type,
        code: error.code,
        amount,
        currency
      });
      throw new Error(`Payment intent creation failed: ${error.message}`);
    }
  }

  /**
   * Retrieve and optionally confirm a payment intent
   * @param {string} paymentIntentId - Payment intent ID
   * @param {boolean} autoConfirm - Whether to auto-confirm if needed
   * @returns {Promise<Object>} Payment intent status
   */
  async confirmPayment(paymentIntentId, autoConfirm = false) {
    try {
      console.log('🔍 Retrieving PaymentIntent:', paymentIntentId);

      // Handle mock PaymentIntent IDs for development
      if (paymentIntentId.startsWith('pi_mock_')) {
        console.log('🔍 Mock PaymentIntent detected, returning simulated response');
        return {
          id: paymentIntentId,
          status: 'succeeded',
          amount: 200000, // ₹2000 in paisa (converted from $240)
          currency: 'inr',
          charges: [{
            id: `ch_mock_${Date.now()}`,
            amount: 200000,
            status: 'succeeded',
            created: Math.floor(Date.now() / 1000),
            payment_method_details: {
              card: {
                brand: 'visa',
                last4: '4242'
              },
              type: 'card'
            }
          }],
          metadata: {
            session_id: 'mock_session_id',
            platform: 'unmute'
          }
        };
      }

      let paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

      // Auto-confirm if requested and needed
      if (autoConfirm && paymentIntent.status === 'requires_confirmation') {
        console.log('🔄 Confirming PaymentIntent:', paymentIntentId);
        paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId);
      }

      console.log('✅ PaymentIntent status:', paymentIntent.status);

      return {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        charges: paymentIntent.charges.data.map(charge => ({
          id: charge.id,
          amount: charge.amount,
          status: charge.status,
          created: charge.created,
          payment_method_details: charge.payment_method_details
        })),
        metadata: paymentIntent.metadata
      };

    } catch (error) {
      console.error('❌ Stripe confirmPayment error:', {
        message: error.message,
        paymentIntentId
      });
      throw new Error(`Payment confirmation failed: ${error.message}`);
    }
  }

  // ==========================================
  // REFUNDS - Handle cancellations and disputes
  // ==========================================

  /**
   * Create a full or partial refund
   * @param {string} paymentIntentId - Payment intent ID to refund
   * @param {number|null} amount - Refund amount in cents (null for full refund)
   * @param {string} reason - Refund reason
   * @param {Object} metadata - Additional refund metadata
   * @returns {Promise<Object>} Refund object
   */
  async createRefund(paymentIntentId, amount = null, reason = 'requested_by_customer', metadata = {}) {
    try {
      console.log('🔄 Creating refund:', { paymentIntentId, amount, reason });

      const refundParams = {
        payment_intent: paymentIntentId,
        reason,
        metadata: {
          platform: 'unmute',
          created_at: new Date().toISOString(),
          ...metadata
        }
      };

      // Add specific amount for partial refunds
      if (amount !== null) {
        refundParams.amount = Math.round(amount);
      }

      const refund = await this.stripe.refunds.create(refundParams);

      console.log('✅ Refund created:', refund.id);

      return {
        id: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        reason: refund.reason,
        created: refund.created,
        metadata: refund.metadata
      };

    } catch (error) {
      console.error('❌ Stripe createRefund error:', {
        message: error.message,
        paymentIntentId,
        amount
      });
      throw new Error(`Refund creation failed: ${error.message}`);
    }
  }

  // ==========================================
  // CUSTOMERS - Manage customer profiles
  // ==========================================

  /**
   * Create or retrieve a Stripe customer
   * @param {Object} customerData - Customer information
   * @returns {Promise<Object>} Stripe customer object
   */
  async createOrRetrieveCustomer({ email, name, phone = null, userId = null }) {
    try {
      // First, try to find existing customer by email
      const existingCustomers = await this.stripe.customers.list({
        email: email,
        limit: 1
      });

      if (existingCustomers.data.length > 0) {
        console.log('✅ Found existing Stripe customer:', existingCustomers.data[0].id);
        return existingCustomers.data[0];
      }

      // Create new customer
      console.log('🔄 Creating new Stripe customer:', email);

      const customerParams = {
        email,
        name,
        metadata: {
          platform: 'unmute',
          user_id: userId ? userId.toString() : null,
          created_at: new Date().toISOString()
        }
      };

      if (phone) {
        customerParams.phone = phone;
      }

      const customer = await this.stripe.customers.create(customerParams);

      console.log('✅ Stripe customer created:', customer.id);

      return customer;

    } catch (error) {
      console.error('❌ Stripe customer creation error:', {
        message: error.message,
        email,
        name
      });
      throw new Error(`Customer creation failed: ${error.message}`);
    }
  }

  // ==========================================
  // PAYOUTS - Handle mentor payments
  // ==========================================

  /**
   * Calculate platform and processing fees
   * @param {number} amount - Gross amount in cents
   * @returns {Object} Fee breakdown
   */
  calculateFees(amount) {
    const processingFee = Math.round(
      this.config.processingFeeFixed * 100 + // Convert to cents
      amount * this.config.processingFeeRate
    );
    const platformFee = Math.round(amount * this.config.platformFeeRate);
    const mentorEarnings = amount - platformFee - processingFee;

    return {
      grossAmount: amount,
      platformFee,
      processingFee,
      mentorEarnings: Math.max(0, mentorEarnings), // Ensure non-negative
      breakdown: {
        platformFeeRate: this.config.platformFeeRate,
        processingFeeRate: this.config.processingFeeRate,
        processingFeeFixed: this.config.processingFeeFixed
      }
    };
  }

  /**
   * Create a payout to mentor (requires Stripe Connect)
   * @param {Object} payoutData - Payout information
   * @returns {Promise<Object>} Payout result
   */
  async createPayout({ amount, currency, mentor_stripe_account, metadata = {} }) {
    try {
      // Note: This requires Stripe Connect setup for mentors
      console.log('🔄 Creating payout to mentor:', { amount, mentor_stripe_account });

      // This would be implemented when you set up Stripe Connect
      // For now, we'll return a simulated response
      const payout = {
        id: `po_${Date.now()}`,
        amount,
        currency,
        status: 'pending',
        arrival_date: Math.floor(Date.now() / 1000) + (2 * 24 * 60 * 60), // 2 days
        metadata: {
          platform: 'unmute',
          ...metadata
        }
      };

      console.log('✅ Payout created (simulated):', payout.id);
      return payout;

    } catch (error) {
      console.error('❌ Payout creation error:', error);
      throw new Error(`Payout creation failed: ${error.message}`);
    }
  }

  // ==========================================
  // WEBHOOKS - Handle Stripe events
  // ==========================================

  /**
   * Verify and parse Stripe webhook
   * @param {string} payload - Raw request body
   * @param {string} signature - Stripe signature header
   * @returns {Promise<Object>} Verified event object
   */
  async verifyWebhook(payload, signature) {
    try {
      if (!this.config.webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.config.webhookSecret
      );

      console.log('✅ Webhook verified:', event.type);
      return event;

    } catch (error) {
      console.error('❌ Webhook verification failed:', error.message);
      throw new Error(`Webhook verification failed: ${error.message}`);
    }
  }

  /**
   * Handle webhook events and update database
   * @param {Object} event - Verified Stripe event
   * @returns {Promise<boolean>} Processing success
   */
  async handleWebhookEvent(event) {
    try {
      console.log('🔄 Processing webhook event:', event.type);

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(event.data.object);
          break;

        case 'charge.dispute.created':
          await this.handleDispute(event.data.object);
          break;

        case 'refund.created':
          await this.handleRefund(event.data.object);
          break;

        default:
          console.log('ℹ️ Unhandled webhook event type:', event.type);
      }

      return true;

    } catch (error) {
      console.error('❌ Webhook event processing failed:', {
        eventType: event.type,
        eventId: event.id,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Handle successful payment
   * @param {Object} paymentIntent - Stripe payment intent object
   */
  async handlePaymentSuccess(paymentIntent) {
    try {
      const sessionId = paymentIntent.metadata.session_id;

      if (!sessionId) {
        console.warn('⚠️ Payment success without session_id in metadata');
        return;
      }

      // Get session details for emails
      const sessionDetails = await db.query(
        `SELECT s.*, mentor_user.first_name as mentor_first_name, mentor_user.last_name as mentor_last_name,
               u.first_name as mentee_first_name, u.last_name as mentee_last_name, u.email as mentee_email,
               mt.user_id as mentor_user_id, mentor_user.email as mentor_email
         FROM sessions s
         JOIN mentors m ON s.mentor_id = m.id
         JOIN users u ON s.mentee_id = u.id
         JOIN mentors mt ON s.mentor_id = mt.id
         JOIN users mentor_user ON mt.user_id = mentor_user.id
         WHERE s.id = $1`,
        [sessionId]
      );

      const session = sessionDetails.rows[0];

      await db.transaction(async (client) => {
        // Update payment status
        await client.query(`
          UPDATE payments
          SET payment_status = 'completed',
              stripe_charge_id = $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE stripe_payment_intent_id = $1
        `, [paymentIntent.id, paymentIntent.charges.data[0]?.id]);

        // Update session status if payment was completed
        await client.query(`
          UPDATE sessions
          SET status = 'confirmed',
              confirmed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND status = 'pending'
        `, [sessionId]);

        // Create video meeting if it doesn't exist
        const existingMeeting = await client.query(
          `SELECT id FROM video_meetings WHERE session_id = $1`,
          [sessionId]
        );

        if (existingMeeting.rows.length === 0) {
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

          // Update session with meeting URL
          const meetingUrl = `${getClientUrl()}/meeting/${session.id}`;

          await client.query(
            `UPDATE sessions
             SET meeting_url = $2, meeting_id = $3, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [session.id, meetingUrl, meetingCredentials.channelName]
          );
        }

        console.log('✅ Payment success processed for session:', sessionId);
      });

      // Send payment success email to mentee
      try {
        const paymentEmailData = {
          transactionId: paymentIntent.id,
          amount: paymentIntent.amount / 100, // Convert from cents
          sessionTitle: session.title,
          mentorName: `${session.mentor_first_name} ${session.mentor_last_name}`,
          scheduledAt: session.scheduled_at
        };
        await sendPaymentSuccessEmail(session.mentee_email, paymentEmailData);
        console.log('✅ Payment success email sent to mentee');
      } catch (emailError) {
        console.warn('⚠️ Failed to send payment success email:', emailError.message);
      }

      // Meeting ready emails have been disabled
      // try {
      //   const meetingUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/meeting/${sessionId}`;
      //   const meetingEmailData = {
      //     title: session.title,
      //     scheduledAt: session.scheduled_at,
      //     durationMinutes: session.duration_minutes,
      //     mentorName: `${session.mentor_first_name} ${session.mentor_last_name}`,
      //     menteeName: `${session.mentee_first_name} ${session.mentee_last_name}`,
      //     meetingUrl: meetingUrl
      //   };

      //   await sendMeetingReadyEmail(session.mentee_email, meetingEmailData, 'mentee');
      //   await sendMeetingReadyEmail(session.mentor_email, meetingEmailData, 'mentor');
      //   console.log('✅ Meeting ready emails sent to both parties');
      // } catch (emailError) {
      //   console.warn('⚠️ Failed to send meeting ready emails:', emailError.message);
      // }

    } catch (error) {
      console.error('❌ Error processing payment success:', error);
      throw error;
    }
  }

  /**
   * Handle payment failure
   * @param {Object} paymentIntent - Stripe payment intent object
   */
  async handlePaymentFailure(paymentIntent) {
    try {
      const sessionId = paymentIntent.metadata.session_id;
      
      if (!sessionId) {
        console.warn('⚠️ Payment failure without session_id in metadata');
        return;
      }

      await db.transaction(async (client) => {
        // Update payment status
        await client.query(`
          UPDATE payments 
          SET payment_status = 'failed',
              failure_reason = $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE stripe_payment_intent_id = $1
        `, [paymentIntent.id, paymentIntent.last_payment_error?.message || 'Payment failed']);

        // Cancel the session
        await client.query(`
          UPDATE sessions 
          SET status = 'cancelled_by_mentee',
              cancelled_at = CURRENT_TIMESTAMP,
              admin_notes = 'Cancelled due to payment failure',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [sessionId]);

        console.log('✅ Payment failure processed for session:', sessionId);
      });

    } catch (error) {
      console.error('❌ Error processing payment failure:', error);
      throw error;
    }
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Format amount for Stripe (convert to paisa for INR)
   * @param {number} amount - Amount in rupees
   * @param {string} currency - Currency code
   * @returns {number} Amount in smallest currency unit
   */
  formatAmountForStripe(amount, currency = 'INR') {
    // Zero-decimal currencies (e.g., JPY, KRW)
    const zeroDecimalCurrencies = ['JPY', 'KRW', 'VND', 'CLP'];

    if (zeroDecimalCurrencies.includes(currency.toUpperCase())) {
      return Math.round(amount);
    }

    return Math.round(amount * 100); // Convert rupees to paisa
  }

  /**
   * Format amount from Stripe (convert from paisa to rupees)
   * @param {number} amount - Amount in smallest currency unit
   * @param {string} currency - Currency code
   * @returns {number} Amount in major currency unit
   */
  formatAmountFromStripe(amount, currency = 'INR') {
    const zeroDecimalCurrencies = ['JPY', 'KRW', 'VND', 'CLP'];

    if (zeroDecimalCurrencies.includes(currency.toUpperCase())) {
      return amount;
    }

    return amount / 100; // Convert paisa to rupees
  }

  /**
   * Get supported payment methods for country/currency
   * @param {string} country - Country code
   * @param {string} currency - Currency code
   * @returns {Array} Supported payment methods
   */
  getSupportedPaymentMethods(country = 'IN', currency = 'INR') {
    // This would typically be fetched from Stripe's API or a configuration
    const defaultMethods = ['card'];

    // Add region-specific payment methods
    const regionMethods = {
      'US': ['card', 'us_bank_account'],
      'GB': ['card', 'bacs_debit'],
      'DE': ['card', 'sepa_debit', 'sofort'],
      'IN': ['card', 'upi', 'net_banking'],
    };

    return regionMethods[country] || defaultMethods;
  }

  /**
   * Health check for Stripe integration
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      // Test Stripe connectivity by fetching account info
      const account = await this.stripe.accounts.retrieve();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        account: {
          id: account.id,
          country: account.country,
          default_currency: account.default_currency,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled
        },
        config: {
          apiVersion: this.stripe._getApiField('version'),
          defaultCurrency: this.config.defaultCurrency,
          platformFeeRate: this.config.platformFeeRate
        }
      };

    } catch (error) {
      console.error('❌ Stripe health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

// Export singleton instance
module.exports = new StripePayments();
