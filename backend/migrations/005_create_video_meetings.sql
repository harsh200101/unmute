-- Create video meetings table for Agora integration
-- This table stores Agora-specific meeting data separate from sessions

CREATE TABLE video_meetings (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE NOT NULL UNIQUE,

    -- Agora-specific data
    channel_name VARCHAR(100) NOT NULL UNIQUE,
    agora_app_id VARCHAR(50) NOT NULL,
    agora_token TEXT,
    token_expires_at TIMESTAMP,

    -- Meeting status and timing
    meeting_status VARCHAR(20) DEFAULT 'scheduled' CHECK (meeting_status IN (
        'scheduled', 'active', 'ended', 'cancelled'
    )),
    actual_start_time TIMESTAMP,
    actual_end_time TIMESTAMP,
    actual_duration_minutes INTEGER CHECK (actual_duration_minutes >= 0),

    -- Participants tracking
    participants_joined JSONB DEFAULT '[]', -- Array of user IDs who joined
    max_participants INTEGER DEFAULT 2, -- Max 2 for mentor-mentee sessions

    -- Meeting settings
    max_duration_minutes INTEGER DEFAULT 75, -- 1 hour 15 minutes
    auto_end_enabled BOOLEAN DEFAULT true,

    -- Quality and settings
    video_quality VARCHAR(20) DEFAULT 'high' CHECK (video_quality IN ('low', 'medium', 'high')),
    audio_enabled BOOLEAN DEFAULT true,
    video_enabled BOOLEAN DEFAULT true,
    screen_share_enabled BOOLEAN DEFAULT false,

    -- Logging and metadata
    join_logs JSONB DEFAULT '[]', -- Track join/leave events
    quality_logs JSONB DEFAULT '[]', -- Track quality metrics
    error_logs JSONB DEFAULT '[]', -- Track errors

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT valid_duration CHECK (actual_end_time IS NULL OR actual_start_time IS NULL OR actual_end_time >= actual_start_time)
);

-- Indexes for performance
CREATE INDEX idx_video_meetings_session_id ON video_meetings(session_id);
CREATE INDEX idx_video_meetings_channel_name ON video_meetings(channel_name);
CREATE INDEX idx_video_meetings_status ON video_meetings(meeting_status);
CREATE INDEX idx_video_meetings_token_expires ON video_meetings(token_expires_at) WHERE token_expires_at IS NOT NULL;

-- Add trigger to update updated_at
CREATE TRIGGER trigger_video_meetings_updated_at
    BEFORE UPDATE ON video_meetings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add meeting_platform column to sessions if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'meeting_platform') THEN
        ALTER TABLE sessions ADD COLUMN meeting_platform VARCHAR(50) DEFAULT 'agora';
    END IF;
END $$;

-- Update existing sessions to use agora as default
UPDATE sessions SET meeting_platform = 'agora' WHERE meeting_platform IS NULL OR meeting_platform = '';

-- Add notification types for video meetings
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
CHECK (type IN (
    'booking_request', 'booking_confirmed', 'booking_cancelled', 'session_reminder',
    'session_started', 'session_completed', 'session_rescheduled', 'review_received',
    'payment_received', 'payout_processed', 'profile_verified', 'system_announcement',
    'promotional', 'reschedule_request', 'reschedule_approved', 'reschedule_declined',
    'meeting_invite', 'meeting_started', 'meeting_ended', 'meeting_join_reminder'
));