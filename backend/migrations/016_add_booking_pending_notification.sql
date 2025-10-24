-- Add booking_pending notification type to support pending sessions awaiting payment
-- This migration updates the notifications table constraint to include the booking_pending type

-- First, drop the existing constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Then, add the new constraint with the additional type
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
CHECK (type IN (
    'booking_request', 'booking_confirmed', 'booking_cancelled', 'booking_pending', 'session_reminder',
    'session_started', 'session_completed', 'session_rescheduled', 'review_received',
    'payment_received', 'payout_processed', 'profile_verified', 'system_announcement',
    'promotional', 'reschedule_request', 'reschedule_approved', 'reschedule_declined',
    'meeting_invite', 'meeting_started', 'meeting_ended', 'meeting_join_reminder'
));