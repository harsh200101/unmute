-- Add platform_fee column back to sessions table
-- This stores the platform fee deducted from each session's billing

BEGIN;

-- Add platform_fee column to sessions table
ALTER TABLE sessions
ADD COLUMN platform_fee DECIMAL(10,2) DEFAULT 0 CHECK (platform_fee >= 0);

-- Create index for platform_fee
CREATE INDEX idx_sessions_platform_fee ON sessions(platform_fee);

COMMIT;