-- Drop existing tables in correct order (run only if recreating)
-- DROP TABLE IF EXISTS notifications, payments, reviews, session_participants, sessions, 
--                    mentor_categories, mentor_availability, mentors, categories, users CASCADE;

-- Enable UUID extension for better distributed IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- ==========================================
-- USERS TABLE - Core user management
-- ==========================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
    role VARCHAR(20) DEFAULT 'mentee' CHECK (role IN ('mentor', 'mentee', 'admin', 'super_admin')),
    avatar_url VARCHAR(500),
    bio TEXT,
    location JSONB, -- {country, city, timezone, coordinates}
    social_links JSONB DEFAULT '{}', -- {linkedin, twitter, website, etc}
    preferences JSONB DEFAULT '{}', -- User preferences
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    email_verified_at TIMESTAMP,
    phone_verified_at TIMESTAMP,
    last_login_at TIMESTAMP,
    login_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT valid_phone CHECK (phone IS NULL OR LENGTH(phone) >= 10)
);

-- User indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active_verified ON users(is_active, is_verified);
CREATE INDEX idx_users_location_gin ON users USING GIN(location);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_uuid ON users(uuid);

-- ==========================================
-- CATEGORIES TABLE - Mentoring categories
-- ==========================================
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    slug VARCHAR(100) UNIQUE NOT NULL,
    icon_url VARCHAR(500),
    color_hex VARCHAR(7) DEFAULT '#3B82F6',
    parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_color_hex CHECK (color_hex ~* '^#[0-9A-Fa-f]{6}$')
);

CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_categories_active ON categories(is_active);
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_sort ON categories(sort_order);

-- ==========================================
-- MENTORS TABLE - Enhanced mentor profiles
-- ==========================================
CREATE TABLE mentors (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    
    -- Professional Info
    specializations TEXT[] DEFAULT '{}',
    industries TEXT[] DEFAULT '{}',
    skills TEXT[] DEFAULT '{}',
    languages TEXT[] DEFAULT ARRAY['en'],
    
    -- Pricing & Experience
    hourly_rate DECIMAL(10,2) NOT NULL CHECK (hourly_rate >= 0),
    currency VARCHAR(3) DEFAULT 'USD',
    years_experience INTEGER CHECK (years_experience >= 0),
    
    -- Profile Media
    profile_image VARCHAR(500),
    video_intro_url VARCHAR(500),
    portfolio_urls TEXT[] DEFAULT '{}',
    
    -- Status & Verification
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending_review')),
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected', 'under_review')),
    
    -- Statistics (denormalized for performance)
    total_sessions INTEGER DEFAULT 0 CHECK (total_sessions >= 0),
    completed_sessions INTEGER DEFAULT 0 CHECK (completed_sessions >= 0),
    average_rating DECIMAL(3,2) DEFAULT 0 CHECK (average_rating >= 0 AND average_rating <= 5),
    total_reviews INTEGER DEFAULT 0 CHECK (total_reviews >= 0),
    total_earnings DECIMAL(12,2) DEFAULT 0 CHECK (total_earnings >= 0),
    
    -- Availability & Settings
    timezone VARCHAR(50) DEFAULT 'UTC',
    instant_booking BOOLEAN DEFAULT false,
    auto_accept_bookings BOOLEAN DEFAULT false,
    advance_booking_days INTEGER DEFAULT 30 CHECK (advance_booking_days > 0),
    min_session_duration INTEGER DEFAULT 30 CHECK (min_session_duration > 0),
    max_session_duration INTEGER DEFAULT 120 CHECK (max_session_duration >= min_session_duration),
    session_buffer_minutes INTEGER DEFAULT 15 CHECK (session_buffer_minutes >= 0),
    
    -- Quality Metrics
    response_rate DECIMAL(5,2) DEFAULT 100.00 CHECK (response_rate >= 0 AND response_rate <= 100),
    response_time_hours INTEGER DEFAULT 24 CHECK (response_time_hours > 0),
    cancellation_rate DECIMAL(5,2) DEFAULT 0.00 CHECK (cancellation_rate >= 0 AND cancellation_rate <= 100),
    
    -- Badges & Recognition
    badge_level VARCHAR(20) DEFAULT 'bronze' CHECK (badge_level IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')),
    is_featured BOOLEAN DEFAULT false,
    is_top_mentor BOOLEAN DEFAULT false,
    
    -- Training & Compliance
    completed_training BOOLEAN DEFAULT false,
    background_check_status VARCHAR(20) DEFAULT 'pending' CHECK (background_check_status IN ('pending', 'passed', 'failed', 'not_required')),
    
    -- Activity Tracking
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    profile_completion_percentage INTEGER DEFAULT 0 CHECK (profile_completion_percentage >= 0 AND profile_completion_percentage <= 100),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP,
    
    -- Additional constraints
    CONSTRAINT mentor_valid_rating_reviews CHECK (
        (total_reviews = 0 AND average_rating = 0) OR 
        (total_reviews > 0 AND average_rating > 0)
    )
);

-- Mentor indexes for optimal performance
CREATE INDEX idx_mentors_user_id ON mentors(user_id);
CREATE INDEX idx_mentors_status_verification ON mentors(status, verification_status);
CREATE INDEX idx_mentors_languages_gin ON mentors USING GIN(languages);
CREATE INDEX idx_mentors_specializations_gin ON mentors USING GIN(specializations);
CREATE INDEX idx_mentors_skills_gin ON mentors USING GIN(skills);
CREATE INDEX idx_mentors_industries_gin ON mentors USING GIN(industries);
CREATE INDEX idx_mentors_rating ON mentors(average_rating DESC);
CREATE INDEX idx_mentors_hourly_rate ON mentors(hourly_rate);
CREATE INDEX idx_mentors_featured_top ON mentors(is_featured, is_top_mentor);
CREATE INDEX idx_mentors_active_available ON mentors(status, verification_status) WHERE status = 'active' AND verification_status = 'verified';
CREATE INDEX idx_mentors_last_active ON mentors(last_active DESC);

-- ==========================================
-- MENTOR_CATEGORIES - Many-to-many relationship
-- ==========================================
CREATE TABLE mentor_categories (
    id SERIAL PRIMARY KEY,
    mentor_id INTEGER REFERENCES mentors(id) ON DELETE CASCADE NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(mentor_id, category_id)
);

CREATE INDEX idx_mentor_categories_mentor ON mentor_categories(mentor_id);
CREATE INDEX idx_mentor_categories_category ON mentor_categories(category_id);
CREATE INDEX idx_mentor_categories_primary ON mentor_categories(is_primary) WHERE is_primary = true;

-- ==========================================
-- MENTOR_AVAILABILITY - Flexible scheduling
-- ==========================================
CREATE TABLE mentor_availability (
    id SERIAL PRIMARY KEY,
    mentor_id INTEGER REFERENCES mentors(id) ON DELETE CASCADE NOT NULL,
    
    -- Recurring availability
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
    start_time TIME,
    end_time TIME,
    
    -- Specific date overrides
    specific_date DATE,
    is_available BOOLEAN DEFAULT true,
    
    -- Slot configuration
    slot_duration_minutes INTEGER DEFAULT 60 CHECK (slot_duration_minutes > 0),
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_time_range CHECK (
        (day_of_week IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time) OR
        (specific_date IS NOT NULL)
    )
);

CREATE INDEX idx_mentor_availability_mentor ON mentor_availability(mentor_id);
CREATE INDEX idx_mentor_availability_day ON mentor_availability(day_of_week);
CREATE INDEX idx_mentor_availability_date ON mentor_availability(specific_date);

-- ==========================================
-- SESSIONS - Core booking system
-- ==========================================
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    
    -- Participants
    mentor_id INTEGER REFERENCES mentors(id) ON DELETE CASCADE NOT NULL,
    mentee_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    
    -- Session Details
    title VARCHAR(200) NOT NULL,
    description TEXT,
    session_type VARCHAR(20) DEFAULT 'video' CHECK (session_type IN ('video', 'voice', 'chat', 'in_person')),
    
    -- Scheduling
    scheduled_at TIMESTAMP NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    timezone VARCHAR(50) NOT NULL,
    
    -- Pricing
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    currency VARCHAR(3) DEFAULT 'USD',
    platform_fee DECIMAL(10,2) DEFAULT 0 CHECK (platform_fee >= 0),
    mentor_earnings DECIMAL(10,2) NOT NULL CHECK (mentor_earnings >= 0),
    
    -- Status Management
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN (
        'pending', 'scheduled', 'confirmed', 'in_progress', 'completed', 
        'cancelled_by_mentee', 'cancelled_by_mentor', 'no_show_mentee', 
        'no_show_mentor', 'disputed', 'refunded'
    )),
    
    -- Meeting Details
    meeting_platform VARCHAR(50) DEFAULT 'agora' CHECK (meeting_platform = 'agora'),
    meeting_id VARCHAR(100),
    meeting_url VARCHAR(500),
    meeting_password VARCHAR(50),
    
    -- Session Outcomes
    actual_start_time TIMESTAMP,
    actual_end_time TIMESTAMP,
    actual_duration_minutes INTEGER CHECK (actual_duration_minutes >= 0),
    
    -- Notes & Feedback
    mentor_notes TEXT,
    mentee_notes TEXT,
    admin_notes TEXT,
    
    -- Reminders & Notifications
    reminder_sent_24h BOOLEAN DEFAULT false,
    reminder_sent_1h BOOLEAN DEFAULT false,
    follow_up_sent BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT session_valid_earnings CHECK (mentor_earnings = price),
    CONSTRAINT session_valid_times CHECK (
        actual_end_time IS NULL OR 
        actual_start_time IS NULL OR 
        actual_end_time >= actual_start_time
    )
);

-- Session indexes for performance
CREATE INDEX idx_sessions_mentor ON sessions(mentor_id);
CREATE INDEX idx_sessions_mentee ON sessions(mentee_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_scheduled_at ON sessions(scheduled_at);
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX idx_sessions_uuid ON sessions(uuid);
CREATE INDEX idx_sessions_upcoming ON sessions(scheduled_at) WHERE status IN ('scheduled', 'confirmed');
CREATE INDEX idx_sessions_completed ON sessions(scheduled_at) WHERE status = 'completed';

-- ==========================================
-- REVIEWS - Rating and feedback system
-- ==========================================
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE NOT NULL UNIQUE,
    mentor_id INTEGER REFERENCES mentors(id) ON DELETE CASCADE NOT NULL,
    mentee_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    
    -- Ratings (1-5 scale)
    overall_rating INTEGER NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
    communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
    knowledge_rating INTEGER CHECK (knowledge_rating >= 1 AND knowledge_rating <= 5),
    helpfulness_rating INTEGER CHECK (helpfulness_rating >= 1 AND helpfulness_rating <= 5),
    
    -- Feedback
    comment TEXT,
    private_feedback TEXT, -- Only visible to mentor and admin
    
    -- Moderation
    is_verified BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    is_hidden BOOLEAN DEFAULT false,
    moderation_notes TEXT,
    
    -- Helpful votes from other users
    helpful_votes INTEGER DEFAULT 0 CHECK (helpful_votes >= 0),
    
    -- Response from mentor
    mentor_response TEXT,
    mentor_response_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reviews_mentor ON reviews(mentor_id);
CREATE INDEX idx_reviews_mentee ON reviews(mentee_id);
CREATE INDEX idx_reviews_session ON reviews(session_id);
CREATE INDEX idx_reviews_rating ON reviews(overall_rating DESC);
CREATE INDEX idx_reviews_featured ON reviews(is_featured) WHERE is_featured = true;
CREATE INDEX idx_reviews_visible ON reviews(is_hidden, is_verified) WHERE is_hidden = false;

-- ==========================================
-- PAYMENTS - Comprehensive payment tracking
-- ==========================================
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
    
    -- Amount Details
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'USD',
    platform_fee DECIMAL(10,2) DEFAULT 0 CHECK (platform_fee >= 0),
    processing_fee DECIMAL(10,2) DEFAULT 0 CHECK (processing_fee >= 0),
    mentor_earnings DECIMAL(10,2) NOT NULL CHECK (mentor_earnings >= 0),
    
    -- Payment Status
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN (
        'pending', 'processing', 'completed', 'failed', 'cancelled', 
        'refunded', 'partially_refunded', 'disputed', 'chargeback'
    )),
    
    -- Payment Method & Gateway
    payment_method VARCHAR(50) CHECK (payment_method IN ('credit_card', 'debit_card', 'paypal', 'stripe', 'apple_pay', 'google_pay', 'bank_transfer')),
    payment_gateway VARCHAR(50) DEFAULT 'stripe',
    
    -- External Payment IDs
    stripe_payment_intent_id VARCHAR(100),
    stripe_charge_id VARCHAR(100),
    paypal_transaction_id VARCHAR(100),
    transaction_id VARCHAR(100),
    
    -- Refund Information
    refund_amount DECIMAL(10,2) DEFAULT 0 CHECK (refund_amount >= 0),
    refund_reason TEXT,
    refunded_at TIMESTAMP,
    
    -- Payout to Mentor
    payout_status VARCHAR(20) DEFAULT 'pending' CHECK (payout_status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    payout_id VARCHAR(100),
    payout_date TIMESTAMP,
    
    -- Metadata
    failure_reason TEXT,
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_session ON payments(session_id);
CREATE INDEX idx_payments_status ON payments(payment_status);
CREATE INDEX idx_payments_payout_status ON payments(payout_status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX idx_payments_uuid ON payments(uuid);

-- ==========================================
-- NOTIFICATIONS - User notification system
-- ==========================================
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    
    -- Notification Content
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'booking_request', 'booking_confirmed', 'booking_cancelled', 'session_reminder',
        'session_started', 'session_completed', 'session_rescheduled', 'review_received',
        'payment_received', 'payout_processed', 'profile_verified', 'system_announcement', 'promotional'
    )),
    
    -- Related Entities
    related_entity_type VARCHAR(50), -- 'session', 'review', 'payment', etc.
    related_entity_id INTEGER,
    
    -- Delivery Status
    is_read BOOLEAN DEFAULT false,
    is_sent BOOLEAN DEFAULT false,
    delivery_method VARCHAR(20) DEFAULT 'in_app' CHECK (delivery_method IN ('in_app', 'email', 'sms', 'push')),
    
    -- Scheduling
    scheduled_for TIMESTAMP,
    sent_at TIMESTAMP,
    read_at TIMESTAMP,
    
    -- Metadata
    action_url VARCHAR(500),
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_scheduled ON notifications(scheduled_for) WHERE scheduled_for IS NOT NULL;

-- ==========================================
-- ADDITIONAL OPTIMIZATION TABLES
-- ==========================================

-- Chat/Messaging (for pre-session communication)
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'system')),
    
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_recipient ON messages(recipient_id);
CREATE INDEX idx_messages_unread ON messages(recipient_id, is_read) WHERE is_read = false;

-- Mentor Expertise Tags (for better search/matching)
CREATE TABLE expertise_tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50),
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mentor_expertise (
    mentor_id INTEGER REFERENCES mentors(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES expertise_tags(id) ON DELETE CASCADE,
    proficiency_level INTEGER CHECK (proficiency_level >= 1 AND proficiency_level <= 5),
    PRIMARY KEY (mentor_id, tag_id)
);

-- Saved/Favorite Mentors
CREATE TABLE user_favorites (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    mentor_id INTEGER REFERENCES mentors(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, mentor_id)
);

-- ==========================================
-- VIEWS for Common Queries
-- ==========================================

-- Active mentors with full profile info
CREATE VIEW active_mentors AS
SELECT 
    m.*,
    u.first_name,
    u.last_name,
    u.email,
    u.avatar_url,
    u.location,
    u.is_verified as user_verified,
    ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as categories
FROM mentors m
JOIN users u ON m.user_id = u.id
LEFT JOIN mentor_categories mc ON m.id = mc.mentor_id
LEFT JOIN categories c ON mc.category_id = c.id
WHERE m.status = 'active' 
    AND m.verification_status = 'verified'
    AND u.is_active = true
    AND u.is_verified = true
GROUP BY m.id, u.id;

-- Session statistics view
CREATE VIEW session_stats AS
SELECT 
    mentor_id,
    COUNT(*) as total_sessions,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
    COUNT(CASE WHEN status LIKE 'cancelled%' THEN 1 END) as cancelled_sessions,
    ROUND(AVG(CASE WHEN status = 'completed' THEN duration_minutes END), 2) as avg_session_duration,
    SUM(CASE WHEN status = 'completed' THEN mentor_earnings ELSE 0 END) as total_earnings
FROM sessions
GROUP BY mentor_id;

-- ==========================================
-- TRIGGERS for Data Consistency
-- ==========================================

-- Update mentor statistics when reviews change
CREATE OR REPLACE FUNCTION update_mentor_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE mentors SET
        average_rating = (
            SELECT COALESCE(AVG(overall_rating), 0)
            FROM reviews 
            WHERE mentor_id = COALESCE(NEW.mentor_id, OLD.mentor_id)
        ),
        total_reviews = (
            SELECT COUNT(*)
            FROM reviews 
            WHERE mentor_id = COALESCE(NEW.mentor_id, OLD.mentor_id)
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = COALESCE(NEW.mentor_id, OLD.mentor_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_mentor_stats
    AFTER INSERT OR UPDATE OR DELETE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_mentor_stats();

-- Update session counts when sessions change
CREATE OR REPLACE FUNCTION update_session_counts()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE mentors SET
        total_sessions = (
            SELECT COUNT(*) 
            FROM sessions 
            WHERE mentor_id = COALESCE(NEW.mentor_id, OLD.mentor_id)
        ),
        completed_sessions = (
            SELECT COUNT(*) 
            FROM sessions 
            WHERE mentor_id = COALESCE(NEW.mentor_id, OLD.mentor_id) 
            AND status = 'completed'
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = COALESCE(NEW.mentor_id, OLD.mentor_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_session_counts
    AFTER INSERT OR UPDATE OR DELETE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_session_counts();

-- Auto-update updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_mentors_updated_at BEFORE UPDATE ON mentors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- SAMPLE DATA INSERTION
-- ==========================================

-- Insert initial categories
INSERT INTO categories (name, description, slug, color_hex) VALUES
('Spiritual Guidance', 'Spiritual awakening, meditation, and inner peace', 'spiritual-guidance', '#8B5CF6'),
('Life Coaching', 'Personal development and life direction guidance', 'life-coaching', '#10B981'),
('Mental Health Support', 'Anxiety, depression, and emotional wellness', 'mental-health-support', '#EC4899'),
('Relationship Counseling', 'Love, marriage, and interpersonal relationships', 'relationship-counseling', '#F59E0B'),
('Career Transition', 'Finding purpose and meaningful work', 'career-transition', '#3B82F6'),
('Grief & Loss', 'Coping with loss and bereavement', 'grief-loss', '#EF4444'),
('Stress Management', 'Techniques for managing daily stress and overwhelm', 'stress-management', '#06B6D4'),
('Self-Discovery', 'Finding your true self and life purpose', 'self-discovery', '#84CC16'),
('Parenting Support', 'Guidance for parents and family dynamics', 'parenting-support', '#059669');

-- Insert sample expertise tags
INSERT INTO expertise_tags (name, category) VALUES
('Meditation', 'Spirituality'),
('CBT', 'Psychology'),
('Life Coaching', 'Personal Development'),
('Spiritual Counseling', 'Spirituality'),
('Emotional Intelligence', 'Psychology'),
('Grief Counseling', 'Mental Health'),
('Relationship Counseling', 'Relationships'),
('Stress Management', 'Wellness'),
('Mindfulness', 'Spirituality'),
('Career Guidance', 'Personal Development');


CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,  -- To track if token was used
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups and cleanup
CREATE INDEX idx_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- Email verification tokens table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,  -- To track if token was used
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups and cleanup
CREATE INDEX idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);
