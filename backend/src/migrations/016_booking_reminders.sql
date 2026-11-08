ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reminded_15m_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminded_5m_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_bookings_reminders
  ON bookings (slot_start_at)
  WHERE status = 'scheduled';
