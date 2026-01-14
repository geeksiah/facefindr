-- Username-based FaceTag System
-- Users choose a 4-8 letter username, system appends a unique number

-- ============================================
-- Add username fields
-- ============================================

-- Add username to attendees
ALTER TABLE attendees 
ADD COLUMN IF NOT EXISTS username VARCHAR(8);

-- Add username to photographers  
ALTER TABLE photographers
ADD COLUMN IF NOT EXISTS username VARCHAR(8);

-- ============================================
-- Username Registry (for tracking used numbers)
-- ============================================
CREATE TABLE IF NOT EXISTS username_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(8) NOT NULL,
    sequence_number INTEGER NOT NULL DEFAULT 1,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_type VARCHAR(20) NOT NULL, -- 'attendee' or 'photographer'
    face_tag VARCHAR(20) NOT NULL UNIQUE, -- The full FaceTag e.g., @john1234
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Each username + sequence_number combination must be unique
    UNIQUE(username, sequence_number)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_username_registry_username ON username_registry(username);
CREATE INDEX IF NOT EXISTS idx_username_registry_user ON username_registry(user_id);
CREATE INDEX IF NOT EXISTS idx_username_registry_facetag ON username_registry(face_tag);

-- ============================================
-- Function to get a random unique number for a username
-- ============================================
CREATE OR REPLACE FUNCTION get_random_username_number(p_username VARCHAR(8))
RETURNS INTEGER AS $$
DECLARE
    v_random_num INTEGER;
    v_attempts INTEGER := 0;
    v_max_attempts INTEGER := 100;
BEGIN
    -- Generate a random 4-digit number (1000-9999) that's not already taken
    LOOP
        v_random_num := 1000 + FLOOR(RANDOM() * 9000)::INTEGER;
        
        -- Check if this number is already used for this username
        IF NOT EXISTS (
            SELECT 1 FROM username_registry 
            WHERE LOWER(username) = LOWER(p_username) 
            AND sequence_number = v_random_num
        ) THEN
            RETURN v_random_num;
        END IF;
        
        v_attempts := v_attempts + 1;
        
        -- If we've tried too many times, expand to 5 digits
        IF v_attempts >= v_max_attempts THEN
            v_random_num := 10000 + FLOOR(RANDOM() * 90000)::INTEGER;
            IF NOT EXISTS (
                SELECT 1 FROM username_registry 
                WHERE LOWER(username) = LOWER(p_username) 
                AND sequence_number = v_random_num
            ) THEN
                RETURN v_random_num;
            END IF;
        END IF;
        
        -- Safety valve - extremely unlikely to hit this
        IF v_attempts >= v_max_attempts * 2 THEN
            RAISE EXCEPTION 'Unable to generate unique number for username %', p_username;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function to generate FaceTag from username
-- ============================================
CREATE OR REPLACE FUNCTION generate_facetag_from_username(
    p_username VARCHAR(8),
    p_user_id UUID,
    p_user_type VARCHAR(20)
)
RETURNS VARCHAR(20) AS $$
DECLARE
    v_random_num INTEGER;
    v_face_tag VARCHAR(20);
    v_clean_username VARCHAR(8);
BEGIN
    -- Clean and validate username (lowercase, alphanumeric only)
    v_clean_username := LOWER(REGEXP_REPLACE(p_username, '[^a-zA-Z0-9]', '', 'g'));
    
    -- Validate length
    IF LENGTH(v_clean_username) < 4 OR LENGTH(v_clean_username) > 8 THEN
        RAISE EXCEPTION 'Username must be 4-8 characters';
    END IF;
    
    -- Get a random unique number for this username
    v_random_num := get_random_username_number(v_clean_username);
    
    -- Generate FaceTag (format: @username + random 4-digit number)
    v_face_tag := '@' || v_clean_username || v_random_num::TEXT;
    
    -- Insert into registry
    INSERT INTO username_registry (username, sequence_number, user_id, user_type, face_tag)
    VALUES (v_clean_username, v_random_num, p_user_id, p_user_type, v_face_tag);
    
    RETURN v_face_tag;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function to preview FaceTag (without creating)
-- Note: Shows a sample random number, actual will be different
-- ============================================
CREATE OR REPLACE FUNCTION preview_facetag(p_username VARCHAR(8))
RETURNS TABLE(
    username VARCHAR(8),
    sample_number INTEGER,
    preview_tag VARCHAR(20),
    is_first_user BOOLEAN
) AS $$
DECLARE
    v_clean_username VARCHAR(8);
    v_sample_num INTEGER;
    v_existing_count INTEGER;
BEGIN
    -- Clean username
    v_clean_username := LOWER(REGEXP_REPLACE(p_username, '[^a-zA-Z0-9]', '', 'g'));
    
    -- Generate a sample random number (1000-9999)
    v_sample_num := 1000 + FLOOR(RANDOM() * 9000)::INTEGER;
    
    -- Check how many users have this username
    SELECT COUNT(*) INTO v_existing_count
    FROM username_registry
    WHERE LOWER(username_registry.username) = v_clean_username;
    
    -- Return preview
    RETURN QUERY SELECT 
        v_clean_username,
        v_sample_num,
        ('@' || v_clean_username || v_sample_num::TEXT)::VARCHAR(20),
        (v_existing_count = 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function to check if username is valid
-- ============================================
CREATE OR REPLACE FUNCTION validate_username(p_username VARCHAR(8))
RETURNS TABLE(
    is_valid BOOLEAN,
    cleaned_username VARCHAR(8),
    error_message TEXT
) AS $$
DECLARE
    v_clean VARCHAR(8);
BEGIN
    v_clean := LOWER(REGEXP_REPLACE(p_username, '[^a-zA-Z0-9]', '', 'g'));
    
    IF LENGTH(v_clean) < 4 THEN
        RETURN QUERY SELECT FALSE, v_clean, 'Username must be at least 4 characters'::TEXT;
    ELSIF LENGTH(v_clean) > 8 THEN
        RETURN QUERY SELECT FALSE, v_clean, 'Username must be at most 8 characters'::TEXT;
    ELSIF v_clean ~ '^[0-9]' THEN
        RETURN QUERY SELECT FALSE, v_clean, 'Username cannot start with a number'::TEXT;
    ELSE
        RETURN QUERY SELECT TRUE, v_clean, NULL::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE username_registry ENABLE ROW LEVEL SECURITY;

-- Users can read their own registry entry
DROP POLICY IF EXISTS "Users can read own username" ON username_registry;
CREATE POLICY "Users can read own username" ON username_registry
    FOR SELECT USING (auth.uid() = user_id);

-- Public can check if a facetag exists (for validation)
DROP POLICY IF EXISTS "Anyone can check facetag existence" ON username_registry;
CREATE POLICY "Anyone can check facetag existence" ON username_registry
    FOR SELECT USING (TRUE);

-- ============================================
-- Update existing triggers to use new system
-- ============================================

-- Update photographer FaceTag generation trigger
CREATE OR REPLACE FUNCTION generate_photographer_face_tag()
RETURNS TRIGGER AS $$
DECLARE
    v_username TEXT;
    v_random_num INTEGER;
    v_face_tag TEXT;
    v_attempts INTEGER := 0;
BEGIN
    -- Only generate if face_tag is null
    IF NEW.face_tag IS NULL THEN
        -- Check if username was provided in user metadata
        -- Note: photographers.id = auth.uid()
        SELECT raw_user_meta_data->>'username' INTO v_username
        FROM auth.users WHERE id = NEW.id;
        
        IF v_username IS NOT NULL AND LENGTH(v_username) >= 4 THEN
            -- Use the new username-based system
            v_username := LOWER(REGEXP_REPLACE(v_username, '[^a-z0-9]', '', 'g'));
            v_username := LEFT(v_username, 8);
        ELSE
            -- Fallback: generate from display_name
            v_username := COALESCE(
                LOWER(REGEXP_REPLACE(NEW.display_name, '[^a-zA-Z0-9]', '', 'g')),
                SPLIT_PART(NEW.email, '@', 1)
            );
            v_username := LEFT(v_username, 8);
            IF LENGTH(v_username) < 4 THEN
                v_username := v_username || 'user';
            END IF;
        END IF;
        
        -- Generate a random unique number
        LOOP
            v_random_num := 1000 + FLOOR(RANDOM() * 9000)::INTEGER;
            v_face_tag := '@' || v_username || v_random_num::TEXT;
            
            -- Check if this FaceTag is unique
            IF NOT EXISTS (SELECT 1 FROM username_registry WHERE face_tag = v_face_tag) THEN
                EXIT;
            END IF;
            
            v_attempts := v_attempts + 1;
            IF v_attempts >= 100 THEN
                -- Expand to 5 digits if too many collisions
                v_random_num := 10000 + FLOOR(RANDOM() * 90000)::INTEGER;
                v_face_tag := '@' || v_username || v_random_num::TEXT;
                EXIT;
            END IF;
        END LOOP;
        
        -- Register the FaceTag (NEW.id = user_id for photographers)
        INSERT INTO username_registry (username, sequence_number, user_id, user_type, face_tag)
        VALUES (v_username, v_random_num, NEW.id, 'photographer', v_face_tag)
        ON CONFLICT (face_tag) DO NOTHING;
        
        NEW.face_tag := v_face_tag;
        NEW.username := v_username;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update attendee FaceTag generation (create if doesn't exist)
CREATE OR REPLACE FUNCTION generate_attendee_face_tag()
RETURNS TRIGGER AS $$
DECLARE
    v_username TEXT;
    v_random_num INTEGER;
    v_face_tag TEXT;
    v_attempts INTEGER := 0;
BEGIN
    -- Only generate if face_tag is null
    IF NEW.face_tag IS NULL THEN
        -- Check if username was provided in user metadata
        -- Note: attendees.id = auth.uid()
        SELECT raw_user_meta_data->>'username' INTO v_username
        FROM auth.users WHERE id = NEW.id;
        
        IF v_username IS NOT NULL AND LENGTH(v_username) >= 4 THEN
            -- Use the new username-based system
            v_username := LOWER(REGEXP_REPLACE(v_username, '[^a-z0-9]', '', 'g'));
            v_username := LEFT(v_username, 8);
        ELSE
            -- Fallback: generate from display_name
            v_username := COALESCE(
                LOWER(REGEXP_REPLACE(NEW.display_name, '[^a-zA-Z0-9]', '', 'g')),
                SPLIT_PART(NEW.email, '@', 1)
            );
            v_username := LEFT(v_username, 8);
            IF LENGTH(v_username) < 4 THEN
                v_username := v_username || 'user';
            END IF;
        END IF;
        
        -- Generate a random unique number
        LOOP
            v_random_num := 1000 + FLOOR(RANDOM() * 9000)::INTEGER;
            v_face_tag := '@' || v_username || v_random_num::TEXT;
            
            -- Check if this FaceTag is unique
            IF NOT EXISTS (SELECT 1 FROM username_registry WHERE face_tag = v_face_tag) THEN
                EXIT;
            END IF;
            
            v_attempts := v_attempts + 1;
            IF v_attempts >= 100 THEN
                -- Expand to 5 digits if too many collisions
                v_random_num := 10000 + FLOOR(RANDOM() * 90000)::INTEGER;
                v_face_tag := '@' || v_username || v_random_num::TEXT;
                EXIT;
            END IF;
        END LOOP;
        
        -- Register the FaceTag (NEW.id = user_id for attendees)
        INSERT INTO username_registry (username, sequence_number, user_id, user_type, face_tag)
        VALUES (v_username, v_random_num, NEW.id, 'attendee', v_face_tag)
        ON CONFLICT (face_tag) DO NOTHING;
        
        NEW.face_tag := v_face_tag;
        NEW.username := v_username;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for attendees if it doesn't exist
DROP TRIGGER IF EXISTS trigger_generate_attendee_face_tag ON attendees;
CREATE TRIGGER trigger_generate_attendee_face_tag
    BEFORE INSERT ON attendees
    FOR EACH ROW
    EXECUTE FUNCTION generate_attendee_face_tag();

-- ============================================
-- Migrate existing FaceTags to new system
-- (This creates registry entries for existing users)
-- ============================================

-- Migrate attendees with existing face_tags
-- Note: attendees.id IS the user_id (references auth.users)
INSERT INTO username_registry (username, sequence_number, user_id, user_type, face_tag)
SELECT 
    LOWER(LEFT(REGEXP_REPLACE(REPLACE(a.face_tag, '@', ''), '[^a-zA-Z0-9]', '', 'g'), 8)) as username,
    ROW_NUMBER() OVER (PARTITION BY LOWER(LEFT(REGEXP_REPLACE(REPLACE(a.face_tag, '@', ''), '[^a-zA-Z0-9]', '', 'g'), 8)) ORDER BY a.created_at) as sequence_number,
    a.id,  -- attendees.id = auth.uid()
    'attendee',
    a.face_tag
FROM attendees a
WHERE a.face_tag IS NOT NULL AND a.face_tag != ''
ON CONFLICT (face_tag) DO NOTHING;

-- Migrate photographers with existing face_tags
-- Note: photographers.id IS the user_id (references auth.users)
INSERT INTO username_registry (username, sequence_number, user_id, user_type, face_tag)
SELECT 
    LOWER(LEFT(REGEXP_REPLACE(REPLACE(p.face_tag, '@', ''), '[^a-zA-Z0-9]', '', 'g'), 8)) as username,
    ROW_NUMBER() OVER (PARTITION BY LOWER(LEFT(REGEXP_REPLACE(REPLACE(p.face_tag, '@', ''), '[^a-zA-Z0-9]', '', 'g'), 8)) ORDER BY p.created_at) as sequence_number,
    p.id,  -- photographers.id = auth.uid()
    'photographer',
    p.face_tag
FROM photographers p
WHERE p.face_tag IS NOT NULL AND p.face_tag != ''
ON CONFLICT (face_tag) DO NOTHING;
