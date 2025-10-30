-- Migration: 017_convert_to_inr_currency.sql
-- Convert entire platform to use INR as the default and only currency
-- Convert all existing USD amounts using estimated exchange rates

-- ==========================================
-- PHASE 1: BACKUP EXISTING DATA
-- ==========================================

-- Create backup tables for safety
CREATE TABLE mentors_backup_pre_inr AS SELECT * FROM mentors;
CREATE TABLE sessions_backup_pre_inr AS SELECT * FROM sessions;
CREATE TABLE payments_backup_pre_inr AS SELECT * FROM payments;

-- ==========================================
-- PHASE 2: CURRENCY CONVERSION RATES
-- ==========================================

-- Using approximate exchange rates (as of late 2024):
-- 1 USD = 83 INR
-- 1 EUR = 90 INR
-- 1 GBP = 105 INR
-- All other currencies convert to INR at market rates

-- ==========================================
-- PHASE 3: CONVERT MENTOR HOURLY RATES TO INR
-- ==========================================

-- Convert USD rates to INR (multiply by 83)
UPDATE mentors
SET hourly_rate = ROUND(hourly_rate * 83, 2),
    currency = 'INR'
WHERE currency = 'USD' OR currency IS NULL OR currency = '';

-- Convert EUR rates to INR (multiply by 90)
UPDATE mentors
SET hourly_rate = ROUND(hourly_rate * 90, 2),
    currency = 'INR'
WHERE currency = 'EUR';

-- Convert GBP rates to INR (multiply by 105)
UPDATE mentors
SET hourly_rate = ROUND(hourly_rate * 105, 2),
    currency = 'INR'
WHERE currency = 'GBP';

-- Ensure all mentors have INR currency
UPDATE mentors
SET currency = 'INR'
WHERE currency != 'INR' OR currency IS NULL;

-- ==========================================
-- PHASE 4: CONVERT SESSION PRICES TO INR
-- ==========================================

-- Temporarily disable the constraint for migration
ALTER TABLE sessions DROP CONSTRAINT session_valid_earnings;

-- Convert USD session prices to INR
UPDATE sessions
SET price = ROUND(price * 83, 2),
    mentor_earnings = ROUND(price * 83, 2),
    currency = 'INR'
WHERE currency = 'USD' OR currency IS NULL OR currency = '';

-- Convert EUR session prices to INR
UPDATE sessions
SET price = ROUND(price * 90, 2),
    mentor_earnings = ROUND(price * 90, 2),
    currency = 'INR'
WHERE currency = 'EUR';

-- Convert GBP session prices to INR
UPDATE sessions
SET price = ROUND(price * 105, 2),
    mentor_earnings = ROUND(price * 105, 2),
    currency = 'INR'
WHERE currency = 'GBP';

-- Re-enable the constraint
ALTER TABLE sessions ADD CONSTRAINT session_valid_earnings CHECK (mentor_earnings = price);

-- Ensure all sessions have INR currency
UPDATE sessions
SET currency = 'INR'
WHERE currency != 'INR' OR currency IS NULL;

-- ==========================================
-- PHASE 5: CONVERT PAYMENT AMOUNTS TO INR
-- ==========================================

-- Convert USD payment amounts to INR
UPDATE payments
SET amount = ROUND(amount * 83, 2),
    currency = 'INR'
WHERE currency = 'USD' OR currency IS NULL OR currency = '';

-- Convert EUR payment amounts to INR
UPDATE payments
SET amount = ROUND(amount * 90, 2),
    currency = 'INR'
WHERE currency = 'EUR';

-- Convert GBP payment amounts to INR
UPDATE payments
SET amount = ROUND(amount * 105, 2),
    currency = 'INR'
WHERE currency = 'GBP';

-- Convert platform fees to INR
UPDATE payments
SET platform_fee = ROUND(platform_fee * 83, 2)
WHERE currency = 'USD' OR currency IS NULL OR currency = '';

UPDATE payments
SET platform_fee = ROUND(platform_fee * 90, 2)
WHERE currency = 'EUR';

UPDATE payments
SET platform_fee = ROUND(platform_fee * 105, 2)
WHERE currency = 'GBP';

-- Convert mentor earnings to INR
UPDATE payments
SET mentor_earnings = ROUND(mentor_earnings * 83, 2)
WHERE currency = 'USD' OR currency IS NULL OR currency = '';

UPDATE payments
SET mentor_earnings = ROUND(mentor_earnings * 90, 2)
WHERE currency = 'EUR';

UPDATE payments
SET mentor_earnings = ROUND(mentor_earnings * 105, 2)
WHERE currency = 'GBP';

-- Ensure all payments have INR currency
UPDATE payments
SET currency = 'INR'
WHERE currency != 'INR' OR currency IS NULL;

-- ==========================================
-- PHASE 6: UPDATE DEFAULT CURRENCY CONSTRAINTS
-- ==========================================

-- Update table defaults to INR
ALTER TABLE mentors ALTER COLUMN currency SET DEFAULT 'INR';
ALTER TABLE sessions ALTER COLUMN currency SET DEFAULT 'INR';
ALTER TABLE payments ALTER COLUMN currency SET DEFAULT 'INR';

-- ==========================================
-- PHASE 7: VALIDATION QUERIES
-- ==========================================

-- Verify mentor conversions
DO $$
DECLARE
    usd_count INTEGER;
    eur_count INTEGER;
    gbp_count INTEGER;
    total_mentors INTEGER;
BEGIN
    SELECT COUNT(*) INTO usd_count FROM mentors WHERE currency = 'USD';
    SELECT COUNT(*) INTO eur_count FROM mentors WHERE currency = 'EUR';
    SELECT COUNT(*) INTO gbp_count FROM mentors WHERE currency = 'GBP';
    SELECT COUNT(*) INTO total_mentors FROM mentors;

    RAISE NOTICE 'Mentor currency conversion validation:';
    RAISE NOTICE 'USD mentors remaining: %', usd_count;
    RAISE NOTICE 'EUR mentors remaining: %', eur_count;
    RAISE NOTICE 'GBP mentors remaining: %', gbp_count;
    RAISE NOTICE 'Total mentors: %', total_mentors;

    IF usd_count > 0 OR eur_count > 0 OR gbp_count > 0 THEN
        RAISE EXCEPTION 'Currency conversion failed - non-INR currencies still exist';
    END IF;
END $$;

-- Verify session conversions
DO $$
DECLARE
    usd_count INTEGER;
    eur_count INTEGER;
    gbp_count INTEGER;
    total_sessions INTEGER;
BEGIN
    SELECT COUNT(*) INTO usd_count FROM sessions WHERE currency = 'USD';
    SELECT COUNT(*) INTO eur_count FROM sessions WHERE currency = 'EUR';
    SELECT COUNT(*) INTO gbp_count FROM sessions WHERE currency = 'GBP';
    SELECT COUNT(*) INTO total_sessions FROM sessions;

    RAISE NOTICE 'Session currency conversion validation:';
    RAISE NOTICE 'USD sessions remaining: %', usd_count;
    RAISE NOTICE 'EUR sessions remaining: %', eur_count;
    RAISE NOTICE 'GBP sessions remaining: %', gbp_count;
    RAISE NOTICE 'Total sessions: %', total_sessions;

    IF usd_count > 0 OR eur_count > 0 OR gbp_count > 0 THEN
        RAISE EXCEPTION 'Currency conversion failed - non-INR currencies still exist';
    END IF;
END $$;

-- Verify payment conversions
DO $$
DECLARE
    usd_count INTEGER;
    eur_count INTEGER;
    gbp_count INTEGER;
    total_payments INTEGER;
BEGIN
    SELECT COUNT(*) INTO usd_count FROM payments WHERE currency = 'USD';
    SELECT COUNT(*) INTO eur_count FROM payments WHERE currency = 'EUR';
    SELECT COUNT(*) INTO gbp_count FROM payments WHERE currency = 'GBP';
    SELECT COUNT(*) INTO total_payments FROM payments;

    RAISE NOTICE 'Payment currency conversion validation:';
    RAISE NOTICE 'USD payments remaining: %', usd_count;
    RAISE NOTICE 'EUR payments remaining: %', eur_count;
    RAISE NOTICE 'GBP payments remaining: %', gbp_count;
    RAISE NOTICE 'Total payments: %', total_payments;

    IF usd_count > 0 OR eur_count > 0 OR gbp_count > 0 THEN
        RAISE EXCEPTION 'Currency conversion failed - non-INR currencies still exist';
    END IF;
END $$;

-- ==========================================
-- PHASE 8: CLEANUP (Optional - run after verification)
-- ==========================================

-- Uncomment these lines after verifying migration is successful
-- DROP TABLE mentors_backup_pre_inr;
-- DROP TABLE sessions_backup_pre_inr;
-- DROP TABLE payments_backup_pre_inr;

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================