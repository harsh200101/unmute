ALTER TABLE mentor_profiles
  ADD COLUMN IF NOT EXISTS is_available_now BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS available_now_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_mentor_profiles_available_now
  ON mentor_profiles (is_available_now, available_now_until)
  WHERE is_available_now = TRUE;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_instant BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_bookings_is_instant
  ON bookings (is_instant)
  WHERE is_instant = TRUE;
