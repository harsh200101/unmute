-- Drop the constraint that prevents null ratings for mentee reviews
-- This makes overall_rating optional for both mentee and mentor reviews

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS valid_ratings;

-- Add a comment to clarify the design decision
COMMENT ON COLUMN reviews.overall_rating IS 'Optional rating (1-5) for both mentee and mentor reviews. Can be null if only comment is provided.';