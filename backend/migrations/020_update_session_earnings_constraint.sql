-- Migration: 020_update_session_earnings_constraint.sql
-- Update session earnings constraint to reflect actual payment calculations
-- mentor_earnings should equal price - platform_fee, not just price

-- ==========================================
-- PHASE 1: BACKUP EXISTING DATA
-- ==========================================

-- Create backup table with unique name to avoid conflicts
CREATE TABLE IF NOT EXISTS sessions_earnings_backup_020 AS
SELECT id, price, platform_fee, mentor_earnings, status FROM sessions;

-- ==========================================
-- PHASE 2: UPDATE EXISTING DATA
-- ==========================================

-- Temporarily disable the old constraint
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS session_valid_earnings;

-- Update mentor_earnings to be price - platform_fee for all sessions
-- This ensures consistency with payment calculations
UPDATE sessions
SET mentor_earnings = price - platform_fee,
    updated_at = CURRENT_TIMESTAMP
WHERE mentor_earnings != (price - platform_fee);

-- ==========================================
-- PHASE 3: UPDATE CONSTRAINT
-- ==========================================

-- Add the new constraint that reflects actual business logic
ALTER TABLE sessions ADD CONSTRAINT session_valid_earnings
  CHECK (mentor_earnings = price - platform_fee);

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
-- PHASE 5: LOG CHANGES (Optional)
-- ==========================================

-- Note: Migration logging table may not exist in all environments
-- Uncomment if migration_logs table exists:
-- INSERT INTO migration_logs (migration_name, description, executed_at)
-- VALUES ('020_update_session_earnings_constraint', 'Updated session earnings constraint to mentor_earnings = price - platform_fee', CURRENT_TIMESTAMP)
-- ON CONFLICT (migration_name) DO UPDATE SET
--     executed_at = CURRENT_TIMESTAMP,
--     description = EXCLUDED.description;

-- ==========================================
-- PHASE 6: CLEANUP (Optional - run after verification)
-- ==========================================

-- Uncomment these lines after verifying the fix is successful
-- DROP TABLE sessions_earnings_backup_020;