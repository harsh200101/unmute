-- Performance optimizations for slow mentor queries
-- This migration adds indexes and optimizations to fix 14+ second query times

-- ==========================================
-- ADDITIONAL INDEXES FOR PERFORMANCE
-- ==========================================

-- Composite indexes for mentor filtering (most important for getActiveMentors)
CREATE INDEX IF NOT EXISTS idx_mentors_active_verified_user
ON mentors(status, verification_status, user_id)
WHERE status = 'active' AND verification_status = 'verified';

-- Index for reviews aggregation queries
CREATE INDEX IF NOT EXISTS idx_reviews_mentor_rating
ON reviews(mentor_id, overall_rating)
WHERE is_hidden = false;

-- Index for session aggregation queries
CREATE INDEX IF NOT EXISTS idx_sessions_mentor_status_completed
ON sessions(mentor_id, status)
WHERE status = 'completed';

-- Index for mentor_categories joins
CREATE INDEX IF NOT EXISTS idx_mentor_categories_mentor_category
ON mentor_categories(mentor_id, category_id);

-- Index for mentor_expertise joins
CREATE INDEX IF NOT EXISTS idx_mentor_expertise_mentor_tag
ON mentor_expertise(mentor_id, tag_id);

-- Composite index for user verification status
CREATE INDEX IF NOT EXISTS idx_users_active_verified_email
ON users(is_active, is_verified, email)
WHERE is_active = true AND is_verified = true;

-- ==========================================
-- Note: Materialized view and triggers removed for initial deployment
-- These can be added later if needed for further optimization

-- ==========================================
-- OPTIMIZE EXISTING QUERIES
-- ==========================================

-- Analyze tables to update statistics
ANALYZE mentors;
ANALYZE users;
ANALYZE reviews;
ANALYZE sessions;
ANALYZE mentor_categories;
ANALYZE categories;
ANALYZE mentor_expertise;
ANALYZE expertise_tags;