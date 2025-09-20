-- Fix OAuth user creation by making password_hash nullable
-- This allows OAuth users (Google, etc.) to be created without passwords

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Add a comment to explain this change
COMMENT ON COLUMN users.password_hash IS 'Password hash for email/password users. NULL for OAuth users (Google, etc.)';

-- Optional: Add a check constraint to ensure either password_hash is set OR social_links contains OAuth provider
-- This ensures users have either a password OR an OAuth provider
ALTER TABLE users ADD CONSTRAINT user_auth_method_check
CHECK (
  (password_hash IS NOT NULL) OR
  (social_links IS NOT NULL AND social_links != '{}'::jsonb)
);