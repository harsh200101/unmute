-- Fix mentor availability constraint to allow unavailable slots
-- This migration updates the valid_time_range constraint to account for is_available = false slots

-- Drop the existing constraint
ALTER TABLE mentor_availability
DROP CONSTRAINT valid_time_range;

-- Add the updated constraint that allows unavailable slots without time validation
ALTER TABLE mentor_availability
ADD CONSTRAINT valid_time_range CHECK (
    (is_available = true AND day_of_week IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time) OR
    (is_available = true AND specific_date IS NOT NULL) OR
    (is_available = false)
);