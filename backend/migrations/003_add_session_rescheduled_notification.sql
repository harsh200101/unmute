-- Add session_rescheduled notification type to the allowed types
-- This migration updates the notifications table constraint to include the new notification type

-- First, drop the existing constraint
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;

-- Then, add the new constraint with the additional type
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
CHECK (type IN (
    'booking_request', 'booking_confirmed', 'booking_cancelled', 'session_reminder',
    'session_started', 'session_completed', 'session_rescheduled', 'review_received',
    'payment_received', 'payout_processed', 'profile_verified', 'system_announcement', 'promotional'
));