-- Industry-Standard Payment Flow Migration
-- Migration: 016_pending_bookings_payment_flow.sql

-- ==========================================
-- PHASE 1: CREATE PENDING BOOKINGS TABLE
-- ==========================================

-- PendingBookings table for pre-payment stage
CREATE TABLE pending_bookings (
    booking_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mentor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mentee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Slot information
    slot_start TIMESTAMP NOT NULL,
    slot_end TIMESTAMP NOT NULL,

    -- Payment preparation
    merchant_transaction_id VARCHAR(100) UNIQUE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'INR',

    -- Status tracking
    status VARCHAR(20) DEFAULT 'initiated' CHECK (status IN (
        'initiated', 'payment_pending', 'paid', 'failed', 'expired', 'cancelled'
    )),

    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 minutes')
);

-- ==========================================
-- PHASE 2: ENHANCE PAYMENTS TABLE
-- ==========================================

-- Add session_id to payments table (for post-payment session creation)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES sessions(id);

-- Add merchant_transaction_id to payments table for PhonePe compatibility
ALTER TABLE payments ADD COLUMN IF NOT EXISTS merchant_transaction_id VARCHAR(100);

-- Add verification tracking
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verification_method VARCHAR(50);

-- Add idempotency key to prevent duplicate processing
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100) UNIQUE;

-- ==========================================
-- PHASE 3: CREATE PAYMENT LOGS TABLE
-- ==========================================

-- PaymentLogs table for complete audit trail
CREATE TABLE payment_logs (
    id SERIAL PRIMARY KEY,
    transaction_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    gateway_response JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- PHASE 4: ADD INDEXES FOR PERFORMANCE
-- ==========================================

-- Pending bookings indexes
CREATE INDEX idx_pending_bookings_mentor_id ON pending_bookings(mentor_id);
CREATE INDEX idx_pending_bookings_mentee_id ON pending_bookings(mentee_id);
CREATE INDEX idx_pending_bookings_status ON pending_bookings(status);
CREATE INDEX idx_pending_bookings_expires_at ON pending_bookings(expires_at);
CREATE INDEX idx_pending_bookings_transaction_id ON pending_bookings(merchant_transaction_id);

-- Payment logs indexes
CREATE INDEX idx_payment_logs_transaction_id ON payment_logs(transaction_id);
CREATE INDEX idx_payment_logs_event_type ON payment_logs(event_type);
CREATE INDEX idx_payment_logs_created_at ON payment_logs(created_at);

-- ==========================================
-- PHASE 5: ADD TRIGGERS
-- ==========================================

-- Auto-update updated_at for pending_bookings
CREATE OR REPLACE FUNCTION update_pending_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_pending_bookings_updated_at
    BEFORE UPDATE ON pending_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_pending_bookings_updated_at();

-- Auto-expire pending bookings
CREATE OR REPLACE FUNCTION expire_pending_bookings()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark as expired if not paid within time limit
    UPDATE pending_bookings
    SET status = 'expired', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'initiated'
    AND expires_at < CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a function to be called periodically (can be called via cron or scheduled task)
CREATE OR REPLACE FUNCTION cleanup_expired_bookings()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE pending_bookings
    SET status = 'expired', updated_at = CURRENT_TIMESTAMP
    WHERE status IN ('initiated', 'payment_pending')
    AND expires_at < CURRENT_TIMESTAMP;

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- PHASE 6: MIGRATION VALIDATION
-- ==========================================

-- Verify table creation
DO $$
DECLARE
    pending_bookings_exists BOOLEAN;
    payment_logs_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'pending_bookings'
    ) INTO pending_bookings_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'payment_logs'
    ) INTO payment_logs_exists;

    RAISE NOTICE 'Migration validation:';
    RAISE NOTICE 'pending_bookings table created: %', pending_bookings_exists;
    RAISE NOTICE 'payment_logs table created: %', payment_logs_exists;

    IF NOT (pending_bookings_exists AND payment_logs_exists) THEN
        RAISE EXCEPTION 'Migration failed: Required tables not created';
    END IF;
END $$;

-- ==========================================
-- PHASE 7: SAMPLE DATA FOR TESTING
-- ==========================================

-- Insert sample pending booking (for testing)
-- Uncomment for testing:
-- INSERT INTO pending_bookings (
--     mentor_id, mentee_id, slot_start, slot_end, amount, status
-- ) VALUES (
--     1, 49, '2025-10-23 14:00:00', '2025-10-23 15:00:00', 25.00, 'initiated'
-- );

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================