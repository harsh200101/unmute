-- Migration: 023_fix_existing_sessions_earnings.sql
-- Fix mentor earnings for existing sessions that have incorrect values
-- This migration updates all sessions where mentor_earnings != price - platform_fee

-- ==========================================
-- PHASE 1: BACKUP EXISTING DATA (Optional)
-- ==========================================

-- Note: No data changes needed, just updating calculations

-- ==========================================
-- PHASE 2: FIX EXISTING SESSION EARNINGS
-- ==========================================

-- Update all sessions to have correct mentor_earnings = price - platform_fee
UPDATE sessions
SET mentor_earnings = price - platform_fee,
    updated_at = CURRENT_TIMESTAMP
WHERE mentor_earnings != (price - platform_fee);

-- ==========================================
-- PHASE 3: VALIDATION
-- ==========================================

DO $$
DECLARE
    updated_count INTEGER;
    total_sessions INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    SELECT COUNT(*) INTO total_sessions FROM sessions;

    RAISE NOTICE 'Sessions updated: %', updated_count;
    RAISE NOTICE 'Total sessions: %', total_sessions;

    -- Check if any sessions still have incorrect earnings
    SELECT COUNT(*) INTO updated_count
    FROM sessions
    WHERE mentor_earnings != (price - platform_fee);

    IF updated_count > 0 THEN
        RAISE EXCEPTION 'Some sessions still have incorrect mentor earnings. Count: %', updated_count;
    ELSE
        RAISE NOTICE 'All sessions now have correct mentor earnings';
    END IF;
END $$;

-- ==========================================
-- PHASE 4: LOG MIGRATION (Optional)
-- ==========================================

-- Note: Migration logging table may not exist in all environments
-- Uncomment if migration_logs table exists:
-- INSERT INTO migration_logs (migration_name, description, executed_at)
-- VALUES ('023_fix_existing_sessions_earnings', 'Fixed mentor earnings for all existing sessions to equal price - platform_fee', CURRENT_TIMESTAMP)
-- ON CONFLICT (migration_name) DO UPDATE SET
--     executed_at = CURRENT_TIMESTAMP,
--     description = EXCLUDED.description;

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================