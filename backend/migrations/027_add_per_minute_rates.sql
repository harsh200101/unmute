-- Migration: 027_add_per_minute_rates.sql
-- Convert pricing system from hourly rates to per-minute rates
-- Migration Date: 2025-11-15

-- ==========================================
-- PHASE 1: BACKUP EXISTING DATA
-- ==========================================

-- Create backup of mentors table before rate conversion
CREATE TABLE mentors_backup_027 AS
SELECT id, user_id, hourly_rate, currency, created_at, updated_at FROM mentors;

-- ==========================================
-- PHASE 2: ADD PER-MINUTE RATE COLUMN
-- ==========================================

-- Add per_minute_rate column to mentors table
ALTER TABLE mentors ADD COLUMN per_minute_rate DECIMAL(10,2) DEFAULT 0.00 CHECK (per_minute_rate >= 0);

-- ==========================================
-- PHASE 3: MIGRATE EXISTING HOURLY RATES
-- ==========================================

-- Convert existing hourly rates to per-minute rates
-- Using 60 minutes per hour for conversion
-- Default to ₹500/hour (₹8.33/minute) for mentors without rates
UPDATE mentors
SET per_minute_rate = ROUND(
  COALESCE(hourly_rate, 500.00) / 60.0,
  2
)
WHERE per_minute_rate = 0.00;

-- ==========================================
-- PHASE 4: UPDATE SESSION BILLING COLUMNS
-- ==========================================

-- Update existing sessions to use per-minute rates
-- Set per_minute_rate for sessions based on mentor's rate
UPDATE sessions
SET per_minute_rate = (
  SELECT m.per_minute_rate FROM mentors m WHERE m.id = sessions.mentor_id
)
WHERE per_minute_rate = 0 OR per_minute_rate IS NULL;

-- Calculate actual_billed_amount for existing sessions
UPDATE sessions
SET actual_billed_amount = ROUND(
  per_minute_rate * duration_minutes,
  2
)
WHERE actual_billed_amount = 0 OR actual_billed_amount IS NULL;

-- ==========================================
-- PHASE 5: UPDATE MENTOR EARNINGS TABLE
-- ==========================================

-- Update existing mentor earnings to match new per-minute calculations
-- Use actual_billed_amount if available, otherwise calculate from per_minute_rate
UPDATE mentor_earnings me
SET amount = ROUND(
  COALESCE(
    (SELECT s.actual_billed_amount FROM sessions s WHERE s.id = me.session_id),
    (SELECT m.per_minute_rate * s.duration_minutes
     FROM mentors m
     JOIN sessions s ON s.id = me.session_id
     WHERE m.id = me.mentor_id)
  ) * (1 - 0.1), -- 10% platform fee
  2
)
WHERE me.status IN ('pending', 'paid');

-- ==========================================
-- PHASE 6: ADD INDEXES FOR PERFORMANCE
-- ==========================================

-- Create index for per_minute_rate queries
CREATE INDEX IF NOT EXISTS idx_mentors_per_minute_rate ON mentors (per_minute_rate);

-- ==========================================
-- PHASE 7: VALIDATION QUERIES
-- ==========================================

-- Validate per-minute rate conversion
DO $$
DECLARE
  total_mentors INTEGER;
  mentors_with_rates INTEGER;
  avg_hourly_rate DECIMAL(10,2);
  avg_per_minute_rate DECIMAL(10,2);
BEGIN
  SELECT COUNT(*) INTO total_mentors FROM mentors;
  SELECT COUNT(*) INTO mentors_with_rates FROM mentors WHERE per_minute_rate > 0;
  SELECT ROUND(AVG(hourly_rate), 2) INTO avg_hourly_rate FROM mentors WHERE hourly_rate > 0;
  SELECT ROUND(AVG(per_minute_rate), 2) INTO avg_per_minute_rate FROM mentors WHERE per_minute_rate > 0;

  RAISE NOTICE 'Per-minute rate migration validation:';
  RAISE NOTICE 'Total mentors: %', total_mentors;
  RAISE NOTICE 'Mentors with per-minute rates: %', mentors_with_rates;
  RAISE NOTICE 'Average hourly rate: ₹%', avg_hourly_rate;
  RAISE NOTICE 'Average per-minute rate: ₹%', avg_per_minute_rate;
  RAISE NOTICE 'Expected per-minute rate (hourly/60): ₹%', ROUND(avg_hourly_rate / 60, 2);

  IF mentors_with_rates != total_mentors THEN
    RAISE EXCEPTION 'Not all mentors have per-minute rates set';
  END IF;
END $$;

-- Validate session billing
DO $$
DECLARE
  sessions_with_billing INTEGER;
  total_sessions INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_sessions FROM sessions;
  SELECT COUNT(*) INTO sessions_with_billing FROM sessions WHERE actual_billed_amount > 0;

  RAISE NOTICE 'Session billing validation:';
  RAISE NOTICE 'Total sessions: %', total_sessions;
  RAISE NOTICE 'Sessions with billing amounts: %', sessions_with_billing;

  IF sessions_with_billing < total_sessions * 0.8 THEN
    RAISE EXCEPTION 'Too many sessions without billing amounts after migration';
  END IF;
END $$;

-- ==========================================
-- PHASE 8: CLEANUP (Optional - run after verification)
-- ==========================================

-- Uncomment these lines after verifying migration is successful
-- ALTER TABLE mentors DROP COLUMN IF EXISTS hourly_rate;
-- DROP TABLE mentors_backup_027;

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================