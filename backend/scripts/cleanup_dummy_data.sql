-- =====================================================================
-- cleanup_dummy_data.sql
-- ---------------------------------------------------------------------
-- Wipes all transactional / dummy testing data from the unmute database.
-- KEEPS: users, mentors, mentor profiles & related lookup data
--        (categories, languages, expertise_tags, mentor_categories,
--         mentor_languages, mentor_expertise, mentor_availability).
-- CLEARS: reviews, sessions, payments, wallet activity, bookings,
--         messages, notifications, favorites, video meetings, etc.
-- RESETS: mentor aggregate stats (ratings, review counts, session counts,
--         earnings) and wallet balances to zero.
--
-- USAGE (review carefully, then run against the target DB):
--   psql "$DATABASE_URL" -f backend/scripts/cleanup_dummy_data.sql
--
-- This script is wrapped in a single transaction so it either all
-- succeeds or all rolls back. Take a backup first:
--   pg_dump "$DATABASE_URL" > backup_before_cleanup.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Disable triggers temporarily so deleting reviews/sessions does not
--    keep firing the mentor-stats recalculation per row.
-- ---------------------------------------------------------------------
ALTER TABLE reviews   DISABLE TRIGGER trigger_update_mentor_stats;
ALTER TABLE sessions  DISABLE TRIGGER trigger_update_session_counts;

-- ---------------------------------------------------------------------
-- 2. Truncate transactional tables. ORDER MATTERS: children first.
--    Tables guarded with `IF EXISTS` so script is safe across envs that
--    may not have every optional migration applied.
-- ---------------------------------------------------------------------
TRUNCATE TABLE
    reviews,
    video_meetings,
    session_reschedule_requests,
    payment_events,
    payment_logs,
    payments,
    wallet_transactions,
    mentor_earnings,
    pending_bookings,
    messages,
    notifications,
    user_favorites,
    sessions
RESTART IDENTITY CASCADE;

-- session_notes exists in some envs (migration 017_create_session_notes)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_notes') THEN
        EXECUTE 'TRUNCATE TABLE session_notes RESTART IDENTITY CASCADE';
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Reset mentor aggregate counters back to zero.
-- ---------------------------------------------------------------------
UPDATE mentors
SET average_rating    = 0,
    total_reviews     = 0,
    total_sessions    = 0,
    completed_sessions = 0,
    total_earnings    = 0,
    cancellation_rate = 0.00,
    updated_at        = CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------
-- 4. Reset wallet balances (table exists from migration 025).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallets') THEN
        EXECUTE 'UPDATE wallets SET balance = 0, updated_at = CURRENT_TIMESTAMP';
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5. Re-enable triggers.
-- ---------------------------------------------------------------------
ALTER TABLE reviews   ENABLE TRIGGER trigger_update_mentor_stats;
ALTER TABLE sessions  ENABLE TRIGGER trigger_update_session_counts;

-- ---------------------------------------------------------------------
-- 6. Sanity report (rows remaining in preserved tables).
-- ---------------------------------------------------------------------
SELECT 'users'    AS table_name, COUNT(*) AS rows FROM users
UNION ALL SELECT 'mentors',   COUNT(*) FROM mentors
UNION ALL SELECT 'reviews',   COUNT(*) FROM reviews
UNION ALL SELECT 'sessions',  COUNT(*) FROM sessions
UNION ALL SELECT 'payments',  COUNT(*) FROM payments;

COMMIT;
