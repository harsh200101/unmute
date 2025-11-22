-- Migration: 035_restructure_payments_for_wallet.sql
-- Restructure payments, payment_events, and wallet_transactions tables to better connect with wallet system
-- Make mentor_earnings nullable for non-session payments like wallet top-ups
-- Add wallet_id to payments table for wallet-related payments
-- Migration Date: 2025-11-22

-- ==========================================
-- PHASE 1: BACKUP EXISTING DATA
-- ==========================================

-- Create backups
CREATE TABLE payments_backup_035 AS SELECT * FROM payments;
CREATE TABLE payment_events_backup_035 AS SELECT * FROM payment_events;
CREATE TABLE wallet_transactions_backup_035 AS SELECT * FROM wallet_transactions;

-- ==========================================
-- PHASE 2: MODIFY PAYMENTS TABLE
-- ==========================================

-- Make mentor_earnings nullable for wallet top-ups and other non-session payments
ALTER TABLE payments
ALTER COLUMN mentor_earnings DROP NOT NULL,
ALTER COLUMN mentor_earnings SET DEFAULT 0;

-- Add wallet_id to connect payments to wallets (nullable for non-wallet payments)
ALTER TABLE payments
ADD COLUMN wallet_id INTEGER REFERENCES wallets(id) ON DELETE SET NULL;

-- Create index for wallet queries
CREATE INDEX idx_payments_wallet_id ON payments(wallet_id);

-- ==========================================
-- PHASE 3: VALIDATION QUERIES
-- ==========================================

-- ==========================================
-- PHASE 6: VALIDATION QUERIES
-- ==========================================

-- Verify mentor_earnings is now nullable
DO $$
DECLARE
    nullable_check BOOLEAN;
BEGIN
    SELECT is_nullable INTO nullable_check
    FROM information_schema.columns
    WHERE table_name = 'payments'
      AND column_name = 'mentor_earnings';

    IF nullable_check THEN
        RAISE NOTICE 'mentor_earnings column is now nullable';
    ELSE
        RAISE EXCEPTION 'mentor_earnings column is still NOT NULL';
    END IF;
END $$;

-- Verify wallet_id column exists
DO $$
DECLARE
    column_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'payments'
          AND column_name = 'wallet_id'
    ) INTO column_exists;

    IF column_exists THEN
        RAISE NOTICE 'wallet_id column added to payments table';
    ELSE
        RAISE EXCEPTION 'wallet_id column was not added to payments table';
    END IF;
END $$;

-- ==========================================
-- PHASE 7: CLEANUP (Optional - run after verification)
-- ==========================================

-- Uncomment these lines after verifying migration is successful
-- DROP TABLE payments_backup_035;
-- DROP TABLE payment_events_backup_035;
-- DROP TABLE wallet_transactions_backup_035;

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================