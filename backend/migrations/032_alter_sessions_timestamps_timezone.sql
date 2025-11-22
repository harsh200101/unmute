-- Alter timestamp columns to be timezone-aware to prevent timezone conversion issues

ALTER TABLE sessions
ALTER COLUMN billing_start_time TYPE TIMESTAMP WITH TIME ZONE,
ALTER COLUMN actual_start_time TYPE TIMESTAMP WITH TIME ZONE,
ALTER COLUMN actual_end_time TYPE TIMESTAMP WITH TIME ZONE;