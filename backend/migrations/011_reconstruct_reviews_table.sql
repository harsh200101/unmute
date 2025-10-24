-- Reconstruct the reviews table with proper structure for bidirectional reviews
-- This migration drops and recreates the reviews table with correct schema

-- First, backup existing reviews data
CREATE TABLE reviews_backup AS SELECT * FROM reviews;

-- Drop existing reviews table and related constraints
DROP TABLE IF EXISTS reviews CASCADE;

-- Recreate reviews table with proper structure
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
    mentor_id INTEGER REFERENCES mentors(id) ON DELETE CASCADE NOT NULL,
    mentee_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,

    -- Who is reviewing whom
    reviewer_type VARCHAR(20) NOT NULL CHECK (reviewer_type IN ('mentee', 'mentor')),
    review_target VARCHAR(20) NOT NULL CHECK (review_target IN ('mentor', 'mentee')),

    -- Ratings (1-5 scale, optional for mentor reviews)
    overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
    communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
    knowledge_rating INTEGER CHECK (knowledge_rating >= 1 AND knowledge_rating <= 5),
    helpfulness_rating INTEGER CHECK (helpfulness_rating >= 1 AND helpfulness_rating <= 5),

    -- Feedback
    comment TEXT,
    private_feedback TEXT, -- Only visible to mentor and admin

    -- Anonymity
    is_anonymous BOOLEAN DEFAULT false,

    -- Moderation
    is_verified BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    is_hidden BOOLEAN DEFAULT false,
    moderation_notes TEXT,

    -- Helpful votes from other users
    helpful_votes INTEGER DEFAULT 0 CHECK (helpful_votes >= 0),

    -- Response from the reviewed party
    target_response TEXT,
    target_response_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    UNIQUE(session_id, reviewer_type), -- Only one review per session per reviewer type
    CONSTRAINT valid_ratings CHECK (
        (reviewer_type = 'mentee' AND overall_rating IS NOT NULL) OR
        (reviewer_type = 'mentor')
    )
);

-- Restore data from backup (if exists)
INSERT INTO reviews (
    session_id, mentor_id, mentee_id, reviewer_type, review_target,
    overall_rating, communication_rating, knowledge_rating, helpfulness_rating,
    comment, private_feedback, is_anonymous, is_verified, is_featured, is_hidden,
    moderation_notes, helpful_votes, target_response, target_response_at,
    created_at, updated_at
)
SELECT
    session_id, mentor_id, mentee_id,
    COALESCE(reviewer_type, 'mentee') as reviewer_type,
    CASE WHEN COALESCE(reviewer_type, 'mentee') = 'mentee' THEN 'mentor' ELSE 'mentee' END as review_target,
    overall_rating, communication_rating, knowledge_rating, helpfulness_rating,
    comment, private_feedback,
    COALESCE(is_anonymous, false) as is_anonymous,
    COALESCE(is_verified, false) as is_verified,
    COALESCE(is_featured, false) as is_featured,
    COALESCE(is_hidden, false) as is_hidden,
    moderation_notes, COALESCE(helpful_votes, 0) as helpful_votes,
    mentor_response as target_response, mentor_response_at as target_response_at,
    created_at, updated_at
FROM reviews_backup
WHERE EXISTS (SELECT 1 FROM sessions WHERE id = reviews_backup.session_id);

-- Create indexes for performance
CREATE INDEX idx_reviews_session ON reviews(session_id);
CREATE INDEX idx_reviews_mentor ON reviews(mentor_id);
CREATE INDEX idx_reviews_mentee ON reviews(mentee_id);
CREATE INDEX idx_reviews_reviewer_type ON reviews(reviewer_type);
CREATE INDEX idx_reviews_review_target ON reviews(review_target);
CREATE INDEX idx_reviews_rating ON reviews(overall_rating DESC);
CREATE INDEX idx_reviews_featured ON reviews(is_featured) WHERE is_featured = true;
CREATE INDEX idx_reviews_visible ON reviews(is_hidden, is_verified) WHERE is_hidden = false;
CREATE INDEX idx_reviews_anonymous ON reviews(is_anonymous) WHERE is_anonymous = true;

-- Drop backup table
DROP TABLE reviews_backup;