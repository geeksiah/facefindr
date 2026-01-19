-- ============================================
-- EVENT COLLABORATORS SYSTEM
-- ============================================
-- Enables multiple photographers to work on the same event
-- Each photographer maintains ownership of their uploaded photos
-- Revenue is split based on photo ownership

-- ============================================
-- EVENT COLLABORATORS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS event_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
    
    -- Role in the event
    role TEXT NOT NULL DEFAULT 'collaborator' CHECK (role IN ('owner', 'lead', 'collaborator', 'assistant')),
    
    -- Permissions
    can_upload BOOLEAN DEFAULT true,
    can_edit_own_photos BOOLEAN DEFAULT true,
    can_delete_own_photos BOOLEAN DEFAULT true,
    can_view_all_photos BOOLEAN DEFAULT true,
    can_edit_event BOOLEAN DEFAULT false,
    can_manage_pricing BOOLEAN DEFAULT false,
    can_invite_collaborators BOOLEAN DEFAULT false,
    can_view_analytics BOOLEAN DEFAULT false,
    can_view_revenue BOOLEAN DEFAULT false,
    
    -- Revenue sharing (percentage of their photo sales)
    revenue_share_percent DECIMAL(5,2) DEFAULT 100.00 CHECK (revenue_share_percent >= 0 AND revenue_share_percent <= 100),
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'declined', 'removed')),
    invited_by UUID REFERENCES photographers(id),
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique photographer per event
    UNIQUE(event_id, photographer_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_event_collaborators_event ON event_collaborators(event_id);
CREATE INDEX idx_event_collaborators_photographer ON event_collaborators(photographer_id);
CREATE INDEX idx_event_collaborators_status ON event_collaborators(status);
CREATE INDEX idx_event_collaborators_event_active ON event_collaborators(event_id) WHERE status = 'active';

-- ============================================
-- AUTO-CREATE OWNER COLLABORATOR
-- ============================================
-- When an event is created, automatically add the photographer as owner

CREATE OR REPLACE FUNCTION auto_create_event_owner()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO event_collaborators (
        event_id,
        photographer_id,
        role,
        can_upload,
        can_edit_own_photos,
        can_delete_own_photos,
        can_view_all_photos,
        can_edit_event,
        can_manage_pricing,
        can_invite_collaborators,
        can_view_analytics,
        can_view_revenue,
        revenue_share_percent,
        status,
        accepted_at
    ) VALUES (
        NEW.id,
        NEW.photographer_id,
        'owner',
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        100.00,
        'active',
        NOW()
    )
    ON CONFLICT (event_id, photographer_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_create_event_owner
    AFTER INSERT ON events
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_event_owner();

-- ============================================
-- UPDATE MEDIA TABLE
-- ============================================
-- Ensure media has uploader_id to track who uploaded each photo

ALTER TABLE media ADD COLUMN IF NOT EXISTS uploader_id UUID REFERENCES photographers(id);

-- Backfill uploader_id from the event's photographer_id where null
UPDATE media m 
SET uploader_id = e.photographer_id 
FROM events e 
WHERE m.event_id = e.id 
AND m.uploader_id IS NULL;

-- ============================================
-- VIEW: EVENT WITH COLLABORATORS
-- ============================================

CREATE OR REPLACE VIEW event_with_collaborators AS
SELECT 
    e.*,
    (
        SELECT json_agg(json_build_object(
            'id', ec.id,
            'photographer_id', ec.photographer_id,
            'role', ec.role,
            'status', ec.status,
            'display_name', p.display_name,
            'profile_photo_url', p.profile_photo_url,
            'face_tag', p.face_tag
        ))
        FROM event_collaborators ec
        JOIN photographers p ON p.id = ec.photographer_id
        WHERE ec.event_id = e.id AND ec.status = 'active'
    ) as collaborators,
    (
        SELECT COUNT(*)::int
        FROM event_collaborators ec
        WHERE ec.event_id = e.id AND ec.status = 'active'
    ) as collaborator_count
FROM events e;

-- ============================================
-- FUNCTION: CHECK COLLABORATOR ACCESS
-- ============================================

CREATE OR REPLACE FUNCTION check_event_collaborator_access(
    p_event_id UUID,
    p_photographer_id UUID,
    p_permission TEXT DEFAULT 'can_upload'
) RETURNS BOOLEAN AS $$
DECLARE
    v_has_access BOOLEAN;
BEGIN
    EXECUTE format(
        'SELECT EXISTS(
            SELECT 1 FROM event_collaborators 
            WHERE event_id = $1 
            AND photographer_id = $2 
            AND status = ''active''
            AND %I = true
        )',
        p_permission
    ) INTO v_has_access USING p_event_id, p_photographer_id;
    
    RETURN v_has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: GET PHOTOGRAPHER'S EVENTS (INCLUDING COLLABORATIONS)
-- ============================================

CREATE OR REPLACE FUNCTION get_photographer_events(p_photographer_id UUID)
RETURNS TABLE (
    event_id UUID,
    event_name TEXT,
    event_date DATE,
    status TEXT,
    role TEXT,
    is_owner BOOLEAN,
    photo_count BIGINT,
    my_photo_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id as event_id,
        e.name as event_name,
        e.event_date,
        e.status,
        ec.role,
        (ec.role = 'owner') as is_owner,
        (SELECT COUNT(*) FROM media m WHERE m.event_id = e.id) as photo_count,
        (SELECT COUNT(*) FROM media m WHERE m.event_id = e.id AND m.uploader_id = p_photographer_id) as my_photo_count
    FROM events e
    JOIN event_collaborators ec ON ec.event_id = e.id
    WHERE ec.photographer_id = p_photographer_id
    AND ec.status = 'active'
    ORDER BY e.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RLS POLICIES FOR EVENT_COLLABORATORS
-- ============================================

ALTER TABLE event_collaborators ENABLE ROW LEVEL SECURITY;

-- Photographers can view collaborators for events they're part of
CREATE POLICY "Photographers can view event collaborators"
    ON event_collaborators FOR SELECT
    USING (
        photographer_id = auth.uid()
        OR event_id IN (
            SELECT event_id FROM event_collaborators 
            WHERE photographer_id = auth.uid() AND status = 'active'
        )
    );

-- Event owners/leads can manage collaborators
CREATE POLICY "Event owners can manage collaborators"
    ON event_collaborators FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM event_collaborators ec
            WHERE ec.event_id = event_collaborators.event_id
            AND ec.photographer_id = auth.uid()
            AND ec.status = 'active'
            AND (ec.role IN ('owner', 'lead') OR ec.can_invite_collaborators = true)
        )
    );

-- Photographers can accept/decline their own invitations
CREATE POLICY "Photographers can respond to invitations"
    ON event_collaborators FOR UPDATE
    USING (photographer_id = auth.uid() AND status = 'pending')
    WITH CHECK (photographer_id = auth.uid());

-- ============================================
-- UPDATE MEDIA RLS FOR COLLABORATORS
-- ============================================

-- Drop existing media policies if they conflict
DROP POLICY IF EXISTS "Photographers can view media for their events" ON media;
DROP POLICY IF EXISTS "Photographers can insert media for their events" ON media;
DROP POLICY IF EXISTS "Photographers can update their own media" ON media;
DROP POLICY IF EXISTS "Photographers can delete their own media" ON media;

-- New policies that support collaborators
CREATE POLICY "Collaborators can view event media"
    ON media FOR SELECT
    USING (
        -- Owner can always see (check via events table since media doesn't have photographer_id)
        EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.photographer_id = auth.uid())
        -- Or is a collaborator with view permission
        OR check_event_collaborator_access(event_id, auth.uid(), 'can_view_all_photos')
    );

CREATE POLICY "Collaborators can upload media"
    ON media FOR INSERT
    WITH CHECK (
        -- Must be a collaborator with upload permission
        check_event_collaborator_access(event_id, auth.uid(), 'can_upload')
    );

CREATE POLICY "Collaborators can update own media"
    ON media FOR UPDATE
    USING (
        uploader_id = auth.uid()
        AND check_event_collaborator_access(event_id, auth.uid(), 'can_edit_own_photos')
    );

CREATE POLICY "Collaborators can delete own media"
    ON media FOR DELETE
    USING (
        uploader_id = auth.uid()
        AND check_event_collaborator_access(event_id, auth.uid(), 'can_delete_own_photos')
    );

-- ============================================
-- REVENUE TRACKING FOR COLLABORATORS
-- ============================================

-- Add collaborator tracking to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS uploader_id UUID REFERENCES photographers(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS revenue_share_applied DECIMAL(5,2);

-- Function to calculate revenue split
CREATE OR REPLACE FUNCTION calculate_collaborator_revenue(
    p_media_id UUID,
    p_gross_amount INTEGER
) RETURNS TABLE (
    photographer_id UUID,
    share_amount INTEGER,
    share_percent DECIMAL(5,2)
) AS $$
DECLARE
    v_event_id UUID;
    v_uploader_id UUID;
    v_share_percent DECIMAL(5,2);
BEGIN
    -- Get media details
    SELECT m.event_id, m.uploader_id INTO v_event_id, v_uploader_id
    FROM media m WHERE m.id = p_media_id;
    
    IF v_uploader_id IS NULL THEN
        -- Fallback to event owner
        SELECT e.photographer_id INTO v_uploader_id
        FROM events e WHERE e.id = v_event_id;
    END IF;
    
    -- Get collaborator's revenue share
    SELECT ec.revenue_share_percent INTO v_share_percent
    FROM event_collaborators ec
    WHERE ec.event_id = v_event_id
    AND ec.photographer_id = v_uploader_id
    AND ec.status = 'active';
    
    IF v_share_percent IS NULL THEN
        v_share_percent := 100.00;
    END IF;
    
    RETURN QUERY SELECT 
        v_uploader_id,
        ROUND(p_gross_amount * (v_share_percent / 100))::INTEGER,
        v_share_percent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- BACKFILL EXISTING EVENTS
-- ============================================
-- Add owner collaborator record for all existing events

INSERT INTO event_collaborators (
    event_id,
    photographer_id,
    role,
    can_upload,
    can_edit_own_photos,
    can_delete_own_photos,
    can_view_all_photos,
    can_edit_event,
    can_manage_pricing,
    can_invite_collaborators,
    can_view_analytics,
    can_view_revenue,
    revenue_share_percent,
    status,
    accepted_at
)
SELECT 
    id,
    photographer_id,
    'owner',
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    100.00,
    'active',
    created_at
FROM events
ON CONFLICT (event_id, photographer_id) DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE event_collaborators IS 'Tracks photographers who can work on an event. Supports multi-photographer events with role-based permissions and revenue sharing.';
COMMENT ON COLUMN event_collaborators.role IS 'owner: created the event, lead: primary photographer, collaborator: second shooter, assistant: limited access';
COMMENT ON COLUMN event_collaborators.revenue_share_percent IS 'Percentage of sales from their photos they receive (after platform fee)';
COMMENT ON COLUMN media.uploader_id IS 'The photographer who uploaded this specific photo (may differ from event owner)';
