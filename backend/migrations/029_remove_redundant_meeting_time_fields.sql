-- Remove redundant meeting timing fields that duplicate actual_start_time and actual_end_time
-- billed_minutes calculation doesn't depend on these fields

BEGIN;

-- Remove the redundant columns
ALTER TABLE sessions DROP COLUMN IF EXISTS meeting_start_time;
ALTER TABLE sessions DROP COLUMN IF EXISTS meeting_end_time;

-- Drop the index that references these columns
DROP INDEX IF EXISTS idx_sessions_meeting_times;

COMMIT;