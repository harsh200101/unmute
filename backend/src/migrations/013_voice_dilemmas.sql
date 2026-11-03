-- Async Voice Dilemmas (?99 Audio Mentorship)
-- Mentees can submit a voice recording dilemma with notes, and mentors answer with audio + written takeaway.

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_reason_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_reason_check CHECK (reason IN (
  'topup','session_charge','session_payout','platform_fee',
  'late_cancel_penalty','late_cancel_compensation',
  'refund','withdrawal','withdrawal_reversal','admin_adjustment',
  'voice_dilemma_fee','voice_dilemma_payout','voice_dilemma_refund'
));

CREATE TABLE IF NOT EXISTS voice_dilemmas (
  id                            BIGSERIAL PRIMARY KEY,
  uuid                          UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  mentee_user_id                BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_user_id                BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                         TEXT NOT NULL,
  category                      TEXT NOT NULL,
  mentee_audio_url              TEXT NOT NULL,
  mentee_audio_duration_seconds INTEGER DEFAULT 0,
  mentee_text_notes             TEXT,
  is_anonymous                  BOOLEAN NOT NULL DEFAULT false,
  fee_paise                     INTEGER NOT NULL DEFAULT 9900 CHECK (fee_paise >= 0),
  status                        TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'answered', 'refunded', 'expired')),
  mentor_audio_url              TEXT,
  mentor_audio_duration_seconds INTEGER,
  mentor_written_takeaway       TEXT,
  answered_at                   TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_voice_dilemmas_mentee ON voice_dilemmas(mentee_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_voice_dilemmas_mentor ON voice_dilemmas(mentor_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_voice_dilemmas_uuid ON voice_dilemmas(uuid);

DROP TRIGGER IF EXISTS trg_voice_dilemmas_updated_at ON voice_dilemmas;
CREATE TRIGGER trg_voice_dilemmas_updated_at BEFORE UPDATE ON voice_dilemmas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
