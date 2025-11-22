-- Drop hourly_rate column from mentors table as we're moving to fixed pricing
-- This column is no longer needed since we're using fixed ₹5000 pricing for video sessions

-- Create backup before dropping
CREATE TABLE IF NOT EXISTS mentors_hourly_rate_backup AS
SELECT id, user_id, hourly_rate, per_minute_rate, currency, created_at, updated_at
FROM mentors
WHERE hourly_rate IS NOT NULL;

-- Drop the view that depends on hourly_rate
DROP VIEW IF EXISTS active_mentors;

-- Drop the hourly_rate column
ALTER TABLE mentors DROP COLUMN IF EXISTS hourly_rate;

-- Recreate the active_mentors view without hourly_rate
CREATE VIEW active_mentors AS
SELECT
    m.*,
    u.first_name,
    u.last_name,
    u.email,
    u.avatar_url,
    u.location,
    u.is_verified as user_verified,
    ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as categories
FROM mentors m
JOIN users u ON m.user_id = u.id
LEFT JOIN mentor_categories mc ON m.id = mc.mentor_id
LEFT JOIN categories c ON mc.category_id = c.id
WHERE m.status = 'active'
    AND m.verification_status = 'verified'
    AND u.is_active = true
    AND u.is_verified = true
GROUP BY m.id, u.id;