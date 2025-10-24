-- Add is_anonymous column to reviews table
-- This allows users to submit anonymous reviews

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;

-- Add index for anonymous reviews filtering
CREATE INDEX IF NOT EXISTS idx_reviews_anonymous ON reviews(is_anonymous) WHERE is_anonymous = true;