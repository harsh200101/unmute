-- Email audit log. Every outbound send is logged here regardless of transport,
-- with the transport's message id and a status snapshot. Lets us diagnose
-- "did the email go out?" without needing a provider dashboard login, and gives
-- us a foundation for future retry logic.

CREATE TABLE IF NOT EXISTS email_log (
  id              BIGSERIAL PRIMARY KEY,
  to_email        TEXT        NOT NULL,
  subject         TEXT        NOT NULL,
  kind            TEXT,                       -- e.g. 'verification', 'review_received', 'mentor_approved', ...
  provider        TEXT        NOT NULL,       -- 'smtp' (Gmail) | 'stub' | 'test'
  provider_msg_id TEXT,                       -- transport's message id (Message-ID for SMTP)
  status          TEXT        NOT NULL,       -- 'accepted' (ESP returned 2xx), 'failed' (we threw)
  error_message   TEXT,                       -- truncated stack/message if status='failed'
  meta            JSONB,                      -- {code, command, response_code, stack, ...} for smtp
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The dominant lookup is "what did we send to this address recently?" — both
-- for debugging "did the verification email actually fire?" and for spam-prevention
-- (we may add per-address send caps later).
CREATE INDEX IF NOT EXISTS idx_email_log_to_email_created
  ON email_log (to_email, created_at DESC);

-- And "what failed recently?" for ops.
CREATE INDEX IF NOT EXISTS idx_email_log_status_created
  ON email_log (status, created_at DESC)
  WHERE status = 'failed';
