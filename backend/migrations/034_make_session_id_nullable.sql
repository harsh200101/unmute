-- Migration: 034_make_session_id_nullable.sql
-- Make session_id nullable in payments table to support wallet top-ups
-- Migration Date: 2025-11-22

-- ==========================================
-- PHASE 1: BACKUP EXISTING DATA
-- ==========================================

-- Create backup of payments table
CREATE TABLE payments_backup_034 AS
SELECT * FROM payments;

-- ==========================================
-- PHASE 2: MODIFY PAYMENTS TABLE
-- ==========================================

-- Make session_id nullable for wallet top-ups and other non-session payments
ALTER TABLE payments
ALTER COLUMN session_id DROP NOT NULL;

-- Update foreign key constraint to allow NULL values
ALTER TABLE payments
DROP CONSTRAINT IF EXISTS payments_session_id_fkey,
ADD CONSTRAINT payments_session_id_fkey
FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

-- ==========================================
-- PHASE 3: VALIDATION QUERIES
-- ==========================================

-- Verify session_id is now nullable
DO $$
DECLARE
    nullable_flag BOOLEAN;
BEGIN
    SELECT is_nullable INTO nullable_flag
    FROM information_schema.columns
    WHERE table_name = 'payments'
      AND column_name = 'session_id';

    IF nullable_flag THEN
        RAISE NOTICE 'session_id column is now nullable';
    ELSE
        RAISE EXCEPTION 'session_id column is still NOT NULL';
    END IF;
END $$;

-- ==========================================
-- PHASE 4: CLEANUP (Optional - run after verification)
-- ==========================================

-- Uncomment these lines after verifying migration is successful
-- DROP TABLE payments_backup_034;

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================