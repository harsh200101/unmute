-- Migration: Add mentor_languages table for centralized language management
-- This replaces the array-based languages column in mentors table

-- ==========================================
-- LANGUAGES MASTER TABLE - Global language reference
-- ==========================================
CREATE TABLE languages (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL, -- ISO language codes (en, es, fr, etc.)
    name VARCHAR(100) NOT NULL, -- Full language name (English, Spanish, etc.)
    native_name VARCHAR(100), -- Native language name
    flag_emoji VARCHAR(10), -- Flag emoji for UI display
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert common languages
INSERT INTO languages (code, name, native_name, flag_emoji, sort_order) VALUES
('en', 'English', 'English', '🇺🇸', 1),
('es', 'Spanish', 'Español', '🇪🇸', 2),
('fr', 'French', 'Français', '🇫🇷', 3),
('de', 'German', 'Deutsch', '🇩🇪', 4),
('zh', 'Chinese', '中文', '🇨🇳', 5),
('ja', 'Japanese', '日本語', '🇯🇵', 6),
('ko', 'Korean', '한국어', '🇰🇷', 7),
('pt', 'Portuguese', 'Português', '🇵🇹', 8),
('hi', 'Hindi', 'हिन्दी', '🇮🇳', 9),
('ar', 'Arabic', 'العربية', '🇸🇦', 10),
('ru', 'Russian', 'Русский', '🇷🇺', 11),
('it', 'Italian', 'Italiano', '🇮🇹', 12),
('nl', 'Dutch', 'Nederlands', '🇳🇱', 13),
('sv', 'Swedish', 'Svenska', '🇸🇪', 14),
('da', 'Danish', 'Dansk', '🇩🇰', 15),
('no', 'Norwegian', 'Norsk', '🇳🇴', 16),
('fi', 'Finnish', 'Suomi', '🇫🇮', 17),
('pl', 'Polish', 'Polski', '🇵🇱', 18),
('tr', 'Turkish', 'Türkçe', '🇹🇷', 19),
('he', 'Hebrew', 'עברית', '🇮🇱', 20);

-- ==========================================
-- MENTOR_LANGUAGES - Many-to-many relationship
-- ==========================================
CREATE TABLE mentor_languages (
    id SERIAL PRIMARY KEY,
    mentor_id INTEGER REFERENCES mentors(id) ON DELETE CASCADE NOT NULL,
    language_id INTEGER REFERENCES languages(id) ON DELETE CASCADE NOT NULL,
    proficiency_level INTEGER DEFAULT 5 CHECK (proficiency_level >= 1 AND proficiency_level <= 5),
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(mentor_id, language_id)
);

-- Indexes for performance
CREATE INDEX idx_languages_code ON languages(code);
CREATE INDEX idx_languages_active ON languages(is_active);
CREATE INDEX idx_mentor_languages_mentor ON mentor_languages(mentor_id);
CREATE INDEX idx_mentor_languages_language ON mentor_languages(language_id);
CREATE INDEX idx_mentor_languages_primary ON mentor_languages(is_primary) WHERE is_primary = true;

-- ==========================================
-- MIGRATE EXISTING DATA
-- ==========================================

-- Migrate existing languages from mentors table to mentor_languages table
INSERT INTO mentor_languages (mentor_id, language_id, proficiency_level, is_primary)
SELECT
    m.id as mentor_id,
    l.id as language_id,
    5 as proficiency_level, -- Default proficiency
    CASE WHEN unnest_index = 1 THEN true ELSE false END as is_primary
FROM mentors m
CROSS JOIN LATERAL unnest(COALESCE(m.languages, ARRAY['en'])) WITH ORDINALITY AS lang(code, unnest_index)
JOIN languages l ON l.code = lang.code
WHERE m.languages IS NOT NULL AND array_length(m.languages, 1) > 0;

-- ==========================================
-- UPDATE EXISTING ENDPOINTS
-- ==========================================

-- Update the languages endpoint to use the new table structure
-- This will be handled in the routes file update