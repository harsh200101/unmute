-- Add anonymous review functionality back to reviews table
-- This migration adds the is_anonymous column that was previously removed

-- Add is_anonymous column to reviews table
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN reviews.is_anonymous IS 'Whether this review was submitted anonymously by the reviewer';

-- Create index for performance on anonymous reviews
CREATE INDEX IF NOT EXISTS idx_reviews_anonymous ON reviews(is_anonymous) WHERE is_anonymous = true;