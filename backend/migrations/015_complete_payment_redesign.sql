-- Complete Payment System Redesign Migration
-- Migration: 015_complete_payment_redesign.sql

-- ==========================================
-- PHASE 1: BACKUP EXISTING DATA
-- ==========================================

-- Create backup of existing payments table
CREATE TABLE payments_backup AS
SELECT * FROM payments;

-- Create backup of existing payment-related data
CREATE TABLE payment_related_backup AS
SELECT
    p.*,
    s.mentor_id,
    s.mentee_id,
    s.title as session_title,
    s.scheduled_at,
    u.first_name as mentee_first_name,
    u.last_name as mentee_last_name
FROM payments p
LEFT JOIN sessions s ON p.session_id = s.id
LEFT JOIN users u ON s.mentee_id = u.id;

-- ==========================================
-- PHASE 2: DROP EXISTING TABLES AND CONSTRAINTS
-- ==========================================

-- Drop existing payments table
DROP TABLE IF EXISTS payments CASCADE;

-- ==========================================
-- PHASE 3: CREATE NEW ENHANCED PAYMENT SCHEMA
-- ==========================================

-- Enhanced Payments Table
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,

    -- Core Payment Information
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'INR',
    amount_in_paisa INTEGER, -- PhonePe specific

    -- Fee Structure
    platform_fee DECIMAL(10,2) DEFAULT 0 CHECK (platform_fee >= 0),
    processing_fee DECIMAL(10,2) DEFAULT 0 CHECK (processing_fee >= 0),
    mentor_earnings DECIMAL(10,2) NOT NULL CHECK (mentor_earnings >= 0),

    -- Enhanced Status Management
    payment_status VARCHAR(30) DEFAULT 'initiated' CHECK (payment_status IN (
        'initiated', 'pending_redirect', 'processing', 'completed',
        'failed', 'cancelled', 'refunded', 'partially_refunded',
        'disputed', 'chargeback', 'expired'
    )),

    -- Payment Gateway Information
    payment_gateway VARCHAR(50) DEFAULT 'phonepe',
    payment_method VARCHAR(50) CHECK (payment_method IN (
        'credit_card', 'debit_card', 'upi', 'net_banking',
        'wallet', 'pay_later', 'bank_transfer'
    )),

    -- PhonePe Specific Fields
    phonepe_transaction_id VARCHAR(100), -- PhonePe's transaction ID
    merchant_transaction_id VARCHAR(100), -- Our transaction ID
    phonepe_order_id VARCHAR(100), -- PhonePe order reference
    payment_instrument_type VARCHAR(50), -- UPI, CARD, etc.
    payment_mode VARCHAR(50), -- UPI_INTENT, UPI_COLLECT, etc.

    -- Legacy Support (Stripe)
    stripe_payment_intent_id VARCHAR(100),
    stripe_charge_id VARCHAR(100),

    -- Status Tracking
    gateway_response JSONB, -- Store full gateway response
    failure_code VARCHAR(50), -- Gateway error codes
    failure_reason TEXT,

    -- Refund Information
    refund_amount DECIMAL(10,2) DEFAULT 0 CHECK (refund_amount >= 0),
    refund_reason TEXT,
    refunded_at TIMESTAMP,

    -- Payout to Mentor
    payout_status VARCHAR(20) DEFAULT 'pending' CHECK (payout_status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    payout_id VARCHAR(100),
    payout_date TIMESTAMP,

    -- Audit Trail
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    expired_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment Events Table for Complete Audit Trail
CREATE TABLE payment_events (
    id SERIAL PRIMARY KEY,
    payment_id INTEGER REFERENCES payments(id) ON DELETE CASCADE NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    gateway_response JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- PHASE 4: CREATE INDEXES FOR PERFORMANCE
-- ==========================================

-- Payment table indexes
CREATE INDEX idx_payments_session ON payments(session_id);
CREATE INDEX idx_payments_status ON payments(payment_status);
CREATE INDEX idx_payments_gateway ON payments(payment_gateway);
CREATE INDEX idx_payments_merchant_txn ON payments(merchant_transaction_id);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX idx_payments_uuid ON payments(uuid);

-- Payment events indexes
CREATE INDEX idx_payment_events_payment_id ON payment_events(payment_id);
CREATE INDEX idx_payment_events_type ON payment_events(event_type);
CREATE INDEX idx_payment_events_created_at ON payment_events(created_at);

-- ==========================================
-- PHASE 5: MIGRATE EXISTING DATA
-- ==========================================

-- Migrate existing payment data
INSERT INTO payments (
    id,
    uuid,
    session_id,
    amount,
    currency,
    platform_fee,
    mentor_earnings,
    payment_status,
    payment_gateway,
    merchant_transaction_id,
    stripe_payment_intent_id,
    stripe_charge_id,
    created_at,
    updated_at
)
SELECT
    p.id,
    COALESCE(p.uuid, uuid_generate_v4()),
    p.session_id,
    p.amount,
    COALESCE(p.currency, 'USD'),
    COALESCE(p.platform_fee, 0),
    p.mentor_earnings,
    CASE
        WHEN p.payment_status = 'completed' THEN 'completed'
        WHEN p.payment_status = 'failed' THEN 'failed'
        WHEN p.payment_status = 'pending' THEN 'processing'
        ELSE 'initiated'
    END as payment_status,
    COALESCE(p.payment_gateway, 'stripe'),
    p.transaction_id,
    p.stripe_payment_intent_id,
    p.stripe_charge_id,
    p.created_at,
    p.updated_at
FROM payments_backup p;

-- Create initial payment events for migrated data
INSERT INTO payment_events (payment_id, event_type, event_data, created_at)
SELECT
    p.id,
    CASE
        WHEN p.payment_status = 'completed' THEN 'completed'
        WHEN p.payment_status = 'failed' THEN 'failed'
        ELSE 'initiated'
    END,
    jsonb_build_object(
        'migrated', true,
        'original_status', p.payment_status,
        'amount', p.amount,
        'gateway', p.payment_gateway
    ),
    p.created_at
FROM payments p
WHERE p.id IN (SELECT id FROM payments_backup);

-- ==========================================
-- PHASE 6: UPDATE SEQUENCES
-- ==========================================

-- Update sequence for payments table
SELECT setval('payments_id_seq', COALESCE((SELECT MAX(id) FROM payments), 1));

-- Update sequence for payment_events table
SELECT setval('payment_events_id_seq', COALESCE((SELECT MAX(id) FROM payment_events), 1));

-- ==========================================
-- PHASE 7: ADD TRIGGERS
-- ==========================================

-- Auto-update updated_at column
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_payments_updated_at();

-- Update payment status timestamps
CREATE OR REPLACE FUNCTION update_payment_status_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.payment_status = 'completed' AND OLD.payment_status != 'completed' THEN
        NEW.completed_at = CURRENT_TIMESTAMP;
    END IF;

    IF NEW.payment_status = 'expired' AND OLD.payment_status != 'expired' THEN
        NEW.expired_at = CURRENT_TIMESTAMP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_payment_status_timestamps
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_status_timestamps();

-- ==========================================
-- PHASE 8: VALIDATION QUERIES
-- ==========================================

-- Verify data migration
DO $$
DECLARE
    original_count INTEGER;
    migrated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO original_count FROM payments_backup;
    SELECT COUNT(*) INTO migrated_count FROM payments;

    RAISE NOTICE 'Migration validation:';
    RAISE NOTICE 'Original payments: %', original_count;
    RAISE NOTICE 'Migrated payments: %', migrated_count;

    IF original_count != migrated_count THEN
        RAISE EXCEPTION 'Migration failed: count mismatch';
    END IF;
END $$;

-- ==========================================
-- PHASE 9: CLEANUP (Optional - run after verification)
-- ==========================================

-- Uncomment these lines after verifying migration is successful
-- DROP TABLE payments_backup;
-- DROP TABLE payment_related_backup;

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================