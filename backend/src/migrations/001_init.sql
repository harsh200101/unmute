-- ============================================================================
-- unmute v2 — initial schema
-- See: docs/v2-spec.md
-- All money is stored in PAISE (INTEGER). All timestamps are TIMESTAMPTZ (UTC).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ============================================================================
-- 0. Reusable helpers
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. USERS & AUTH
-- ============================================================================
CREATE TABLE users (
  id                    BIGSERIAL PRIMARY KEY,
  uuid                  UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  email                 CITEXT NOT NULL UNIQUE,
  password_hash         TEXT,
  google_sub            TEXT UNIQUE,
  full_name             TEXT NOT NULL,
  avatar_url            TEXT,
  bio                   TEXT,
  phone                 TEXT,
  phone_verified_at     TIMESTAMPTZ,
  date_of_birth         DATE,
  gender                TEXT CHECK (gender IS NULL OR gender IN ('male','female','non_binary','prefer_not_to_say')),
  marital_status        TEXT CHECK (marital_status IS NULL OR marital_status IN ('single','married','divorced','widowed','prefer_not_to_say')),
  location_city         TEXT,
  location_country      TEXT NOT NULL DEFAULT 'IN',
  preferred_language    TEXT NOT NULL DEFAULT 'en',
  preferences           JSONB NOT NULL DEFAULT '{}'::jsonb,
  role                  TEXT NOT NULL CHECK (role IN ('mentee','mentor','admin')),
  email_verified_at     TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  no_show_count         INTEGER NOT NULL DEFAULT 0,
  late_cancel_count     INTEGER NOT NULL DEFAULT 0,
  pending_penalty_paise INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_users_role ON users(role);
CREATE INDEX ix_users_email_verified ON users(email) WHERE email_verified_at IS NOT NULL;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE refresh_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE email_verification_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_reset_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_pwd_reset_user ON password_reset_tokens(user_id);

-- ============================================================================
-- 2. PRICING TIERS (admin-managed)
-- ============================================================================
CREATE TABLE pricing_tiers (
  id               BIGSERIAL PRIMARY KEY,
  uuid             UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  name             TEXT NOT NULL UNIQUE,
  display_name     TEXT NOT NULL,
  per_minute_paise INTEGER NOT NULL CHECK (per_minute_paise > 0),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_pricing_tiers_updated_at BEFORE UPDATE ON pricing_tiers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 2b. TAGS
-- ============================================================================
CREATE TABLE tags (
  id           BIGSERIAL PRIMARY KEY,
  uuid         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  slug         TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('expertise','industry')),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_tags_kind_active ON tags(kind) WHERE is_active;

CREATE TABLE mentor_tags (
  mentor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id         BIGINT NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mentor_user_id, tag_id)
);
CREATE INDEX ix_mentor_tags_tag ON mentor_tags(tag_id);

-- ============================================================================
-- 3. MENTOR PROFILES
-- ============================================================================
CREATE TABLE mentor_profiles (
  id                  BIGSERIAL PRIMARY KEY,
  uuid                UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_id             BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  pricing_tier_id     BIGINT NOT NULL REFERENCES pricing_tiers(id),
  headline            TEXT NOT NULL,
  bio                 TEXT NOT NULL,
  languages           TEXT[] NOT NULL DEFAULT '{en}',
  years_experience    INTEGER NOT NULL DEFAULT 0 CHECK (years_experience >= 0),
  linkedin_url        TEXT,
  video_intro_url     TEXT,
  timezone            TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','approved','rejected')),
  verification_notes  TEXT,
  verified_at         TIMESTAMPTZ,
  verified_by_user_id BIGINT REFERENCES users(id),
  rating_avg          NUMERIC(3,2) NOT NULL DEFAULT 0
    CHECK (rating_avg >= 0 AND rating_avg <= 5),
  rating_count        INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_mentor_status ON mentor_profiles(verification_status);
CREATE INDEX ix_mentor_tier ON mentor_profiles(pricing_tier_id);
CREATE TRIGGER trg_mentor_profiles_updated_at BEFORE UPDATE ON mentor_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 4. AVAILABILITY (weekly template + per-date overrides)
-- ============================================================================
CREATE TABLE availability_template (
  id               BIGSERIAL PRIMARY KEY,
  mentor_user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week      INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time_local TIME NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mentor_user_id, day_of_week, start_time_local)
);
CREATE INDEX ix_avail_tmpl_mentor ON availability_template(mentor_user_id) WHERE is_active;

CREATE TABLE availability_override (
  id             BIGSERIAL PRIMARY KEY,
  mentor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_at        TIMESTAMPTZ NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('block','add')),
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mentor_user_id, slot_at, action)
);
CREATE INDEX ix_avail_override_mentor_time ON availability_override(mentor_user_id, slot_at);

-- ============================================================================
-- 5. BOOKINGS
-- ============================================================================
CREATE TABLE bookings (
  id                             BIGSERIAL PRIMARY KEY,
  uuid                           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  mentor_user_id                 BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  mentee_user_id                 BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slot_start_at                  TIMESTAMPTZ NOT NULL,
  slot_end_at                    TIMESTAMPTZ NOT NULL,
  per_minute_paise_snapshot      INTEGER NOT NULL,
  mentee_title                   TEXT,
  mentee_topic                   TEXT,
  status                         TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN (
      'scheduled','in_call','completed','no_show',
      'cancelled_by_mentee','cancelled_by_mentor','cancelled_admin'
    )),
  cancelled_at                   TIMESTAMPTZ,
  cancel_reason                  TEXT,
  reschedule_to_at               TIMESTAMPTZ,
  reschedule_proposed_by_user_id BIGINT REFERENCES users(id),
  reschedule_proposed_at         TIMESTAMPTZ,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT bookings_no_double_book UNIQUE (mentor_user_id, slot_start_at),
  CONSTRAINT bookings_duration_check CHECK (slot_end_at = slot_start_at + INTERVAL '60 minutes'),
  CONSTRAINT bookings_distinct_parties CHECK (mentor_user_id <> mentee_user_id)
);
CREATE INDEX ix_bookings_mentee_status ON bookings(mentee_user_id, status);
CREATE INDEX ix_bookings_mentor_time ON bookings(mentor_user_id, slot_start_at);
CREATE INDEX ix_bookings_scheduled ON bookings(slot_start_at) WHERE status = 'scheduled';
CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 6. MEETINGS
-- ============================================================================
CREATE TABLE meetings (
  id                       BIGSERIAL PRIMARY KEY,
  uuid                     UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  booking_id               BIGINT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  agora_channel_name       TEXT NOT NULL UNIQUE,
  mentor_first_joined_at   TIMESTAMPTZ,
  mentee_first_joined_at   TIMESTAMPTZ,
  mentor_present           BOOLEAN NOT NULL DEFAULT FALSE,
  mentee_present           BOOLEAN NOT NULL DEFAULT FALSE,
  billing_state            TEXT NOT NULL DEFAULT 'idle'
    CHECK (billing_state IN ('idle','active','paused','low_balance_grace','finalized')),
  billing_active_since     TIMESTAMPTZ,
  billed_paise             INTEGER NOT NULL DEFAULT 0,
  billed_seconds           INTEGER NOT NULL DEFAULT 0,
  ended_at                 TIMESTAMPTZ,
  end_reason               TEXT
    CHECK (end_reason IS NULL OR end_reason IN (
      'mentor_ended','mentee_ended','slot_expired','balance_depleted','admin_forced','no_show'
    )),
  finalized_at             TIMESTAMPTZ,
  finalized_total_paise    INTEGER,
  finalized_mentor_paise   INTEGER,
  finalized_platform_paise INTEGER,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_meetings_billing_state ON meetings(billing_state)
  WHERE billing_state IN ('active','low_balance_grace');
CREATE TRIGGER trg_meetings_updated_at BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE meeting_events (
  id          BIGSERIAL PRIMARY KEY,
  meeting_id  BIGINT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind        TEXT NOT NULL CHECK (kind IN (
    'mentor_join','mentor_leave','mentee_join','mentee_leave',
    'billing_start','billing_pause','billing_resume',
    'low_balance_warning','grace_start','grace_end',
    'topup_during_call','session_end','finalize'
  )),
  payload     JSONB
);
CREATE INDEX ix_meeting_events_meeting ON meeting_events(meeting_id, occurred_at);

-- ============================================================================
-- 7. WALLETS & MONEY MOVEMENTS
-- ============================================================================
CREATE TABLE wallets (
  id            BIGSERIAL PRIMARY KEY,
  uuid          UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind          TEXT NOT NULL CHECK (kind IN ('mentee','mentor','platform')),
  balance_paise INTEGER NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, kind)
);
CREATE INDEX ix_wallets_user_kind ON wallets(user_id, kind);
CREATE TRIGGER trg_wallets_updated_at BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE wallet_transactions (
  id                  BIGSERIAL PRIMARY KEY,
  uuid                UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  wallet_id           BIGINT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  direction           TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  amount_paise        INTEGER NOT NULL CHECK (amount_paise > 0),
  balance_after_paise INTEGER NOT NULL CHECK (balance_after_paise >= 0),
  reason              TEXT NOT NULL CHECK (reason IN (
    'topup','session_charge','session_payout','platform_fee',
    'late_cancel_penalty','late_cancel_compensation',
    'refund','withdrawal','withdrawal_reversal','admin_adjustment'
  )),
  reference_table     TEXT,
  reference_id        BIGINT,
  idempotency_key     TEXT UNIQUE,
  description         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_wt_wallet_created ON wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX ix_wt_ref ON wallet_transactions(reference_table, reference_id);

-- Maintains wallets.balance_paise transactionally. Locks the wallet row first.
CREATE OR REPLACE FUNCTION apply_wallet_transaction() RETURNS TRIGGER AS $$
DECLARE
  current_balance INTEGER;
BEGIN
  SELECT balance_paise INTO current_balance
    FROM wallets WHERE id = NEW.wallet_id FOR UPDATE;

  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet % not found', NEW.wallet_id;
  END IF;

  IF NEW.direction = 'credit' THEN
    UPDATE wallets SET balance_paise = balance_paise + NEW.amount_paise
      WHERE id = NEW.wallet_id;
  ELSE
    IF current_balance < NEW.amount_paise THEN
      RAISE EXCEPTION 'Insufficient balance: wallet %, need %, have %',
        NEW.wallet_id, NEW.amount_paise, current_balance;
    END IF;
    UPDATE wallets SET balance_paise = balance_paise - NEW.amount_paise
      WHERE id = NEW.wallet_id;
  END IF;

  SELECT balance_paise INTO NEW.balance_after_paise
    FROM wallets WHERE id = NEW.wallet_id;

  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wt_apply BEFORE INSERT ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION apply_wallet_transaction();

-- ============================================================================
-- 8. PAYMENTS
-- ============================================================================
CREATE TABLE payments (
  id                          BIGSERIAL PRIMARY KEY,
  uuid                        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_id                     BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_paise                INTEGER NOT NULL CHECK (amount_paise > 0),
  gateway                     TEXT NOT NULL DEFAULT 'phonepe',
  gateway_order_id            TEXT NOT NULL UNIQUE,
  gateway_txn_id              TEXT UNIQUE,
  status                      TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','pending','succeeded','failed','refunded')),
  failure_reason              TEXT,
  raw_request                 JSONB,
  raw_response                JSONB,
  webhook_payload             JSONB,
  initiated_during_meeting_id BIGINT REFERENCES meetings(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  succeeded_at                TIMESTAMPTZ
);
CREATE INDEX ix_payments_user ON payments(user_id, created_at DESC);
CREATE INDEX ix_payments_status ON payments(status) WHERE status IN ('created','pending');
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 9. MENTOR PAYOUTS (KYC + bank withdrawals)
-- ============================================================================
CREATE TABLE mentor_kyc (
  id                   BIGSERIAL PRIMARY KEY,
  mentor_user_id       BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  pan_number           TEXT NOT NULL,
  full_name_as_per_pan TEXT NOT NULL,
  bank_account_number  TEXT NOT NULL,
  bank_ifsc            TEXT NOT NULL,
  bank_account_holder  TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  reviewer_user_id     BIGINT REFERENCES users(id),
  reviewer_notes       TEXT,
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at          TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_mentor_kyc_updated_at BEFORE UPDATE ON mentor_kyc
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE withdrawals (
  id             BIGSERIAL PRIMARY KEY,
  uuid           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  mentor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_paise   INTEGER NOT NULL CHECK (amount_paise >= 50000),
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','succeeded','failed','reversed')),
  gateway_txn_id TEXT UNIQUE,
  failure_reason TEXT,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at   TIMESTAMPTZ
);
CREATE INDEX ix_withdrawals_mentor ON withdrawals(mentor_user_id, requested_at DESC);

-- ============================================================================
-- 10. REVIEWS
-- ============================================================================
CREATE TABLE reviews (
  id                BIGSERIAL PRIMARY KEY,
  uuid              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  booking_id        BIGINT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  reviewer_user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewee_user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  direction         TEXT NOT NULL CHECK (direction IN ('mentee_to_mentor','mentor_to_mentee')),
  rating            INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body              TEXT,
  is_anonymous      BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden         BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_by_user_id BIGINT REFERENCES users(id),
  hidden_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, direction)
);
CREATE INDEX ix_reviews_reviewee_public ON reviews(reviewee_user_id)
  WHERE direction = 'mentee_to_mentor' AND is_hidden = FALSE;
CREATE TRIGGER trg_reviews_updated_at BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Maintain mentor_profiles.rating_avg / rating_count from reviews where
-- direction='mentee_to_mentor' AND is_hidden=false.
CREATE OR REPLACE FUNCTION recompute_mentor_rating(p_mentor_user_id BIGINT)
RETURNS VOID AS $$
DECLARE
  v_avg NUMERIC(3,2);
  v_count INTEGER;
BEGIN
  SELECT COALESCE(ROUND(AVG(rating)::NUMERIC, 2), 0),
         COALESCE(COUNT(*), 0)
    INTO v_avg, v_count
    FROM reviews
    WHERE reviewee_user_id = p_mentor_user_id
      AND direction = 'mentee_to_mentor'
      AND is_hidden = FALSE;

  UPDATE mentor_profiles
    SET rating_avg = v_avg,
        rating_count = v_count
    WHERE user_id = p_mentor_user_id;
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_reviews_rating_fn() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    IF OLD.direction = 'mentee_to_mentor' THEN
      PERFORM recompute_mentor_rating(OLD.reviewee_user_id);
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.direction = 'mentee_to_mentor' THEN
      PERFORM recompute_mentor_rating(NEW.reviewee_user_id);
    END IF;
    -- If the reviewee changed (rare), recompute the old one too.
    IF (TG_OP = 'UPDATE' AND OLD.reviewee_user_id IS DISTINCT FROM NEW.reviewee_user_id
        AND OLD.direction = 'mentee_to_mentor') THEN
      PERFORM recompute_mentor_rating(OLD.reviewee_user_id);
    END IF;
    RETURN NEW;
  END IF;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reviews_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION trg_reviews_rating_fn();

-- ============================================================================
-- 11. SESSION NOTES
-- ============================================================================
CREATE TABLE session_notes (
  id                 BIGSERIAL PRIMARY KEY,
  uuid               UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  booking_id         BIGINT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  author_user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  discussion_summary TEXT,
  key_takeaways      TEXT,
  action_items       TEXT,
  additional_notes   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_session_notes_author ON session_notes(author_user_id, created_at DESC);
CREATE TRIGGER trg_session_notes_updated_at BEFORE UPDATE ON session_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 12. NOTIFICATIONS
-- ============================================================================
CREATE TABLE notifications (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  link_url        TEXT,
  reference_table TEXT,
  reference_id    BIGINT,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_notifications_user_unread ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- ============================================================================
-- 13. ADMIN AUDIT LOG
-- ============================================================================
CREATE TABLE admin_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  admin_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action        TEXT NOT NULL,
  target_table  TEXT NOT NULL,
  target_id     BIGINT NOT NULL,
  before_state  JSONB,
  after_state   JSONB,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_audit_admin ON admin_audit_log(admin_user_id, created_at DESC);
CREATE INDEX ix_audit_target ON admin_audit_log(target_table, target_id);
