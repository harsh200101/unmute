-- Incognito mode for mentee bookings.
-- When enabled, mentor sees "Anonymous Mentee", demographics and emails are masked,
-- meeting credentials hide mentee identity, and video is kept off initially.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_incognito BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_bookings_is_incognito
  ON bookings (is_incognito)
  WHERE is_incognito = TRUE;
