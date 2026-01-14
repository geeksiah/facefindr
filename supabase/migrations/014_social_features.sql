-- =============================================
-- PHASE 10b: SOCIAL FEATURES - FACETAGS & FOLLOWS
-- =============================================

-- Add FaceTag to photographers (like attendees have)
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS face_tag VARCHAR(50) UNIQUE;
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS public_profile_slug VARCHAR(100) UNIQUE;
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS is_public_profile BOOLEAN DEFAULT TRUE;
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS allow_follows BOOLEAN DEFAULT TRUE;
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0;
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS profile_qr_code_url TEXT;

-- Add follow/connection fields to attendees
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS public_profile_slug VARCHAR(100) UNIQUE;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS is_public_profile BOOLEAN DEFAULT FALSE;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS profile_qr_code_url TEXT;

-- Create index for FaceTag lookups
CREATE INDEX IF NOT EXISTS idx_photographers_face_tag ON photographers(face_tag) WHERE face_tag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photographers_profile_slug ON photographers(public_profile_slug) WHERE public_profile_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendees_profile_slug ON attendees(public_profile_slug) WHERE public_profile_slug IS NOT NULL;

-- =============================================
-- FOLLOWS TABLE - Attendees following Photographers
-- =============================================
CREATE TABLE IF NOT EXISTS follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Who is following
    follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    follower_type VARCHAR(20) NOT NULL DEFAULT 'attendee', -- 'attendee' or 'photographer'
    
    -- Who is being followed
    following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    following_type VARCHAR(20) NOT NULL DEFAULT 'photographer', -- 'photographer' or 'attendee'
    
    -- Status
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'blocked', 'muted'
    
    -- Notification preferences for this follow
    notify_new_event BOOLEAN DEFAULT TRUE,
    notify_photo_drop BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint - can only follow once
    UNIQUE(follower_id, following_id)
);

-- =============================================
-- CONNECTIONS TABLE - Photographer <-> Attendee connections
-- =============================================
CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Photographer who initiated or accepted
    photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
    
    -- Attendee connected
    attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    
    -- How they connected
    connection_type VARCHAR(30) NOT NULL DEFAULT 'event', -- 'event', 'scan', 'manual', 'qr_code'
    
    -- Source event if connected via event
    source_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'blocked'
    
    -- Notes (photographer can add notes about this connection)
    notes TEXT,
    
    -- Tags for organizing
    tags TEXT[],
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint
    UNIQUE(photographer_id, attendee_id)
);

-- =============================================
-- PROFILE VIEWS TABLE - Track profile visits
-- =============================================
CREATE TABLE IF NOT EXISTS profile_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Profile being viewed
    profile_id UUID NOT NULL,
    profile_type VARCHAR(20) NOT NULL, -- 'photographer' or 'attendee'
    
    -- Viewer (optional - anonymous views allowed)
    viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- View source
    source VARCHAR(30), -- 'qr_code', 'search', 'event', 'direct', 'app'
    
    -- Device info
    device_type VARCHAR(20),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for profile view analytics
CREATE INDEX IF NOT EXISTS idx_profile_views_profile ON profile_views(profile_id, profile_type, created_at DESC);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Generate FaceTag for photographers (similar to attendees)
CREATE OR REPLACE FUNCTION generate_photographer_face_tag()
RETURNS TRIGGER AS $$
DECLARE
    username_base TEXT;
    random_suffix TEXT;
    new_tag TEXT;
    attempts INTEGER := 0;
BEGIN
    -- Only generate if face_tag is null
    IF NEW.face_tag IS NULL THEN
        -- Create base from display_name or email
        username_base := COALESCE(
            LOWER(REGEXP_REPLACE(NEW.display_name, '[^a-zA-Z0-9]', '', 'g')),
            SPLIT_PART(NEW.email, '@', 1)
        );
        username_base := LEFT(username_base, 15);
        
        -- Try to create unique tag
        LOOP
            random_suffix := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
            new_tag := '@' || username_base || '.' || random_suffix;
            
            -- Check uniqueness
            IF NOT EXISTS (SELECT 1 FROM photographers WHERE face_tag = new_tag) AND
               NOT EXISTS (SELECT 1 FROM attendees WHERE face_tag = new_tag) THEN
                NEW.face_tag := new_tag;
                EXIT;
            END IF;
            
            attempts := attempts + 1;
            IF attempts > 10 THEN
                -- Fallback with timestamp
                NEW.face_tag := '@' || username_base || '.' || EXTRACT(EPOCH FROM NOW())::INTEGER % 10000;
                EXIT;
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-generating photographer FaceTag
DROP TRIGGER IF EXISTS trigger_generate_photographer_face_tag ON photographers;
CREATE TRIGGER trigger_generate_photographer_face_tag
    BEFORE INSERT ON photographers
    FOR EACH ROW
    EXECUTE FUNCTION generate_photographer_face_tag();

-- Generate profile slug
CREATE OR REPLACE FUNCTION generate_profile_slug(name TEXT, user_id UUID)
RETURNS TEXT AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    base_slug := LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := TRIM(BOTH '-' FROM base_slug);
    base_slug := LEFT(base_slug, 40);
    
    final_slug := base_slug;
    
    WHILE EXISTS (
        SELECT 1 FROM photographers WHERE public_profile_slug = final_slug AND id != user_id
        UNION
        SELECT 1 FROM attendees WHERE public_profile_slug = final_slug AND id != user_id
    ) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;
    
    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Update follower counts
CREATE OR REPLACE FUNCTION update_follower_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment follower count
        IF NEW.following_type = 'photographer' THEN
            UPDATE photographers SET follower_count = follower_count + 1 WHERE id = NEW.following_id;
        END IF;
        
        -- Increment following count
        IF NEW.follower_type = 'attendee' THEN
            UPDATE attendees SET following_count = following_count + 1 WHERE id = NEW.follower_id;
        ELSIF NEW.follower_type = 'photographer' THEN
            -- Photographers following other photographers (future feature)
            NULL;
        END IF;
        
    ELSIF TG_OP = 'DELETE' THEN
        -- Decrement follower count
        IF OLD.following_type = 'photographer' THEN
            UPDATE photographers SET follower_count = GREATEST(0, follower_count - 1) WHERE id = OLD.following_id;
        END IF;
        
        -- Decrement following count
        IF OLD.follower_type = 'attendee' THEN
            UPDATE attendees SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_follower_counts ON follows;
CREATE TRIGGER trigger_update_follower_counts
    AFTER INSERT OR DELETE ON follows
    FOR EACH ROW
    EXECUTE FUNCTION update_follower_counts();

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_views ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own follows" ON follows;
DROP POLICY IF EXISTS "Users can manage their own follows" ON follows;
DROP POLICY IF EXISTS "Photographers can view their connections" ON connections;
DROP POLICY IF EXISTS "Photographers can manage their connections" ON connections;
DROP POLICY IF EXISTS "Users can view their profile views" ON profile_views;
DROP POLICY IF EXISTS "Anyone can record profile views" ON profile_views;

-- Follows policies
CREATE POLICY "Users can view their own follows"
    ON follows FOR SELECT
    USING (follower_id = auth.uid() OR following_id = auth.uid());

CREATE POLICY "Users can manage their own follows"
    ON follows FOR ALL
    USING (follower_id = auth.uid());

-- Connections policies
CREATE POLICY "Photographers can view their connections"
    ON connections FOR SELECT
    USING (photographer_id = auth.uid() OR attendee_id = auth.uid());

CREATE POLICY "Photographers can manage their connections"
    ON connections FOR ALL
    USING (photographer_id = auth.uid());

-- Profile views - photographers/attendees can view their own profile analytics
CREATE POLICY "Users can view their profile views"
    ON profile_views FOR SELECT
    USING (profile_id = auth.uid());

-- Anyone can insert profile views (for tracking)
CREATE POLICY "Anyone can record profile views"
    ON profile_views FOR INSERT
    WITH CHECK (TRUE);

-- =============================================
-- DEEP LINK URL STRUCTURE
-- =============================================
-- Web: https://facefindr.com/p/{slug} (photographers)
-- Web: https://facefindr.com/u/{slug} (attendees/users)
-- App: facefindr://profile/{type}/{id}
-- App: facefindr://photographer/{id}
-- App: facefindr://user/{id}
--
-- QR Code contains: https://facefindr.com/p/{slug}?app=1
-- When app=1, web page attempts deep link to app first

-- =============================================
-- GENERATE FACETAGS FOR EXISTING PHOTOGRAPHERS
-- =============================================
-- Update existing photographers to have FaceTags
DO $$
DECLARE
    rec RECORD;
    username_base TEXT;
    new_tag TEXT;
    random_suffix TEXT;
BEGIN
    FOR rec IN SELECT id, display_name, email FROM photographers WHERE face_tag IS NULL
    LOOP
        username_base := COALESCE(
            LOWER(REGEXP_REPLACE(rec.display_name, '[^a-zA-Z0-9]', '', 'g')),
            SPLIT_PART(rec.email, '@', 1)
        );
        username_base := LEFT(username_base, 15);
        random_suffix := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
        new_tag := '@' || username_base || '.' || random_suffix;
        
        UPDATE photographers SET face_tag = new_tag WHERE id = rec.id;
    END LOOP;
END $$;
