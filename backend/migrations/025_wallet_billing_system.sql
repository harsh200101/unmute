-- Migration: 025_wallet_billing_system.sql
-- Implement wallet-based billing system with per-minute pricing
-- Migration Date: 2025-11-15

-- ==========================================
-- PHASE 1: BACKUP EXISTING DATA
-- ==========================================

-- Create backup of sessions table
CREATE TABLE sessions_backup AS
SELECT * FROM sessions;

-- Create backup of payments table
CREATE TABLE payments_backup AS
SELECT * FROM payments;

-- Create backup of users table for wallet initialization
CREATE TABLE users_backup AS
SELECT * FROM users;

-- ==========================================
-- PHASE 2: CREATE NEW TABLES
-- ==========================================

-- Wallets table for user balances
CREATE TABLE wallets (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,

    -- Balance information
    balance DECIMAL(12,2) DEFAULT 0 CHECK (balance >= 0),
    currency VARCHAR(3) DEFAULT 'INR',

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Audit trail
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wallet transactions table for audit trail
CREATE TABLE wallet_transactions (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    wallet_id INTEGER REFERENCES wallets(id) ON DELETE CASCADE NOT NULL,

    -- Transaction details
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('credit', 'debit')),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    description TEXT,
    reference_type VARCHAR(50), -- 'session', 'payment', 'topup', etc.
    reference_id INTEGER,

    -- Balance after transaction
    balance_after DECIMAL(12,2) NOT NULL,

    -- Metadata
    gateway_response JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mentor earnings table for tracking earnings separately
CREATE TABLE mentor_earnings (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    mentor_id INTEGER REFERENCES mentors(id) ON DELETE CASCADE NOT NULL,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,

    -- Earnings details
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) DEFAULT 'INR',

    -- Processing status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    processed_at TIMESTAMP,

    -- Audit trail
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- PHASE 3: MODIFY EXISTING TABLES
-- ==========================================

-- Modify sessions table
ALTER TABLE sessions
ADD COLUMN per_minute_rate DECIMAL(10,2) DEFAULT 0 CHECK (per_minute_rate >= 0),
ADD COLUMN minimum_debit DECIMAL(10,2) DEFAULT 0 CHECK (minimum_debit >= 0),
ADD COLUMN actual_billed_amount DECIMAL(10,2) DEFAULT 0 CHECK (actual_billed_amount >= 0),
ADD COLUMN kill_switch_timer_id VARCHAR(100);

-- Drop old pricing columns from sessions
ALTER TABLE sessions
DROP COLUMN IF EXISTS price,
DROP COLUMN IF EXISTS platform_fee,
DROP COLUMN IF EXISTS mentor_earnings CASCADE;

-- Modify payments table
ALTER TABLE payments
ADD COLUMN wallet_credit_amount DECIMAL(10,2) DEFAULT 0 CHECK (wallet_credit_amount >= 0),
ADD COLUMN is_wallet_topup BOOLEAN DEFAULT false;

-- ==========================================
-- PHASE 4: CREATE INDEXES
-- ==========================================

-- Wallets indexes
CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallets_active ON wallets(is_active) WHERE is_active = true;
CREATE INDEX idx_wallets_uuid ON wallets(uuid);

-- Wallet transactions indexes
CREATE INDEX idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_type ON wallet_transactions(transaction_type);
CREATE INDEX idx_wallet_transactions_reference ON wallet_transactions(reference_type, reference_id);
CREATE INDEX idx_wallet_transactions_created_at ON wallet_transactions(created_at DESC);
CREATE INDEX idx_wallet_transactions_uuid ON wallet_transactions(uuid);

-- Mentor earnings indexes
CREATE INDEX idx_mentor_earnings_mentor ON mentor_earnings(mentor_id);
CREATE INDEX idx_mentor_earnings_session ON mentor_earnings(session_id);
CREATE INDEX idx_mentor_earnings_status ON mentor_earnings(status);
CREATE INDEX idx_mentor_earnings_created_at ON mentor_earnings(created_at DESC);
CREATE INDEX idx_mentor_earnings_uuid ON mentor_earnings(uuid);

-- ==========================================
-- PHASE 5: DATA MIGRATION
-- ==========================================

-- Initialize wallets for all existing users
INSERT INTO wallets (user_id, balance, currency, is_active)
SELECT
    id as user_id,
    0 as balance,
    'INR' as currency,
    true as is_active
FROM users
WHERE id NOT IN (SELECT user_id FROM wallets);

-- Migrate existing session earnings to mentor_earnings table
INSERT INTO mentor_earnings (mentor_id, session_id, amount, currency, status, created_at)
SELECT
    s.mentor_id,
    s.id as session_id,
    COALESCE(s.mentor_earnings, 0) as amount,
    'INR' as currency,
    CASE
        WHEN s.status = 'completed' THEN 'completed'
        ELSE 'pending'
    END as status,
    s.created_at
FROM sessions_backup s
WHERE s.mentor_earnings > 0;

-- Set default per_minute_rate for existing sessions based on mentor's hourly rate
UPDATE sessions
SET per_minute_rate = ROUND((m.hourly_rate / 60), 2),
    minimum_debit = ROUND((m.hourly_rate / 60) * 5, 2) -- 5 minute minimum
FROM mentors m
WHERE sessions.mentor_id = m.id
  AND sessions.per_minute_rate = 0;

-- ==========================================
-- PHASE 6: CREATE TRIGGERS
-- ==========================================

-- Auto-update updated_at for wallets
CREATE OR REPLACE FUNCTION update_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_wallets_updated_at();

-- Auto-update updated_at for mentor_earnings
CREATE OR REPLACE FUNCTION update_mentor_earnings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mentor_earnings_updated_at
    BEFORE UPDATE ON mentor_earnings
    FOR EACH ROW
    EXECUTE FUNCTION update_mentor_earnings_updated_at();

-- Function to update wallet balance on transaction
CREATE OR REPLACE FUNCTION update_wallet_balance()
RETURNS TRIGGER AS $$
DECLARE
    balance_change DECIMAL(12,2);
BEGIN
    -- Calculate balance change
    IF NEW.transaction_type = 'credit' THEN
        balance_change := NEW.amount;
    ELSE
        balance_change := -NEW.amount;
    END IF;

    -- Update wallet balance
    UPDATE wallets
    SET balance = balance + balance_change,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.wallet_id;

    -- Set balance_after in transaction
    NEW.balance_after := (SELECT balance FROM wallets WHERE id = NEW.wallet_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_wallet_balance
    BEFORE INSERT ON wallet_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_wallet_balance();

-- ==========================================
-- PHASE 7: VALIDATION QUERIES
-- ==========================================

-- Validate wallet creation
DO $$
DECLARE
    user_count INTEGER;
    wallet_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO wallet_count FROM wallets;

    RAISE NOTICE 'Users: %, Wallets: %', user_count, wallet_count;

    IF user_count != wallet_count THEN
        RAISE EXCEPTION 'Wallet creation failed: user count (%) != wallet count (%)', user_count, wallet_count;
    END IF;
END $$;

-- Validate mentor earnings migration
DO $$
DECLARE
    original_earnings DECIMAL(12,2);
    migrated_earnings DECIMAL(12,2);
BEGIN
    SELECT COALESCE(SUM(mentor_earnings), 0) INTO original_earnings
    FROM sessions_backup
    WHERE mentor_earnings > 0;

    SELECT COALESCE(SUM(amount), 0) INTO migrated_earnings
    FROM mentor_earnings;

    RAISE NOTICE 'Original earnings: %, Migrated earnings: %', original_earnings, migrated_earnings;

    IF ABS(original_earnings - migrated_earnings) > 0.01 THEN
        RAISE EXCEPTION 'Earnings migration failed: original (%) != migrated (%)', original_earnings, migrated_earnings;
    END IF;
END $$;

-- Check for data integrity
DO $$
DECLARE
    invalid_sessions INTEGER;
BEGIN
    SELECT COUNT(*) INTO invalid_sessions
    FROM sessions
    WHERE per_minute_rate < 0 OR minimum_debit < 0 OR actual_billed_amount < 0;

    IF invalid_sessions > 0 THEN
        RAISE EXCEPTION 'Found % sessions with invalid billing data', invalid_sessions;
    END IF;

    RAISE NOTICE 'All sessions have valid billing data';
END $$;

-- ==========================================
-- PHASE 8: CLEANUP (Optional - run after verification)
-- ==========================================

-- Uncomment these lines after verifying migration is successful
-- DROP TABLE sessions_backup;
-- DROP TABLE payments_backup;
-- DROP TABLE users_backup;

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================