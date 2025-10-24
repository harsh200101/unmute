-- Create session reschedule requests table
-- This table handles mentor-initiated reschedule requests that mentees can accept or decline
-- Mentor requests reschedule, mentee chooses new time

-- First, drop the table if it exists to recreate with new schema
DROP TABLE IF EXISTS session_reschedule_requests CASCADE;

CREATE TABLE session_reschedule_requests (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,

    -- Request details
    requested_by VARCHAR(20) NOT NULL CHECK (requested_by IN ('mentor', 'mentee')),
    reason TEXT,

    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'cancelled', 'declined')),

    -- Response tracking
    responded_by INTEGER REFERENCES users(id),
    response_reason TEXT,
    responded_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_reschedule_requests_session ON session_reschedule_requests(session_id);
CREATE INDEX idx_reschedule_requests_status ON session_reschedule_requests(status);
CREATE INDEX idx_reschedule_requests_created_at ON session_reschedule_requests(created_at DESC);
CREATE INDEX idx_reschedule_requests_responded_by ON session_reschedule_requests(responded_by);

-- Update notifications table to include reschedule request types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
CHECK (type IN (
    'booking_request', 'booking_confirmed', 'booking_cancelled', 'session_reminder',
    'session_started', 'session_completed', 'session_rescheduled', 'review_received',
    'payment_received', 'payout_processed', 'profile_verified', 'system_announcement',
    'promotional', 'reschedule_request', 'reschedule_approved', 'reschedule_declined'
));

-- Add trigger to update updated_at
CREATE TRIGGER trigger_reschedule_requests_updated_at
    BEFORE UPDATE ON session_reschedule_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();