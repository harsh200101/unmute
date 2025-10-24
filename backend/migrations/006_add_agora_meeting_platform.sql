-- Remove zoom and other platforms, keep only 'agora' as the meeting platform
-- This migration updates the sessions table constraint to only allow Agora

-- Drop the existing constraint
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_meeting_platform_check;

-- Add the new constraint with only 'agora' allowed
ALTER TABLE sessions ADD CONSTRAINT sessions_meeting_platform_check
CHECK (meeting_platform = 'agora');

-- Update all existing sessions to use 'agora'
UPDATE sessions SET meeting_platform = 'agora'
WHERE meeting_platform != 'agora' OR meeting_platform IS NULL;