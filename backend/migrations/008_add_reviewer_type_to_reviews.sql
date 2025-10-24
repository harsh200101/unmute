-- Add reviewer_type column to reviews table to distinguish between mentee and mentor reviews
-- This migration adds the missing column needed for the mentor-to-mentee review system

ALTER TABLE reviews ADD COLUMN reviewer_type VARCHAR(20) DEFAULT 'mentee' CHECK (reviewer_type IN ('mentee', 'mentor'));

-- Update existing reviews to be from mentees (backward compatibility)
UPDATE reviews SET reviewer_type = 'mentee' WHERE reviewer_type IS NULL;

-- Add index for better query performance
CREATE INDEX idx_reviews_reviewer_type ON reviews(reviewer_type);

-- Add composite index for filtering reviews by type and visibility
CREATE INDEX idx_reviews_type_visibility ON reviews(reviewer_type, is_hidden) WHERE is_hidden = false;