const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const auth = require('../middleware/auth');
const { rateLimit } = require('../middleware/auth');
const stripeUtil = require('../utils/stripe');

const router = express.Router();

// POST /api/payments/verify - Verify a Stripe PaymentIntent and update DB state
router.post(
  '/verify',
  auth,
  rateLimit(20, 15 * 60 * 1000), // 20 verifications per 15 minutes
  [
    body('payment_intent_id')
      .isString()
      .isLength({ min: 10 })
      .withMessage('Valid payment_intent_id is required'),
    body('session_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('session_id must be a positive integer'),
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

      const { payment_intent_id, session_id } = req.body;

      // 1) Confirm/retrieve PaymentIntent from Stripe
      const pi = await stripeUtil.confirmPayment(payment_intent_id, false);

      // 2) Normalize Stripe status to our payment_status
      // Stripe statuses reference:
      // - 'succeeded' => completed
      // - 'processing' => processing
      // - 'requires_payment_method' => failed
      // - 'requires_confirmation'/'requires_action' => pending
      let paymentStatus = 'pending';
      switch (pi.status) {
        case 'succeeded':
          paymentStatus = 'completed';
          break;
        case 'processing':
          paymentStatus = 'processing';
          break;
        case 'requires_payment_method':
          paymentStatus = 'failed';
          break;
        case 'requires_confirmation':
        case 'requires_action':
        default:
          paymentStatus = 'pending';
          break;
      }

      // 3) Update database atomically
      const result = await db.transaction(async (client) => {
        // Try to find payment row by Stripe PaymentIntent ID
        const payRes = await client.query(
          `
            SELECT id, session_id, payment_status
            FROM payments
            WHERE stripe_payment_intent_id = $1
            LIMIT 1
          `,
          [payment_intent_id]
        );

        // Determine session id to update
        let resolvedSessionId = session_id;
        if (!resolvedSessionId && payRes.rows.length > 0) {
          resolvedSessionId = payRes.rows[0].session_id;
        }

        // Update payments row if exists
        if (payRes.rows.length > 0) {
          const chargeId = Array.isArray(pi.charges) && pi.charges.length > 0 ? pi.charges[0].id : null;

          await client.query(
            `
              UPDATE payments
              SET payment_status = $2,
                  stripe_charge_id = COALESCE($3, stripe_charge_id),
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = $1
            `,
            [payRes.rows[0].id, paymentStatus, chargeId]
          );
        }

        // Optionally update session status to confirmed on successful payment
        let updatedSession = null;
        if (paymentStatus === 'completed' && resolvedSessionId) {
          const sessionUpdateRes = await client.query(
            `
              UPDATE sessions
              SET status = CASE 
                             WHEN status IN ('pending', 'scheduled') THEN 'confirmed'
                             ELSE status
                           END,
                  confirmed_at = CASE 
                                   WHEN status IN ('pending', 'scheduled') THEN CURRENT_TIMESTAMP
                                   ELSE confirmed_at
                                 END,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = $1
              RETURNING id, title, status, scheduled_at, meeting_url, session_type, duration_minutes, timezone
            `,
            [resolvedSessionId]
          );
          updatedSession = sessionUpdateRes.rows[0] || null;
        }

        return {
          paymentStatus,
          session: updatedSession,
        };
      });

      // 4) Respond
      return res.json({
        success: true,
        message: 'Payment verification completed',
        data: {
          payment_status: result.paymentStatus,
          session: result.session,
        },
      });
    } catch (error) {
      console.error('❌ Payment verification error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify payment',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      });
    }
  }
);

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