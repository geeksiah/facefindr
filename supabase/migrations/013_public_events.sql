-- =============================================
-- PHASE 10: PUBLIC EVENTS & SHARING
-- =============================================

-- Add public sharing fields to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS public_slug VARCHAR(100) UNIQUE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_publicly_listed BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS allow_anonymous_scan BOOLEAN DEFAULT TRUE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS require_access_code BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS public_access_code VARCHAR(20);
ALTER TABLE events ADD COLUMN IF NOT EXISTS share_settings JSONB DEFAULT '{}';
ALTER TABLE events ADD COLUMN IF NOT EXISTS qr_code_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS short_link VARCHAR(50);

-- Create index for public slug lookups
CREATE INDEX IF NOT EXISTS idx_events_public_slug ON events(public_slug) WHERE public_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_short_link ON events(short_link) WHERE short_link IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_public_access ON events(is_publicly_listed, status) WHERE status = 'active';

-- Event share links table - track different sharing methods
CREATE TABLE IF NOT EXISTS event_share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    -- Link type: 'direct', 'qr_code', 'embed', 'social'
    link_type VARCHAR(20) NOT NULL DEFAULT 'direct',
    
    -- Unique token for this link
    token VARCHAR(100) UNIQUE NOT NULL,
    
    -- Optional label for the link
    label VARCHAR(100),
    
    -- Access restrictions
    require_code BOOLEAN DEFAULT FALSE,
    access_code VARCHAR(20),
    
    -- Expiration
    expires_at TIMESTAMPTZ,
    
    -- Usage limits
    max_uses INTEGER,
    use_count INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track link visits/analytics
CREATE TABLE IF NOT EXISTS event_link_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    share_link_id UUID REFERENCES event_share_links(id) ON DELETE SET NULL,
    
    -- Visitor info (hashed/anonymized)
    visitor_hash VARCHAR(64),
    referrer TEXT,
    user_agent TEXT,
    country_code VARCHAR(2),
    city VARCHAR(100),
    
    -- Device info
    device_type VARCHAR(20), -- 'mobile', 'tablet', 'desktop'
    browser VARCHAR(50),
    os VARCHAR(50),
    
    -- Actions
    action VARCHAR(30) NOT NULL, -- 'view', 'scan', 'purchase', 'download', 'share'
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_event_link_analytics_event ON event_link_analytics(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_link_analytics_link ON event_link_analytics(share_link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_link_analytics_action ON event_link_analytics(action, created_at DESC);

-- Event embeds for websites
CREATE TABLE IF NOT EXISTS event_embeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    -- Embed settings
    embed_type VARCHAR(20) NOT NULL DEFAULT 'gallery', -- 'gallery', 'scanner', 'button'
    
    -- Customization
    theme VARCHAR(20) DEFAULT 'auto', -- 'light', 'dark', 'auto'
    primary_color VARCHAR(7) DEFAULT '#0A84FF',
    border_radius INTEGER DEFAULT 12,
    show_branding BOOLEAN DEFAULT TRUE,
    show_photo_count BOOLEAN DEFAULT TRUE,
    columns INTEGER DEFAULT 3,
    max_photos INTEGER DEFAULT 12,
    
    -- Size
    width VARCHAR(20) DEFAULT '100%',
    height VARCHAR(20) DEFAULT 'auto',
    
    -- Embed code (generated)
    embed_code TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to generate unique public slug
CREATE OR REPLACE FUNCTION generate_event_slug(event_name TEXT, event_id UUID)
RETURNS TEXT AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    -- Convert name to slug format
    base_slug := lower(regexp_replace(event_name, '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := trim(both '-' from base_slug);
    base_slug := left(base_slug, 50);
    
    final_slug := base_slug;
    
    -- Check for uniqueness and add suffix if needed
    WHILE EXISTS (SELECT 1 FROM events WHERE public_slug = final_slug AND id != event_id) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;
    
    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Function to generate short link code
CREATE OR REPLACE FUNCTION generate_short_link()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to generate slug when event is published
CREATE OR REPLACE FUNCTION auto_generate_event_slug()
RETURNS TRIGGER AS $$
BEGIN
    -- Generate slug if not set and event is being activated
    IF NEW.public_slug IS NULL AND NEW.status = 'active' THEN
        NEW.public_slug := generate_event_slug(NEW.name, NEW.id);
    END IF;
    
    -- Generate short link if not set
    IF NEW.short_link IS NULL AND NEW.status = 'active' THEN
        NEW.short_link := generate_short_link();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_event_slug ON events;
CREATE TRIGGER trigger_auto_generate_event_slug
    BEFORE INSERT OR UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_event_slug();

-- RLS Policies
ALTER TABLE event_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_link_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_embeds ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Photographers can manage own share links" ON event_share_links;
DROP POLICY IF EXISTS "Anyone can view active share links" ON event_share_links;
DROP POLICY IF EXISTS "Photographers can view own event analytics" ON event_link_analytics;
DROP POLICY IF EXISTS "System can insert analytics" ON event_link_analytics;
DROP POLICY IF EXISTS "Photographers can manage own embeds" ON event_embeds;
DROP POLICY IF EXISTS "Anyone can view embeds" ON event_embeds;
DROP POLICY IF EXISTS "Anyone can view public active events" ON events;

-- Photographers can manage their share links
CREATE POLICY "Photographers can manage own share links"
    ON event_share_links FOR ALL
    USING (
        event_id IN (SELECT id FROM events WHERE photographer_id = auth.uid())
    );

-- Anyone can access active share links (for validation)
CREATE POLICY "Anyone can view active share links"
    ON event_share_links FOR SELECT
    USING (is_active = TRUE);

-- Analytics - photographers can view their event analytics
CREATE POLICY "Photographers can view own event analytics"
    ON event_link_analytics FOR SELECT
    USING (
        event_id IN (SELECT id FROM events WHERE photographer_id = auth.uid())
    );

-- System can insert analytics (service role)
CREATE POLICY "System can insert analytics"
    ON event_link_analytics FOR INSERT
    WITH CHECK (TRUE);

-- Photographers can manage embeds
CREATE POLICY "Photographers can manage own embeds"
    ON event_embeds FOR ALL
    USING (
        event_id IN (SELECT id FROM events WHERE photographer_id = auth.uid())
    );

-- Anyone can view embeds (for rendering)
CREATE POLICY "Anyone can view embeds"
    ON event_embeds FOR SELECT
    USING (TRUE);

-- Update events RLS to allow public access to active events
CREATE POLICY "Anyone can view public active events"
    ON events FOR SELECT
    USING (
        status = 'active' AND (
            is_publicly_listed = TRUE OR
            public_slug IS NOT NULL OR
            short_link IS NOT NULL
        )
    );

-- Function to track link visit
CREATE OR REPLACE FUNCTION track_event_link_visit(
    p_event_id UUID,
    p_share_link_id UUID DEFAULT NULL,
    p_visitor_hash VARCHAR DEFAULT NULL,
    p_referrer TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_country_code VARCHAR DEFAULT NULL,
    p_city VARCHAR DEFAULT NULL,
    p_device_type VARCHAR DEFAULT NULL,
    p_browser VARCHAR DEFAULT NULL,
    p_os VARCHAR DEFAULT NULL,
    p_action VARCHAR DEFAULT 'view'
)
RETURNS UUID AS $$
DECLARE
    visit_id UUID;
BEGIN
    INSERT INTO event_link_analytics (
        event_id, share_link_id, visitor_hash, referrer, user_agent,
        country_code, city, device_type, browser, os, action
    ) VALUES (
        p_event_id, p_share_link_id, p_visitor_hash, p_referrer, p_user_agent,
        p_country_code, p_city, p_device_type, p_browser, p_os, p_action
    ) RETURNING id INTO visit_id;
    
    -- Increment use count if share link provided
    IF p_share_link_id IS NOT NULL THEN
        UPDATE event_share_links 
        SET use_count = use_count + 1 
        WHERE id = p_share_link_id;
    END IF;
    
    RETURN visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
