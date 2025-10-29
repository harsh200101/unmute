-- Create session notes table for mentor notes and mentee history
CREATE TABLE session_notes (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
    mentor_id INTEGER REFERENCES mentors(id) ON DELETE CASCADE NOT NULL,
    mentee_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,

    -- Note content
    discussion_summary TEXT,
    key_takeaways TEXT,
    additional_notes TEXT,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    UNIQUE(session_id, mentor_id) -- One note per session per mentor
);

-- Indexes for performance
CREATE INDEX idx_session_notes_session ON session_notes(session_id);
CREATE INDEX idx_session_notes_mentor ON session_notes(mentor_id);
CREATE INDEX idx_session_notes_mentee ON session_notes(mentee_id);
CREATE INDEX idx_session_notes_created_at ON session_notes(created_at DESC);

-- Add trigger for updated_at
CREATE TRIGGER trigger_session_notes_updated_at
    BEFORE UPDATE ON session_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();