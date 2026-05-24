-- Phase 8: low-balance warning + grace state tracking.
--
-- Adds two columns on `meetings`:
--   grace_started_at   — set when billing_state transitions to 'low_balance_grace'.
--                        Used by the cron tick to know when the 60s grace window expires.
--   low_balance_warned_at — set once when est_seconds_remaining first dips below
--                           5 minutes. Prevents repeat warnings.

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS grace_started_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS low_balance_warned_at TIMESTAMPTZ,
  -- settled_paise tracks how much of billed_paise has already been moved
  -- to mentor + platform wallets (via mid-call settlement when entering
  -- grace). finalize() pays only the remaining (billed_paise - settled_paise)
  -- plus the 5-min minimum delta if applicable.
  ADD COLUMN IF NOT EXISTS settled_paise         INTEGER NOT NULL DEFAULT 0
    CHECK (settled_paise >= 0);

-- Cron tick scans active+grace meetings; a partial index keeps this fast.
CREATE INDEX IF NOT EXISTS ix_meetings_in_progress
  ON meetings (billing_state)
  WHERE billing_state IN ('active', 'low_balance_grace');
