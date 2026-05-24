-- In-call chat. Messages are scoped to a meeting (the booking's video room).
-- Persistence is intentional: post-call, both parties can read back what was
-- said (helpful for recalling action items, links shared, etc). Kept simple
-- on purpose — no edits, no deletes, no reactions, no read receipts. If we
-- later want richer features they can be additive columns.

CREATE TABLE IF NOT EXISTS meeting_messages (
  id              BIGSERIAL PRIMARY KEY,
  meeting_id      BIGINT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  sender_user_id  BIGINT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  body            TEXT   NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Listing newest-first within a meeting is the dominant query.
-- We also poll for "messages newer than id=N", so id-on-meeting helps both.
CREATE INDEX IF NOT EXISTS idx_meeting_messages_meeting_id
  ON meeting_messages (meeting_id, id DESC);
