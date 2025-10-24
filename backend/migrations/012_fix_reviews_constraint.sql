-- Simplify reviews table: make rating optional for both types, remove anonymous feature

-- Drop existing constraint
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS valid_ratings;

-- Drop unused rating columns
ALTER TABLE reviews DROP COLUMN IF EXISTS communication_rating;
ALTER TABLE reviews DROP COLUMN IF EXISTS knowledge_rating;
ALTER TABLE reviews DROP COLUMN IF EXISTS helpfulness_rating;

-- Drop anonymous column
ALTER TABLE reviews DROP COLUMN IF EXISTS is_anonymous;

-- Make overall_rating optional for both reviewer types (no constraint needed)
-- Reviews can now have rating, comment, or both, or neither