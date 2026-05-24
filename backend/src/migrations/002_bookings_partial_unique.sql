-- Replace the full UNIQUE (mentor_user_id, slot_start_at) constraint on
-- bookings with a partial unique INDEX that excludes terminal statuses
-- (cancelled by any party, no-show). This way, when a mentee cancels their
-- 6pm slot, the 6pm slot becomes bookable again by someone else.

ALTER TABLE bookings DROP CONSTRAINT bookings_no_double_book;

CREATE UNIQUE INDEX bookings_no_double_book
  ON bookings (mentor_user_id, slot_start_at)
  WHERE status NOT IN (
    'cancelled_by_mentee',
    'cancelled_by_mentor',
    'cancelled_admin',
    'no_show'
  );
