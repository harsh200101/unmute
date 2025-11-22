-- Migration: 026_fix_wallet_schema.sql
-- Fix missing metadata column in payments table and update mentor earnings calculation
-- Migration Date: 2025-11-15

-- ==========================================
-- PHASE 1: BACKUP EXISTING DATA
-- ==========================================

-- Create backup of payments table
CREATE TABLE payments_backup_026 AS
SELECT * FROM payments;

-- ==========================================
-- PHASE 2: ADD MISSING METADATA COLUMN
-- ==========================================

-- Add metadata column to payments table (JSONB for flexible storage)
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create index for metadata queries (using btree for text fields)
CREATE INDEX IF NOT EXISTS idx_payments_metadata_type ON payments ((metadata->>'type'));
CREATE INDEX IF NOT EXISTS idx_payments_metadata_user_id ON payments ((metadata->>'userId'));

-- ==========================================
-- PHASE 3: VALIDATION QUERIES
-- ==========================================

-- Verify metadata column was added
DO $$
DECLARE
    metadata_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'payments'
        AND column_name = 'metadata'
    ) INTO metadata_exists;

    IF NOT metadata_exists THEN
        RAISE EXCEPTION 'Metadata column was not added to payments table';
    ELSE
        RAISE NOTICE 'Metadata column successfully added to payments table';
    END IF;
END $$;

-- ==========================================
-- PHASE 4: CLEANUP (Optional - run after verification)
-- ==========================================

-- Uncomment these lines after verifying migration is successful
-- DROP TABLE payments_backup_026;

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================