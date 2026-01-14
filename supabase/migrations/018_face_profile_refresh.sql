-- Face Profile Smart Refresh System
-- SRS §3.3.2: Passive learning, confidence-based prompts, age-based schedules

-- ============================================
-- USER FACE EMBEDDINGS (supplementary embeddings from event scans)
-- ============================================

CREATE TABLE IF NOT EXISTS user_face_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('attendee', 'photographer')),
    rekognition_face_id VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL CHECK (source IN ('initial_scan', 'event_scan', 'manual_update', 'refresh')),
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    confidence DECIMAL(5,2),
    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Each rekognition face should only be stored once per user
    UNIQUE(user_id, rekognition_face_id)
);

CREATE INDEX idx_user_face_embeddings_user ON user_face_embeddings(user_id);
CREATE INDEX idx_user_face_embeddings_primary ON user_face_embeddings(user_id) WHERE is_primary = TRUE;
CREATE INDEX idx_user_face_embeddings_active ON user_face_embeddings(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_user_face_embeddings_source ON user_face_embeddings(source);

-- ============================================
-- MATCH CONFIDENCE LOG (for 90-day rolling average)
-- ============================================

CREATE TABLE IF NOT EXISTS match_confidence_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    media_id UUID REFERENCES media(id) ON DELETE SET NULL,
    confidence DECIMAL(5,2) NOT NULL,
    matched_embedding_id UUID REFERENCES user_face_embeddings(id) ON DELETE SET NULL,
    matched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_match_confidence_user ON match_confidence_log(user_id);
CREATE INDEX idx_match_confidence_date ON match_confidence_log(matched_at);
CREATE INDEX idx_match_confidence_user_date ON match_confidence_log(user_id, matched_at DESC);

-- ============================================
-- REFRESH PROMPTS (track prompts shown to users)
-- ============================================

CREATE TYPE refresh_prompt_type AS ENUM ('confidence_low', 'age_based', 'time_based', 'appearance_change');
CREATE TYPE refresh_prompt_status AS ENUM ('pending', 'shown', 'dismissed', 'completed');

CREATE TABLE IF NOT EXISTS refresh_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    prompt_type refresh_prompt_type NOT NULL,
    prompt_status refresh_prompt_status DEFAULT 'pending',
    trigger_confidence DECIMAL(5,2),
    trigger_reason TEXT,
    shown_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    response VARCHAR(50), -- 'update_photo', 'these_are_me', 'not_me', 'dismissed'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_prompts_user ON refresh_prompts(user_id);
CREATE INDEX idx_refresh_prompts_status ON refresh_prompts(prompt_status);
CREATE INDEX idx_refresh_prompts_pending ON refresh_prompts(user_id) WHERE prompt_status = 'pending';

-- ============================================
-- APPEARANCE CHANGES (user-declared changes)
-- ============================================

CREATE TYPE appearance_change_type AS ENUM (
    'new_hairstyle', 
    'facial_hair', 
    'new_glasses', 
    'weight_change',
    'aging',
    'temporary_costume',
    'other'
);

CREATE TYPE appearance_change_mode AS ENUM ('add_to_profile', 'replace_profile', 'temporary');

CREATE TABLE IF NOT EXISTS appearance_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    change_type appearance_change_type NOT NULL,
    change_mode appearance_change_mode NOT NULL,
    description TEXT,
    new_embedding_ids UUID[] DEFAULT '{}',
    old_embedding_ids UUID[] DEFAULT '{}',
    is_temporary BOOLEAN DEFAULT FALSE,
    temporary_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appearance_changes_user ON appearance_changes(user_id);
CREATE INDEX idx_appearance_changes_temporary ON appearance_changes(user_id) 
    WHERE is_temporary = TRUE AND temporary_until > NOW();

-- ============================================
-- ADD AGE-BASED REFRESH TRACKING TO ATTENDEES
-- ============================================

-- date_of_birth already exists in initial schema
-- Add fields for refresh tracking
ALTER TABLE attendees 
ADD COLUMN IF NOT EXISTS next_refresh_due TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS refresh_prompt_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_refresh_prompt TIMESTAMPTZ;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Calculate 90-day rolling average confidence for a user
CREATE OR REPLACE FUNCTION get_user_confidence_average(p_user_id UUID)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    v_avg DECIMAL(5,2);
BEGIN
    SELECT AVG(confidence) INTO v_avg
    FROM match_confidence_log
    WHERE user_id = p_user_id
    AND matched_at >= NOW() - INTERVAL '90 days';
    
    RETURN COALESCE(v_avg, 100.00);
END;
$$ LANGUAGE plpgsql;

-- Check if user needs refresh based on confidence
CREATE OR REPLACE FUNCTION check_confidence_refresh_needed(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_avg DECIMAL(5,2);
BEGIN
    v_avg := get_user_confidence_average(p_user_id);
    RETURN v_avg < 75.00;
END;
$$ LANGUAGE plpgsql;

-- Get refresh schedule based on age
CREATE OR REPLACE FUNCTION get_refresh_interval_months(p_date_of_birth DATE)
RETURNS INTEGER AS $$
DECLARE
    v_age INTEGER;
BEGIN
    IF p_date_of_birth IS NULL THEN
        RETURN 18; -- Default for unknown age
    END IF;
    
    v_age := EXTRACT(YEAR FROM AGE(p_date_of_birth));
    
    RETURN CASE
        WHEN v_age < 13 THEN 6   -- Under 13: every 6 months (required)
        WHEN v_age < 18 THEN 9   -- 13-17: every 9 months (strong prompt)
        WHEN v_age < 25 THEN 12  -- 18-24: every 12 months (soft prompt)
        WHEN v_age < 50 THEN 18  -- 25-49: every 18 months (soft prompt)
        ELSE 24                   -- 50+: every 24 months (soft prompt)
    END;
END;
$$ LANGUAGE plpgsql;

-- Get refresh prompt strength based on age
CREATE OR REPLACE FUNCTION get_refresh_prompt_strength(p_date_of_birth DATE)
RETURNS VARCHAR(20) AS $$
DECLARE
    v_age INTEGER;
BEGIN
    IF p_date_of_birth IS NULL THEN
        RETURN 'soft';
    END IF;
    
    v_age := EXTRACT(YEAR FROM AGE(p_date_of_birth));
    
    RETURN CASE
        WHEN v_age < 13 THEN 'required'  -- Must update before matching
        WHEN v_age < 18 THEN 'strong'    -- Prominent prompt
        ELSE 'soft'                       -- Gentle reminder
    END;
END;
$$ LANGUAGE plpgsql;

-- Check if time-based refresh is needed
CREATE OR REPLACE FUNCTION check_time_refresh_needed(
    p_user_id UUID,
    p_date_of_birth DATE,
    p_last_refresh TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
DECLARE
    v_interval_months INTEGER;
    v_due_date TIMESTAMPTZ;
BEGIN
    IF p_last_refresh IS NULL THEN
        RETURN TRUE;
    END IF;
    
    v_interval_months := get_refresh_interval_months(p_date_of_birth);
    v_due_date := p_last_refresh + (v_interval_months || ' months')::INTERVAL;
    
    RETURN NOW() >= v_due_date;
END;
$$ LANGUAGE plpgsql;

-- Get comprehensive refresh status for a user
CREATE OR REPLACE FUNCTION get_refresh_status(p_user_id UUID)
RETURNS TABLE(
    needs_refresh BOOLEAN,
    reason VARCHAR(50),
    prompt_strength VARCHAR(20),
    confidence_avg DECIMAL(5,2),
    days_since_refresh INTEGER,
    next_due_date TIMESTAMPTZ
) AS $$
DECLARE
    v_attendee RECORD;
    v_confidence DECIMAL(5,2);
    v_interval_months INTEGER;
BEGIN
    -- Get attendee info
    SELECT a.*, get_user_confidence_average(a.id) as conf_avg
    INTO v_attendee
    FROM attendees a
    WHERE a.id = p_user_id;
    
    IF NOT FOUND THEN
        -- Check if photographer
        SELECT p.id, NULL::DATE as date_of_birth, NULL::TIMESTAMPTZ as last_face_refresh,
               get_user_confidence_average(p.id) as conf_avg
        INTO v_attendee
        FROM photographers p
        WHERE p.id = p_user_id;
    END IF;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    v_confidence := v_attendee.conf_avg;
    v_interval_months := get_refresh_interval_months(v_attendee.date_of_birth);
    
    -- Check confidence-based refresh
    IF v_confidence < 75 THEN
        RETURN QUERY SELECT 
            TRUE,
            'confidence_low'::VARCHAR(50),
            'strong'::VARCHAR(20),
            v_confidence,
            EXTRACT(DAY FROM NOW() - COALESCE(v_attendee.last_face_refresh, v_attendee.created_at))::INTEGER,
            NOW()::TIMESTAMPTZ;
        RETURN;
    END IF;
    
    -- Check time-based refresh
    IF check_time_refresh_needed(p_user_id, v_attendee.date_of_birth, v_attendee.last_face_refresh) THEN
        RETURN QUERY SELECT 
            TRUE,
            'time_based'::VARCHAR(50),
            get_refresh_prompt_strength(v_attendee.date_of_birth),
            v_confidence,
            EXTRACT(DAY FROM NOW() - COALESCE(v_attendee.last_face_refresh, v_attendee.created_at))::INTEGER,
            (COALESCE(v_attendee.last_face_refresh, v_attendee.created_at) + (v_interval_months || ' months')::INTERVAL)::TIMESTAMPTZ;
        RETURN;
    END IF;
    
    -- No refresh needed
    RETURN QUERY SELECT 
        FALSE,
        NULL::VARCHAR(50),
        'none'::VARCHAR(20),
        v_confidence,
        EXTRACT(DAY FROM NOW() - COALESCE(v_attendee.last_face_refresh, v_attendee.created_at))::INTEGER,
        (COALESCE(v_attendee.last_face_refresh, v_attendee.created_at) + (v_interval_months || ' months')::INTERVAL)::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql;

-- Log a confidence match and optionally store supplementary embedding
CREATE OR REPLACE FUNCTION log_match_and_embedding(
    p_user_id UUID,
    p_event_id UUID,
    p_media_id UUID,
    p_confidence DECIMAL(5,2),
    p_rekognition_face_id VARCHAR(255),
    p_user_type VARCHAR(20)
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
    v_embedding_id UUID;
BEGIN
    -- Log the match confidence
    INSERT INTO match_confidence_log (user_id, event_id, media_id, confidence)
    VALUES (p_user_id, p_event_id, p_media_id, p_confidence)
    RETURNING id INTO v_log_id;
    
    -- Store supplementary embedding if confidence is good
    IF p_confidence >= 90 AND p_rekognition_face_id IS NOT NULL THEN
        INSERT INTO user_face_embeddings (
            user_id, user_type, rekognition_face_id, source, event_id, confidence
        )
        VALUES (
            p_user_id, p_user_type, p_rekognition_face_id, 'event_scan', p_event_id, p_confidence
        )
        ON CONFLICT (user_id, rekognition_face_id) DO UPDATE
        SET confidence = GREATEST(user_face_embeddings.confidence, EXCLUDED.confidence)
        RETURNING id INTO v_embedding_id;
        
        -- Update the log with embedding reference
        UPDATE match_confidence_log 
        SET matched_embedding_id = v_embedding_id
        WHERE id = v_log_id;
    END IF;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE user_face_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_confidence_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE appearance_changes ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own embeddings" ON user_face_embeddings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own embeddings" ON user_face_embeddings
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own confidence logs" ON match_confidence_log
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own refresh prompts" ON refresh_prompts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own refresh prompts" ON refresh_prompts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own appearance changes" ON appearance_changes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own appearance changes" ON appearance_changes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- TRIGGER: Create refresh prompt when needed
-- ============================================

CREATE OR REPLACE FUNCTION check_and_create_refresh_prompt()
RETURNS TRIGGER AS $$
DECLARE
    v_avg_confidence DECIMAL(5,2);
    v_existing_prompt UUID;
BEGIN
    -- Calculate new rolling average
    v_avg_confidence := get_user_confidence_average(NEW.user_id);
    
    -- Check if confidence dropped below threshold
    IF v_avg_confidence < 75 THEN
        -- Check if there's already a pending prompt
        SELECT id INTO v_existing_prompt
        FROM refresh_prompts
        WHERE user_id = NEW.user_id
        AND prompt_status IN ('pending', 'shown')
        AND prompt_type = 'confidence_low'
        LIMIT 1;
        
        IF v_existing_prompt IS NULL THEN
            -- Create new prompt
            INSERT INTO refresh_prompts (user_id, prompt_type, trigger_confidence, trigger_reason)
            VALUES (NEW.user_id, 'confidence_low', v_avg_confidence, 
                    'Rolling 90-day average dropped below 75%');
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_refresh_prompt
    AFTER INSERT ON match_confidence_log
    FOR EACH ROW
    EXECUTE FUNCTION check_and_create_refresh_prompt();

-- ============================================
-- MIGRATE EXISTING DATA
-- ============================================

-- Migrate existing attendee face profiles to new table
INSERT INTO user_face_embeddings (user_id, user_type, rekognition_face_id, source, is_primary, confidence, created_at)
SELECT 
    afp.attendee_id,
    'attendee',
    afp.rekognition_face_id,
    afp.source::VARCHAR(50),
    afp.is_primary,
    afp.confidence,
    afp.created_at
FROM attendee_face_profiles afp
ON CONFLICT (user_id, rekognition_face_id) DO NOTHING;
