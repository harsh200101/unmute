-- Add additional profile fields to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20) CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed', 'prefer_not_to_say'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'en' CHECK (preferred_language IN ('en', 'hi', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'ar', 'pt', 'ru', 'it'));

-- Add comment for documentation
COMMENT ON COLUMN users.marital_status IS 'User marital status for profile information';
COMMENT ON COLUMN users.preferred_language IS 'User preferred language (ISO 639-1 codes)';