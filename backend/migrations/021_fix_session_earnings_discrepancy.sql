-- Migration: 021_fix_session_earnings_discrepancy.sql
-- Fix the discrepancy between payments and sessions tables for mentor earnings
-- Root cause: Constraint requires mentor_earnings = price, but payments calculate mentor_earnings = amount - platform_fee

-- ==========================================
-- PHASE 1: BACKUP EXISTING DATA
-- ==========================================

-- Create backup of current sessions data
CREATE TABLE sessions_backup_021 AS
SELECT id, price, platform_fee, mentor_earnings, status, created_at, updated_at FROM sessions;

-- ==========================================
-- PHASE 2: UPDATE CONSTRAINT TO REFLECT CORRECT BUSINESS LOGIC
-- ==========================================

-- Drop the incorrect constraint
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS session_valid_earnings;

-- Add the correct constraint: mentor_earnings should equal price - platform_fee
ALTER TABLE sessions ADD CONSTRAINT session_valid_earnings
  CHECK (mentor_earnings = price - platform_fee);

-- ==========================================
-- PHASE 3: FIX EXISTING DATA
-- ==========================================

-- Update all existing sessions to have correct mentor_earnings
UPDATE sessions
SET mentor_earnings = price - platform_fee,
    updated_at = CURRENT_TIMESTAMP
WHERE mentor_earnings != (price - platform_fee);

-- ==========================================
-- PHASE 4: VALIDATION
-- ==========================================

DO $$
DECLARE
    violation_count INTEGER;
    total_sessions INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_sessions FROM sessions;

    SELECT COUNT(*) INTO violation_count
    FROM sessions
    WHERE mentor_earnings != (price - platform_fee);

    RAISE NOTICE 'Total sessions: %', total_sessions;
    RAISE NOTICE 'Constraint violations after fix: %', violation_count;

    IF violation_count > 0 THEN
        RAISE EXCEPTION 'Constraint violations still exist after fix attempt. Violations: %', violation_count;
    END IF;
END $$;

-- ==========================================
-- PHASE 5: LOG MIGRATION
-- ==========================================

-- Note: Migration logging table may not exist in all environments
-- Uncomment if migration_logs table exists:
-- INSERT INTO migration_logs (migration_name, description, executed_at)
-- VALUES ('021_fix_session_earnings_discrepancy', 'Fixed mentor earnings discrepancy - updated constraint to mentor_earnings = price - platform_fee', CURRENT_TIMESTAMP)
-- ON CONFLICT (migration_name) DO UPDATE SET
--     executed_at = CURRENT_TIMESTAMP,
--     description = EXCLUDED.description;

-- ==========================================
-- PHASE 6: CLEANUP (Optional - run after verification)
-- ==========================================

-- Uncomment these lines after verifying the fix is successful
-- DROP TABLE sessions_backup_021;

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================