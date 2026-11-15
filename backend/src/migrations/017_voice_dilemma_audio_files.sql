-- Voice Dilemmas Audio Persistence Table
-- Stores audio binaries permanently in PostgreSQL (Neon) so files survive Render's ephemeral container rebuilds.

CREATE TABLE IF NOT EXISTS voice_dilemma_audio_files (
  filename   TEXT PRIMARY KEY,
  mime_type  TEXT NOT NULL DEFAULT 'audio/webm',
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_voice_dilemma_audio_files_created
  ON voice_dilemma_audio_files(created_at DESC);
