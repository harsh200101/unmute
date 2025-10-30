-- Migration: 022_remove_session_earnings_constraint.sql
-- Remove the session_valid_earnings constraint from sessions table
-- This constraint was causing discrepancies between payments and sessions tables

-- ==========================================
-- PHASE 1: BACKUP EXISTING DATA (Optional)
-- ==========================================

-- Note: No data changes needed, just removing constraint

-- ==========================================
-- PHASE 2: REMOVE CONSTRAINT
-- ==========================================

-- Drop the problematic constraint that requires mentor_earnings = price
-- This was incorrect as mentor earnings should be price - platform_fee
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS session_valid_earnings;

-- ==========================================
-- PHASE 3: VALIDATION
-- ==========================================

DO $$
DECLARE
    constraint_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'session_valid_earnings'
        AND table_name = 'sessions'
    ) INTO constraint_exists;

    IF constraint_exists THEN
        RAISE EXCEPTION 'Constraint session_valid_earnings still exists after removal attempt';
    ELSE
        RAISE NOTICE 'Constraint session_valid_earnings successfully removed';
    END IF;
END $$;

-- ==========================================
-- PHASE 4: LOG MIGRATION (Optional)
-- ==========================================

-- Note: Migration logging table may not exist in all environments
-- Uncomment if migration_logs table exists:
-- INSERT INTO migration_logs (migration_name, description, executed_at)
-- VALUES ('022_remove_session_earnings_constraint', 'Removed session_valid_earnings constraint from sessions table', CURRENT_TIMESTAMP)
-- ON CONFLICT (migration_name) DO UPDATE SET
--     executed_at = CURRENT_TIMESTAMP,
--     description = EXCLUDED.description;

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================