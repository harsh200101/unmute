-- Phase A (presence reliability): add per-role last_seen_at to `meetings` so
-- the billing engine can auto-pause when a participant's browser drops
-- without firing /events/left. The frontend polls /billing every 5 s; each
-- poll bumps the caller's last_seen_at. If the value falls > 30 s behind
-- wall clock while billing is `active`, the tickBilling worker treats that
-- role as no-longer-present and rolls the active interval into billed_*,
-- transitioning the meeting to `paused`. Symmetrical to /events/left.

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS mentor_last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mentee_last_seen_at TIMESTAMPTZ;

-- Index isn't strictly needed (tickBilling already scans active meetings),
-- but it cheapens the staleness predicate when there are many concurrent
-- meetings.
CREATE INDEX IF NOT EXISTS idx_meetings_active_stale
  ON meetings (billing_state)
  WHERE billing_state = 'active';
