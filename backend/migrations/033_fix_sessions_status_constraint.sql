-- Fix sessions status constraint to include cancelled_by_mentee and cancelled_by_mentor
-- This migration addresses the constraint violation when mentees cancel sessions

DO $$
BEGIN
    -- Drop the existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'sessions_status_check'
        AND table_name = 'sessions'
    ) THEN
        ALTER TABLE sessions DROP CONSTRAINT sessions_status_check;
    END IF;
END $$;

-- Add the updated constraint with all required statuses
ALTER TABLE sessions
ADD CONSTRAINT sessions_status_check
CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'force_ended', 'cancelled_by_mentee', 'cancelled_by_mentor'));