-- Pre-session intent capture: just_listen, perspective, or action_plan
-- Helps mentors calibrate listening vs. problem-solving before and during calls.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS intent_type TEXT DEFAULT 'perspective'
  CHECK (intent_type IS NULL OR intent_type IN ('just_listen', 'perspective', 'action_plan'));

CREATE INDEX IF NOT EXISTS ix_bookings_intent_type
  ON bookings (intent_type);
