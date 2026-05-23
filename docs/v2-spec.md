# unmute v2 — Product Spec & Technical Design

> **Status:** Draft for review. No code yet. Once you sign this off, we scaffold `backend-v2/` and `frontend-v2/` alongside the current code, build there against a new `unmute_v2` Postgres database, validate end-to-end, then cut over and delete the old code + old DB.

---

## 1. Product summary in one paragraph

unmute is a 1-on-1 paid mentoring marketplace. Mentors publish a weekly recurring schedule of 60-minute slots. Mentees browse mentors, book a free slot (no money moves), and at slot time both parties join an Agora video call. Charging is **per-minute, only while both are present in the call**. The slot is a hard 60-minute window. Money flows out of the mentee's prepaid wallet (topped up via PhonePe) and into the mentor's internal wallet, from which mentors withdraw to bank weekly after completing KYC.

---

## 2. Decisions (locked from waves 1–6)

| Area | Decision |
|---|---|
| **Booking model** | Scheduled only. Mentor publishes a recurring weekly template + per-week overrides. Slot = fixed 60 min unit. Booking is free, no money moves. Mentee sees mentor's free slots; once booked, slot disappears from other mentees' view. |
| **Join window** | Join button enabled 5 min before slot start. Hard-ends at slot end. No-show declared if neither party joined within 15 min of slot start. |
| **Existing data** | Fresh start. Old DB dropped at cutover. |
| **Stack** | React + Express + Postgres + Agora. JavaScript (no TypeScript yet). Frontend on Vite (not CRA). PhonePe only (no Stripe). Single bcrypt. |
| **Features in v2** | Reviews, reschedule, Google login, admin panel — all redesigned cleaner. |
| **Payment instrument** | Prepaid wallet only. Top-up via PhonePe. |
| **Pricing** | 4 admin-configurable tiers (default ₹5 / ₹10 / ₹20 / ₹40 per minute). Mentor picks one. |
| **Minimum charge** | 5 minutes once both have been present at all. |
| **Platform fee** | 30% of every per-minute charge (mentor takes 70%). |
| **Wallet-runs-out** | Server tracks burn rate. 5-min warning over Agora RTM → hits ₹0 → 60s grace with optional in-call top-up → if no top-up, call ends. Hard-cutoff fallback if PhonePe inline isn't ready. |
| **Mentor payout** | 70% auto-credited to internal mentor wallet at call finalize. Weekly batched bank payout via PhonePe Payouts after KYC (PAN + bank). Min withdrawal ₹500. |
| **Refunds** | Admin-only, refunded to mentee wallet (not bank). |
| **GST** | 18% included in displayed price. Platform remits. |
| **Presence** | "Present" = connected to Agora channel. Disconnect = billing pauses immediately, no grace. Reconnect = billing resumes immediately. |
| **Timer model** | Wall-clock counts from slot_start to slot_end regardless of joins. Billed-minutes accumulates only when both connected. Hard end at slot_end. |
| **No-show** | Nobody charged. Reliability score increments on the no-show side. |
| **Cancel ≥ 4h** | Free, either party. |
| **Cancel < 4h** | ₹50 penalty paid to the other party. If wallet is empty, debt is tracked and netted against next top-up or next session bill. |
| **Reschedule** | Either party can propose ≥ 4h before original slot. Other party accepts/declines. Once accepted, booking moves to new slot atomically. |
| **End early** | Either party can end the call at any time. Bills actual billed-minutes (subject to 5-min minimum if both joined). |
| **Auth** | Email+password + Google login. Email verification required before booking or publishing slots. |
| **Mentor verification** | Manual admin approval. Mentor submits profile, admin approves/rejects. |
| **Discovery** | Simple list with name/keyword search + 2-3 filters (pricing tier, language, online-now). Sort: rating, recently active. |
| **Reviews** | Mentee → mentor: 1-5 stars + optional text, **public** on profile. Mentor → mentee: 1-5 reliability score, **private** (admin + that mentor only). |
| **Notifications** | Email (booking, reschedule, cancel) + in-app feed. No SMS in MVP. |

---

## 3. Database schema (v2)

Postgres 15+. Single migration `001_init.sql` creates everything. A real `schema_migrations` table tracks applied migrations.

### 3.1 Conventions

- All money in **paise** (`INTEGER`), not rupees, to avoid float drift. `1000 paise = ₹10.00`. Frontend formats for display.
- All timestamps `TIMESTAMPTZ` in UTC. Frontend converts to viewer's timezone.
- All tables have `id BIGSERIAL PRIMARY KEY`, `uuid UUID DEFAULT gen_random_uuid()`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ` (via trigger).
- Soft-deletes only where audit matters (`deleted_at TIMESTAMPTZ` nullable). Hard-deletes for ephemeral things (tokens, notifications).
- Indexes named `ix_<table>_<cols>`. Constraints named `<table>_<rule>_check` / `_unique`.

### 3.2 DDL — annotated

```sql
-- ============================================================================
-- 0. Schema migrations tracker (single source of truth for "is this DB up to date?")
-- ============================================================================
CREATE TABLE schema_migrations (
  version      TEXT PRIMARY KEY,
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum     TEXT NOT NULL
);

-- ============================================================================
-- 1. USERS & AUTH
-- ============================================================================
CREATE TABLE users (
  id                   BIGSERIAL PRIMARY KEY,
  uuid                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  email                CITEXT NOT NULL UNIQUE,          -- citext = case-insensitive
  password_hash        TEXT,                            -- nullable for Google-only users
  google_sub           TEXT UNIQUE,                     -- Google OAuth subject id
  full_name            TEXT NOT NULL,
  avatar_url           TEXT,
  bio                  TEXT,                            -- short profile tagline; both mentees and mentors
  phone                TEXT,                            -- optional, no OTP in MVP
  phone_verified_at    TIMESTAMPTZ,                     -- future-proof for SMS later
  date_of_birth        DATE,                            -- optional; displayed on profile for mentor's context
  gender               TEXT CHECK (gender IS NULL OR gender IN ('male','female','non_binary','prefer_not_to_say')),
  marital_status       TEXT CHECK (marital_status IS NULL OR marital_status IN ('single','married','divorced','widowed','prefer_not_to_say')),
  location_city        TEXT,
  location_country     TEXT NOT NULL DEFAULT 'IN',
  preferred_language   TEXT NOT NULL DEFAULT 'en',      -- ISO code; used for filter & future i18n
  preferences          JSONB NOT NULL DEFAULT '{}',     -- notification settings, UI theme, digest cadence
  role                 TEXT NOT NULL CHECK (role IN ('mentee','mentor','admin')),
  email_verified_at    TIMESTAMPTZ,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  no_show_count        INTEGER NOT NULL DEFAULT 0,      -- reliability tracking
  late_cancel_count    INTEGER NOT NULL DEFAULT 0,
  pending_penalty_paise INTEGER NOT NULL DEFAULT 0,     -- late-cancel debt to be netted
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_users_role ON users(role);
CREATE INDEX ix_users_email_verified ON users(email) WHERE email_verified_at IS NOT NULL;

-- One row per active session (signed JWT replaces this for now; table is for revocation later)
CREATE TABLE refresh_tokens (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE email_verification_tokens (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_reset_tokens (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_pwd_reset_user ON password_reset_tokens(user_id);

-- ============================================================================
-- 2. PRICING TIERS (admin-managed)
-- ============================================================================
CREATE TABLE pricing_tiers (
  id                   BIGSERIAL PRIMARY KEY,
  uuid                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  name                 TEXT NOT NULL UNIQUE,           -- 'starter' | 'standard' | 'expert' | 'premium'
  display_name         TEXT NOT NULL,                  -- 'Starter', shown in UI
  per_minute_paise     INTEGER NOT NULL CHECK (per_minute_paise > 0),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Seed: insert ('starter',500), ('standard',1000), ('expert',2000), ('premium',4000)

-- ============================================================================
-- 2b. TAGS (replaces 4-table category mess from current schema)
-- ============================================================================
-- One normalized tag list, admin-curated. Both mentees and mentors filter by these.
-- kind='expertise' for skills ("Career Coaching", "Resume Review")
-- kind='industry'  for domains ("Fintech", "EdTech", "Healthcare")
CREATE TABLE tags (
  id           BIGSERIAL PRIMARY KEY,
  uuid         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  slug         TEXT NOT NULL UNIQUE,                   -- 'career-coaching', 'fintech'
  display_name TEXT NOT NULL,                          -- 'Career Coaching', 'Fintech'
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
  id                   BIGSERIAL PRIMARY KEY,
  uuid                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_id              BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  pricing_tier_id      BIGINT NOT NULL REFERENCES pricing_tiers(id),
  headline             TEXT NOT NULL,                  -- 'Senior Product Manager @ Stripe'
  bio                  TEXT NOT NULL,                  -- long-form, distinct from users.bio tagline
  languages            TEXT[] NOT NULL DEFAULT '{en}', -- ISO codes; languages the mentor SPEAKS
  years_experience     INTEGER NOT NULL DEFAULT 0 CHECK (years_experience >= 0),
  linkedin_url         TEXT,
  video_intro_url      TEXT,                           -- optional 30-60s mentor pitch video
  timezone             TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  verification_status  TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','approved','rejected')),
  verification_notes   TEXT,                            -- admin-only
  verified_at          TIMESTAMPTZ,
  verified_by_user_id  BIGINT REFERENCES users(id),
  rating_avg           NUMERIC(3,2) NOT NULL DEFAULT 0  -- maintained by trigger, excludes hidden
    CHECK (rating_avg >= 0 AND rating_avg <= 5),
  rating_count         INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_mentor_status ON mentor_profiles(verification_status);
CREATE INDEX ix_mentor_tier ON mentor_profiles(pricing_tier_id);

-- ============================================================================
-- 4. AVAILABILITY (weekly template + per-date overrides)
-- ============================================================================
-- One row per recurring weekly slot, e.g. ('Mon', 18:00 IST). One slot = one bookable unit.
CREATE TABLE availability_template (
  id                   BIGSERIAL PRIMARY KEY,
  mentor_user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week          INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sunday
  start_time_local     TIME NOT NULL,                  -- mentor's local TZ
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mentor_user_id, day_of_week, start_time_local)
);
CREATE INDEX ix_avail_tmpl_mentor ON availability_template(mentor_user_id) WHERE is_active;

-- Per-date overrides: block a normally-available slot, or open a one-off slot
CREATE TABLE availability_override (
  id                   BIGSERIAL PRIMARY KEY,
  mentor_user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_at              TIMESTAMPTZ NOT NULL,           -- absolute UTC time of the slot
  action               TEXT NOT NULL CHECK (action IN ('block','add')),
  reason               TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mentor_user_id, slot_at, action)
);
CREATE INDEX ix_avail_override_mentor_time ON availability_override(mentor_user_id, slot_at);

-- ============================================================================
-- 5. BOOKINGS (the heart of the app)
-- ============================================================================
-- One booking row per scheduled slot. The UNIQUE constraint is what prevents
-- double-booking — no separate "is this slot taken?" lookup needed.
CREATE TABLE bookings (
  id                          BIGSERIAL PRIMARY KEY,
  uuid                        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  mentor_user_id              BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  mentee_user_id              BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slot_start_at               TIMESTAMPTZ NOT NULL,
  slot_end_at                 TIMESTAMPTZ NOT NULL,
  per_minute_paise_snapshot   INTEGER NOT NULL,          -- snapshot of tier at booking time
  mentee_title                TEXT,                       -- optional 'Career change to PM' shown to mentor
  mentee_topic                TEXT,                       -- optional longer 'what I want to discuss' note
  status                      TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN (
      'scheduled',          -- booked, not started
      'in_call',            -- call active
      'completed',          -- call finished, billing finalized
      'no_show',            -- neither party joined within 15 min
      'cancelled_by_mentee',
      'cancelled_by_mentor',
      'cancelled_admin'
    )),
  cancelled_at                TIMESTAMPTZ,
  cancel_reason               TEXT,

  -- Reschedule proposal (embedded; no separate table)
  reschedule_to_at            TIMESTAMPTZ,
  reschedule_proposed_by_user_id BIGINT REFERENCES users(id),
  reschedule_proposed_at      TIMESTAMPTZ,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT bookings_no_double_book UNIQUE (mentor_user_id, slot_start_at),
  CONSTRAINT bookings_duration_check CHECK (slot_end_at = slot_start_at + INTERVAL '60 minutes'),
  CONSTRAINT bookings_distinct_parties CHECK (mentor_user_id <> mentee_user_id)
);
CREATE INDEX ix_bookings_mentee_status ON bookings(mentee_user_id, status);
CREATE INDEX ix_bookings_mentor_time ON bookings(mentor_user_id, slot_start_at);
CREATE INDEX ix_bookings_scheduled ON bookings(slot_start_at) WHERE status = 'scheduled';

-- ============================================================================
-- 6. MEETINGS (one row per booking that actually became a call)
-- ============================================================================
-- Separating meeting state from booking keeps booking row clean and lets us
-- replay billing audits. One booking → at most one meeting.
CREATE TABLE meetings (
  id                          BIGSERIAL PRIMARY KEY,
  uuid                        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  booking_id                  BIGINT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  agora_channel_name          TEXT NOT NULL UNIQUE,
  -- Presence + billing state (single source of truth, updated transactionally)
  mentor_first_joined_at      TIMESTAMPTZ,
  mentee_first_joined_at      TIMESTAMPTZ,
  mentor_present              BOOLEAN NOT NULL DEFAULT FALSE,
  mentee_present              BOOLEAN NOT NULL DEFAULT FALSE,
  billing_state               TEXT NOT NULL DEFAULT 'idle'
    CHECK (billing_state IN ('idle','active','paused','low_balance_grace','finalized')),
  billing_active_since        TIMESTAMPTZ,              -- when the current 'active' span began
  billed_paise                INTEGER NOT NULL DEFAULT 0,
  billed_seconds              INTEGER NOT NULL DEFAULT 0,
  ended_at                    TIMESTAMPTZ,
  end_reason                  TEXT
    CHECK (end_reason IS NULL OR end_reason IN (
      'mentor_ended','mentee_ended','slot_expired','balance_depleted','admin_forced','no_show'
    )),
  finalized_at                TIMESTAMPTZ,
  finalized_total_paise       INTEGER,                  -- mentee pays this (after 5-min min)
  finalized_mentor_paise      INTEGER,                  -- mentor receives this (70%)
  finalized_platform_paise    INTEGER,                  -- platform keeps this (30%)
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_meetings_billing_state ON meetings(billing_state)
  WHERE billing_state IN ('active','low_balance_grace');

-- Per-second-accurate audit log of presence/billing transitions. Allows full replay.
CREATE TABLE meeting_events (
  id           BIGSERIAL PRIMARY KEY,
  meeting_id   BIGINT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind         TEXT NOT NULL CHECK (kind IN (
    'mentor_join','mentor_leave','mentee_join','mentee_leave',
    'billing_start','billing_pause','billing_resume',
    'low_balance_warning','grace_start','grace_end',
    'topup_during_call','session_end','finalize'
  )),
  payload      JSONB
);
CREATE INDEX ix_meeting_events_meeting ON meeting_events(meeting_id, occurred_at);

-- ============================================================================
-- 7. WALLETS & MONEY MOVEMENTS
-- ============================================================================
-- Two wallets per user (mentee and mentor sides are tracked separately so they
-- can't be confused). The vast majority of users only ever have the 'mentee'
-- wallet; mentor wallets are created on mentor approval.
CREATE TABLE wallets (
  id              BIGSERIAL PRIMARY KEY,
  uuid            UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind            TEXT NOT NULL CHECK (kind IN ('mentee','mentor','platform')),
  balance_paise   INTEGER NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, kind)
);
CREATE INDEX ix_wallets_user_kind ON wallets(user_id, kind);
-- Seed: insert a single ('platform') wallet owned by a system user

-- Append-only ledger. Every money movement is one row. balance_after_paise
-- proves the wallet evolution and lets us audit. Wallet.balance_paise is
-- maintained by a BEFORE INSERT trigger that locks the wallet row.
CREATE TABLE wallet_transactions (
  id                     BIGSERIAL PRIMARY KEY,
  uuid                   UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  wallet_id              BIGINT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  direction              TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  amount_paise           INTEGER NOT NULL CHECK (amount_paise > 0),
  balance_after_paise    INTEGER NOT NULL CHECK (balance_after_paise >= 0),
  reason                 TEXT NOT NULL CHECK (reason IN (
    'topup','session_charge','session_payout','platform_fee',
    'late_cancel_penalty','late_cancel_compensation',
    'refund','withdrawal','withdrawal_reversal','admin_adjustment'
  )),
  reference_table        TEXT,                      -- 'bookings' | 'meetings' | 'payments' | 'withdrawals'
  reference_id           BIGINT,                    -- soft FK; not enforced
  idempotency_key        TEXT UNIQUE,               -- for webhook retries
  description            TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_wt_wallet_created ON wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX ix_wt_ref ON wallet_transactions(reference_table, reference_id);

-- ============================================================================
-- 8. PAYMENTS (PhonePe top-ups + webhooks)
-- ============================================================================
CREATE TABLE payments (
  id                     BIGSERIAL PRIMARY KEY,
  uuid                   UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_id                BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_paise           INTEGER NOT NULL CHECK (amount_paise > 0),
  gateway                TEXT NOT NULL DEFAULT 'phonepe',
  gateway_order_id       TEXT NOT NULL UNIQUE,      -- our id sent to PhonePe
  gateway_txn_id         TEXT UNIQUE,               -- PhonePe's id, set on webhook
  status                 TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','pending','succeeded','failed','refunded')),
  failure_reason         TEXT,
  raw_request            JSONB,
  raw_response           JSONB,
  webhook_payload        JSONB,
  initiated_during_meeting_id BIGINT REFERENCES meetings(id),  -- for in-call topups
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  succeeded_at           TIMESTAMPTZ
);
CREATE INDEX ix_payments_user ON payments(user_id, created_at DESC);
CREATE INDEX ix_payments_status ON payments(status) WHERE status IN ('created','pending');

-- ============================================================================
-- 9. MENTOR PAYOUTS (KYC + bank withdrawals)
-- ============================================================================
CREATE TABLE mentor_kyc (
  id                  BIGSERIAL PRIMARY KEY,
  mentor_user_id      BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  pan_number          TEXT NOT NULL,                -- store as-is; admin can mask in logs
  full_name_as_per_pan TEXT NOT NULL,
  bank_account_number TEXT NOT NULL,
  bank_ifsc           TEXT NOT NULL,
  bank_account_holder TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  reviewer_user_id    BIGINT REFERENCES users(id),
  reviewer_notes      TEXT,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at         TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE withdrawals (
  id                  BIGSERIAL PRIMARY KEY,
  uuid                UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  mentor_user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_paise        INTEGER NOT NULL CHECK (amount_paise >= 50000), -- ₹500 min
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','succeeded','failed','reversed')),
  gateway_txn_id      TEXT UNIQUE,
  failure_reason      TEXT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at        TIMESTAMPTZ
);
CREATE INDEX ix_withdrawals_mentor ON withdrawals(mentor_user_id, requested_at DESC);

-- ============================================================================
-- 10. REVIEWS
-- ============================================================================
-- Mentee → mentor: public. Mentor → mentee: private (admin + that mentor only).
CREATE TABLE reviews (
  id                   BIGSERIAL PRIMARY KEY,
  uuid                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  booking_id           BIGINT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  reviewer_user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewee_user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  direction            TEXT NOT NULL CHECK (direction IN ('mentee_to_mentor','mentor_to_mentee')),
  rating               INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body                 TEXT,
  is_anonymous         BOOLEAN NOT NULL DEFAULT FALSE,    -- only honored for mentee_to_mentor direction
  is_hidden            BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_by_user_id    BIGINT REFERENCES users(id),
  hidden_reason        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, direction)
);
CREATE INDEX ix_reviews_reviewee_public ON reviews(reviewee_user_id)
  WHERE direction = 'mentee_to_mentor' AND is_hidden = FALSE;

-- ============================================================================
-- 11. SESSION NOTES (mentor's post-call notes; visible to mentor + that mentee)
-- ============================================================================
CREATE TABLE session_notes (
  id                   BIGSERIAL PRIMARY KEY,
  uuid                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  booking_id           BIGINT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  author_user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- always the mentor
  discussion_summary   TEXT,
  key_takeaways        TEXT,
  action_items         TEXT,
  additional_notes     TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_session_notes_author ON session_notes(author_user_id, created_at DESC);

-- ============================================================================
-- 12. NOTIFICATIONS (in-app feed; email is delivered separately, no row here)
-- ============================================================================
CREATE TABLE notifications (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind                 TEXT NOT NULL,                -- 'booking_confirmed', 'reschedule_proposed', ...
  title                TEXT NOT NULL,
  body                 TEXT,
  link_url             TEXT,
  reference_table      TEXT,
  reference_id         BIGINT,
  read_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_notifications_user_unread ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- ============================================================================
-- 13. ADMIN AUDIT LOG (everything an admin does is logged)
-- ============================================================================
CREATE TABLE admin_audit_log (
  id                BIGSERIAL PRIMARY KEY,
  admin_user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action            TEXT NOT NULL,    -- 'approve_mentor', 'force_end_session', 'refund', 'hide_review', ...
  target_table      TEXT NOT NULL,
  target_id         BIGINT NOT NULL,
  before_state      JSONB,
  after_state       JSONB,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_audit_admin ON admin_audit_log(admin_user_id, created_at DESC);
CREATE INDEX ix_audit_target ON admin_audit_log(target_table, target_id);
```

### 3.3 Triggers (the things we got wrong last time)

```sql
-- 1. updated_at maintained on all relevant tables
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$ LANGUAGE plpgsql;
-- apply to: users, mentor_profiles, bookings, meetings, wallets, payments,
--           mentor_kyc, pricing_tiers, reviews

-- 2. Wallet balance maintained by ledger. Locks wallet row.
CREATE OR REPLACE FUNCTION apply_wallet_transaction() RETURNS TRIGGER AS $$
DECLARE
  current_balance INTEGER;
BEGIN
  -- Lock the wallet row (works for both credit and debit)
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

  -- Reload after update to write balance_after_paise correctly
  SELECT balance_paise INTO NEW.balance_after_paise
  FROM wallets WHERE id = NEW.wallet_id;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER wt_apply BEFORE INSERT ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION apply_wallet_transaction();

-- 3. Mentor rating maintained incrementally on review insert/update/delete.
--    Excludes is_hidden rows. Excludes mentor_to_mentee direction.
--    (Pseudocode; full impl in 001_init.sql)
```

---

## 4. Module layout

```
unmute/
├── backend-v2/
│   ├── src/
│   │   ├── server.js                 # express bootstrap
│   │   ├── config/
│   │   │   ├── db.js                 # pg pool, single source
│   │   │   ├── env.js                # validates env at boot
│   │   │   └── logger.js
│   │   ├── middleware/
│   │   │   ├── authJwt.js
│   │   │   ├── requireRole.js
│   │   │   ├── requireEmailVerified.js
│   │   │   ├── rateLimit.js
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── users.routes.js
│   │   │   ├── mentors.routes.js
│   │   │   ├── availability.routes.js
│   │   │   ├── bookings.routes.js
│   │   │   ├── meetings.routes.js
│   │   │   ├── wallet.routes.js
│   │   │   ├── payments.routes.js
│   │   │   ├── reviews.routes.js
│   │   │   ├── admin.routes.js
│   │   │   └── webhooks.routes.js
│   │   ├── controllers/              # thin; HTTP ↔ services
│   │   ├── services/                 # business logic, DB-touching
│   │   │   ├── authService.js
│   │   │   ├── walletService.js
│   │   │   ├── bookingService.js
│   │   │   ├── meetingService.js
│   │   │   ├── billingEngine.js      # the brain
│   │   │   ├── phonepeService.js
│   │   │   ├── notificationService.js
│   │   │   ├── emailService.js
│   │   │   └── adminService.js
│   │   ├── jobs/                     # cron + interval workers
│   │   │   ├── markNoShows.js        # every minute
│   │   │   ├── finalizeStuckMeetings.js  # every minute
│   │   │   ├── weeklyPayouts.js      # Mondays 09:00 IST
│   │   │   └── tokenCleanup.js       # daily
│   │   ├── migrations/
│   │   │   ├── 001_init.sql
│   │   │   └── (future versioned files)
│   │   └── migrator.js               # real tracked migrator
│   ├── tests/                        # jest, supertest, full integration tests
│   └── package.json
│
└── frontend-v2/                       # vite + react 19
    ├── src/
    │   ├── main.jsx
    │   ├── App.jsx
    │   ├── routes.jsx                # router config
    │   ├── api/                      # axios client + endpoint funcs
    │   ├── auth/                     # AuthContext, useAuth
    │   ├── pages/
    │   │   ├── Landing.jsx
    │   │   ├── Login.jsx / Register.jsx
    │   │   ├── MentorList.jsx
    │   │   ├── MentorProfile.jsx
    │   │   ├── Booking.jsx
    │   │   ├── MyBookings.jsx
    │   │   ├── MeetingRoom.jsx       # the call surface
    │   │   ├── Wallet.jsx                 # balance, topup, transactions
    │   │   ├── UserProfile.jsx             # edit name, bio, avatar, location, prefs, dob, gender, marital
    │   │   ├── MenteeDashboard.jsx         # upcoming bookings, balance, quick rebook
    │   │   ├── MentorDashboard.jsx
    │   │   ├── AvailabilityEditor.jsx
    │   │   ├── MentorEarnings.jsx          # earnings + withdrawal history
    │   │   ├── MentorReviews.jsx           # what mentees said about me
    │   │   ├── SessionNotes.jsx            # post-call notes editor (mentor) / read-only (mentee)
    │   │   └── admin/...                   # mentor apps, KYC, force-end, refund, audit
    │   ├── components/
    │   │   ├── ui/                   # buttons, modals, forms
    │   │   ├── call/                 # AgoraRoom, BillingHud, TopupModal
    │   │   └── booking/
    │   ├── hooks/
    │   └── utils/                    # paise formatting, tz conversion
    ├── index.html
    └── package.json
```

---

## 5. Billing engine — the brain

### 5.1 State machine

```
                                ┌─────────┐
                                │  idle   │   meeting row created, neither joined
                                └────┬────┘
                                     │ first_joined
                                     ▼
                                ┌─────────┐
                  ┌─────────────│ active  │◀───────────┐
                  │             └────┬────┘            │
                  │                  │                 │
       both leave │                  │ wallet hits ₹0  │  topup webhook
                  ▼                  ▼                 │
              ┌────────┐       ┌──────────────────┐    │
              │ paused │       │ low_balance_grace│────┘
              └───┬────┘       └──────┬───────────┘
                  │ rejoin            │ 60s elapsed, no topup
                  └────────────────┐  ▼
                                   ▼ ┌────────────┐
                              ┌────────────┐ slot_expired or end button
                              │ finalized  │◀──┐
                              └────────────┘   │
                                               │
                                  any state ───┘
```

### 5.2 The 4 transactional operations

All four take the meeting row's lock first (`SELECT ... FOR UPDATE`) and are idempotent on retry.

**A. `mark_present(meeting_id, role)`** — called when Agora `user-joined` fires for the local user. Updates `mentor_present`/`mentee_present`. If both now true and state was `idle` or `paused`, transitions to `active`, sets `billing_active_since = NOW()`. Inserts `meeting_events` row.

**B. `mark_absent(meeting_id, role)`** — called on Agora `user-left` or RTC disconnect. Sets the role's present flag false. If state was `active`, computes `delta_seconds = NOW() - billing_active_since`, increments `billed_seconds` and `billed_paise = ROUND(delta_seconds × rate / 60)`. Transitions to `paused`. Inserts event.

**C. `tick_low_balance_check(meeting_id)`** — runs every 5 seconds while state is `active`. Computes projected balance: `wallet.balance - (NOW() - billing_active_since) × rate`. If projected balance ≤ 5min × rate, fires `low_balance_warning` over Agora RTM (and inserts event). If ≤ 0, drains the wallet to zero, transitions to `low_balance_grace`, sets a 60-second deadline, broadcasts grace-start over RTM.

**D. `finalize(meeting_id, end_reason)`** — terminal operation. Idempotent. Steps:
1. If state was `active`, run a final `mark_absent`-equivalent to roll the open interval into `billed_seconds/paise`.
2. Apply the 5-min minimum: `total_paise = MAX(billed_paise, 5 × rate)` *if both ever joined*; else `total_paise = 0` (no-show).
3. Compute `mentor_paise = floor(total_paise × 0.70)`, `platform_paise = total_paise - mentor_paise`.
4. Insert three `wallet_transactions` in one DB transaction:
   - debit mentee wallet by `total_paise`,
   - credit mentor wallet by `mentor_paise`,
   - credit platform wallet by `platform_paise`.
   If mentee's wallet has less than `total_paise` (shouldn't happen — we hard-cutoff before this, but defensively), use `MIN(balance, total_paise)` and proportionally reduce the mentor/platform credits.
5. Update meeting: `billing_state='finalized'`, `finalized_*`, `ended_at`, `end_reason`.
6. Update booking: `status='completed'` (or `no_show` if zero).

### 5.3 Where the timers live

- **Wall-clock 60-min hard cap**: a cron worker that runs every 30s queries `meetings WHERE billing_state NOT IN ('finalized','idle') AND booking.slot_end_at <= NOW()` and finalizes each with `end_reason='slot_expired'`.
- **Low-balance ticker**: per-meeting `setInterval(5000)` started when state goes `active`, cleared on terminal transitions. Stored in an in-memory Map keyed by meeting_id. On server restart, the cron above re-establishes any tickers needed.
- **Grace 60s timer**: per-meeting `setTimeout(60000)` started on grace entry. Cleared on topup success. On expiry, calls finalize with `end_reason='balance_depleted'`.

### 5.4 Reconnection idempotency

Because we have no grace period (a 200ms blip flips us through `active → paused → active`), `mark_present` and `mark_absent` are written to be safe on rapid repeats:
- `mark_present` is a no-op if `present` was already true.
- `mark_absent` is a no-op if `present` was already false.
- Both still write to `meeting_events` so the audit log is honest.

---

## 6. API surface (selected — full list in the route files)

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/google
POST   /api/auth/verify-email
POST   /api/auth/resend-verification
POST   /api/auth/refresh
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
POST   /api/auth/change-password           # logged-in user changes own password

GET    /api/me
PATCH  /api/me
POST   /api/me/avatar                      # multipart upload (storage decision in §8)
GET    /api/stats                          # landing page numbers: # mentors, # sessions, etc.

POST   /api/mentors/apply                      # submit mentor profile (incl. selected tag_ids) for verification
GET    /api/mentors                            # list (search + filters: tier, language, tag, gender, online-now)
GET    /api/mentors/featured                   # top-rated carousel for landing page (ORDER BY rating_avg DESC LIMIT 6)
GET    /api/mentors/:uuid

GET    /api/tags?kind=expertise|industry       # public; for mentor profile editor + mentee filter dropdowns
# Admin-only tag management lives under /api/admin/tags

GET    /api/availability/me                    # mentor's own template + overrides
PUT    /api/availability/template
POST   /api/availability/overrides
DELETE /api/availability/overrides/:id
GET    /api/availability/:mentor_uuid/slots?from=...&to=...   # public: computed bookable slots

POST   /api/bookings                           # body: { mentor_uuid, slot_start_at }
GET    /api/bookings/me                        # both mentor + mentee views
POST   /api/bookings/:uuid/cancel
POST   /api/bookings/:uuid/reschedule          # propose; body: { new_slot_start_at }
POST   /api/bookings/:uuid/reschedule/accept
POST   /api/bookings/:uuid/reschedule/decline

GET    /api/meetings/:booking_uuid/credentials # returns Agora token (gated by join window)
POST   /api/meetings/:booking_uuid/events/joined
POST   /api/meetings/:booking_uuid/events/left
POST   /api/meetings/:booking_uuid/end

GET    /api/wallet/me                          # both mentee & mentor wallets if applicable
GET    /api/wallet/me/transactions
POST   /api/payments/topup                     # initiate PhonePe order
POST   /api/webhooks/phonepe                   # PhonePe → server (signed)

POST   /api/mentors/kyc                        # submit KYC
GET    /api/payouts/me                         # mentor's withdrawal history
POST   /api/payouts/request                    # mentor-initiated withdrawal (optional; default is weekly cron)

POST   /api/bookings/:uuid/review              # mentee-to-mentor public OR mentor-to-mentee private
GET    /api/mentors/:uuid/reviews              # public reviews only

GET    /api/bookings/:uuid/notes               # mentor + that mentee can read
PUT    /api/bookings/:uuid/notes               # mentor-only write
GET    /api/me/notes-history                   # mentee: see all past session notes about me

# Admin (role=admin)
GET    /api/admin/users                          # paginated list + search
PATCH  /api/admin/users/:id                      # toggle is_active, force-verify email, etc.
GET    /api/admin/mentor-applications
POST   /api/admin/mentor-applications/:id/approve
POST   /api/admin/mentor-applications/:id/reject
GET    /api/admin/meetings?status=in_call
POST   /api/admin/meetings/:id/force-end
POST   /api/admin/bookings/:id/refund
POST   /api/admin/reviews/:id/hide
GET    /api/admin/kyc?status=pending
POST   /api/admin/kyc/:id/approve
POST   /api/admin/kyc/:id/reject
GET    /api/admin/tags
POST   /api/admin/tags                           # create new tag
PATCH  /api/admin/tags/:id                       # rename / deactivate
GET    /api/admin/audit-log
```

---

## 7. Build phases

Each phase ends in a green CI run + a working demo of that slice.

| # | Phase | Days (est) |
|---|---|---|
| 0 | Repo scaffold: `backend-v2/` + `frontend-v2/`, env, db pool, migrator with tracking table, seed script | 1 |
| 1 | Auth: register/login/email-verify/Google + JWT + middleware + tests | 2 |
| 2 | Mentor profile + admin verification + pricing tiers (read-only at first) | 2 |
| 3 | Availability template + overrides + public "computed slots" endpoint | 2 |
| 4 | Bookings: create/cancel/list + 4h cancel rule + reschedule | 3 |
| 5 | Wallet + PhonePe top-up + webhook + ledger trigger | 3 |
| 6 | Meeting room: Agora token mint, join window enforcement, frontend call UI | 3 |
| 7 | Billing engine: state machine, presence, finalize, 5-min minimum, 30% fee | 4 |
| 8 | Low-balance warning + grace + in-call top-up (with hard-cutoff fallback) | 3 |
| 9 | Reviews (both directions, hidden flag, rating trigger) | 1 |
| 10 | Notifications (email + in-app feed) | 2 |
| 11 | Mentor KYC + weekly payout cron + admin panel for KYC | 2 |
| 12 | Admin panel: applications, force-end, refund, hide review, audit log | 2 |
| 13 | Cutover: switch prod DATABASE_URL & domain, delete old code + old DB | 1 |

**Total: ~31 working days** for a clean, tested rebuild.

---

## 8. Open questions (need your decision before phase starts — none block phase 0)

These are things that came up while writing the spec that I want explicit answers on, but they only block phases 5+ so we have time:

1. **PhonePe inline checkout**: do you already have a PhonePe merchant account in good standing? Their developer docs are gated. If not, I'll prototype against a sandbox first.
2. **Email provider**: SES, Resend, Mailgun, SendGrid? They all work the same code-wise. Resend is the simplest API. Pick one before phase 1.
3. **Hosting**: current backend is on Render (per the frontend `proxy` URL). Stay on Render for v2? It works fine; just want to confirm.
4. **Profile photo storage**: S3 / Cloudflare R2 / hosted somewhere else? Affects the mentor profile upload flow in phase 2.
5. **Agora App ID & certificate**: same Agora project as today, or new one for v2? (Helps with cleaner billing / metrics separation.)

---

## 9. What I'm explicitly NOT building in v2

To stop scope creep, here's the "no" list. Each was either never built in the current app, or sits in the current schema as dead code with no API references. Each can be added later with a small migration:

- Group calls (more than 1 mentee per meeting). _(not in current app)_
- Recording calls. _(not in current app)_
- Messaging / DMs between users. _(current app has a `messages` table but zero API code reads/writes it — dead feature)_
- Mobile apps (web is responsive; mobile native is a v3 decision).
- Multi-currency / international payments.
- Push notifications (web push / FCM).
- Hierarchical mentor categories (current schema has unused parent/child support in `categories.parent_id` — v2 uses a flat tag list instead). _(simpler, supports the same UX)_
- "Featured" mentors / paid promotions.
- Referral programs / coupons.
- Subscriptions / "10 calls for ₹X" packages.

---

## 10. Next step

Read sections 2–5 carefully. Push back on anything that's wrong or missing. Once you sign off, I open a PR that:
- Adds `backend-v2/` and `frontend-v2/` directories.
- Adds `backend-v2/src/migrations/001_init.sql` with the full DDL.
- Adds a tracked `migrator.js`.
- Adds a seed script.
- Adds a `docker-compose.yml` (optional) that runs `unmute_v2` on port 5433 alongside your existing dev Postgres.

That PR is **phase 0**. We merge that, then start phase 1.
