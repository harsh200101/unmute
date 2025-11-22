-- Migration: 028_add_presence_billing_fields.sql
-- Add fields for tracking user presence and billing periods in mentoring sessions
-- Migration Date: 2025-11-16

-- ==========================================
-- PHASE 1: ADD PRESENCE AND BILLING FIELDS
-- ==========================================

-- Add presence tracking fields
ALTER TABLE sessions
ADD COLUMN mentee_present BOOLEAN DEFAULT false,
ADD COLUMN mentor_present BOOLEAN DEFAULT false,
ADD COLUMN billing_start_time TIMESTAMP,
ADD COLUMN billed_minutes DECIMAL(10,2) DEFAULT 0 CHECK (billed_minutes >= 0),
ADD COLUMN meeting_start_time TIMESTAMP,
ADD COLUMN meeting_end_time TIMESTAMP;

-- Update status check constraint to include 'in_progress'
-- First drop existing constraint if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'sessions_status_check'
        AND table_name = 'sessions'
    ) THEN
        ALTER TABLE sessions DROP CONSTRAINT sessions_status_check;
    END IF;
END $$;

-- Add new status constraint
ALTER TABLE sessions
ADD CONSTRAINT sessions_status_check
CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'force_ended'));

-- ==========================================
-- PHASE 2: CREATE INDEXES
-- ==========================================

CREATE INDEX idx_sessions_presence ON sessions(mentee_present, mentor_present);
CREATE INDEX idx_sessions_billing_start ON sessions(billing_start_time);
CREATE INDEX idx_sessions_meeting_times ON sessions(meeting_start_time, meeting_end_time);

-- ==========================================
-- PHASE 3: VALIDATION
-- ==========================================

-- Validate new columns exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sessions' AND column_name = 'mentee_present'
    ) THEN
        RAISE EXCEPTION 'Column mentee_present was not added';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sessions' AND column_name = 'mentor_present'
    ) THEN
        RAISE EXCEPTION 'Column mentor_present was not added';
    END IF;

    RAISE NOTICE 'Presence and billing fields added successfully';
END $$;

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================