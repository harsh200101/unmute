-- unmute is a mental-health 1:1 platform, not a tech mentoring marketplace.
-- 'industry' as a tag kind makes no sense here. We add 'audience' (who the
-- mentor primarily serves — teens, couples, professionals, etc.) and keep
-- 'industry' allowed so existing rows don't break, but the seed deactivates
-- all of them.

ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_kind_check;
ALTER TABLE tags ADD CONSTRAINT tags_kind_check
  CHECK (kind IN ('expertise', 'audience', 'industry'));
