-- Mental-health mentors want context on the client before the session.
-- The columns themselves were added in 001_init. We widen the CHECK
-- constraints to cover more self-IDs (in_relationship, separated, other).
-- NULL is always allowed — these fields are optional.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_gender_check;
ALTER TABLE users ADD CONSTRAINT users_gender_check
  CHECK (gender IS NULL OR gender IN
    ('female', 'male', 'non_binary', 'other', 'prefer_not_to_say'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_marital_status_check;
ALTER TABLE users ADD CONSTRAINT users_marital_status_check
  CHECK (marital_status IS NULL OR marital_status IN
    ('single', 'in_relationship', 'married', 'separated', 'divorced',
     'widowed', 'prefer_not_to_say'));
