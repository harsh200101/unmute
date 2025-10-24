-- Add reviewer_type column to reviews table if it doesn't exist
-- This ensures the database schema supports both mentee and mentor reviews

DO $$
BEGIN
    -- Check if the column already exists
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'reviews'
        AND column_name = 'reviewer_type'
    ) THEN
        -- Add the column with default value
        ALTER TABLE reviews
        ADD COLUMN reviewer_type VARCHAR(20) DEFAULT 'mentee'
        CHECK (reviewer_type IN ('mentee', 'mentor'));

        -- Update existing reviews to be from mentees (backward compatibility)
        UPDATE reviews SET reviewer_type = 'mentee' WHERE reviewer_type IS NULL;

        -- Add index for better query performance
        CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_type ON reviews(reviewer_type);

        -- Add composite index for filtering reviews by type and visibility
        CREATE INDEX IF NOT EXISTS idx_reviews_type_visibility ON reviews(reviewer_type, is_hidden) WHERE is_hidden = false;

        RAISE NOTICE 'Successfully added reviewer_type column to reviews table';
    ELSE
        RAISE NOTICE 'reviewer_type column already exists in reviews table';
    END IF;
END $$;