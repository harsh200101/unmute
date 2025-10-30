-- Migration: 018_fix_session_earnings_constraint.sql
-- Fix session_valid_earnings constraint violations after currency conversion
-- The constraint requires mentor_earnings = price, but some sessions have incorrect values

-- ==========================================
-- PHASE 1: BACKUP EXISTING DATA
-- ==========================================

-- Create backup of sessions with constraint violations
CREATE TABLE sessions_constraint_violations_backup AS
SELECT * FROM sessions WHERE mentor_earnings != price;

-- ==========================================
-- PHASE 2: FIX CONSTRAINT VIOLATIONS
-- ==========================================

-- Temporarily disable the constraint
ALTER TABLE sessions DROP CONSTRAINT session_valid_earnings;

-- Fix sessions where mentor_earnings doesn't equal price
-- Set mentor_earnings to equal price (no platform fee deduction at session level)
UPDATE sessions
SET mentor_earnings = price,
    updated_at = CURRENT_TIMESTAMP
WHERE mentor_earnings != price;

-- ==========================================
-- PHASE 3: RE-ENABLE CONSTRAINT
-- ==========================================

-- Re-enable the constraint
ALTER TABLE sessions ADD CONSTRAINT session_valid_earnings CHECK (mentor_earnings = price);

-- ==========================================
-- PHASE 4: VALIDATION
-- ==========================================

-- Verify no constraint violations remain
DO $$
DECLARE
    violation_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO violation_count
    FROM sessions
    WHERE mentor_earnings != price;

    RAISE NOTICE 'Constraint violations after fix: %', violation_count;

    IF violation_count > 0 THEN
        RAISE EXCEPTION 'Constraint violations still exist after fix attempt';
    END IF;
END $$;

-- ==========================================
-- PHASE 5: CLEANUP (Optional - run after verification)
-- ==========================================

-- Uncomment these lines after verifying the fix is successful
-- DROP TABLE sessions_constraint_violations_backup;

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================