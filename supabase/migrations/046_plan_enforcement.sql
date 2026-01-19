-- ============================================
-- PLAN ENFORCEMENT SYSTEM
-- ============================================
-- This migration creates a comprehensive system for enforcing plan limits
-- at the database level. Every limit is enforced, not just displayed.

-- ============================================
-- USAGE TRACKING TABLE
-- ============================================
-- Tracks real-time usage for each photographer

CREATE TABLE IF NOT EXISTS photographer_usage (
    photographer_id UUID PRIMARY KEY REFERENCES photographers(id) ON DELETE CASCADE,
    
    -- Event counts
    active_events_count INTEGER DEFAULT 0,
    total_events_count INTEGER DEFAULT 0,
    
    -- Photo counts
    total_photos_count INTEGER DEFAULT 0,
    
    -- Storage (in bytes)
    storage_used_bytes BIGINT DEFAULT 0,
    
    -- Face operations (lifetime)
    total_face_ops INTEGER DEFAULT 0,
    
    -- Current billing period face ops
    period_face_ops INTEGER DEFAULT 0,
    period_start_date DATE DEFAULT CURRENT_DATE,
    
    -- Team members
    active_team_members INTEGER DEFAULT 1, -- Owner counts as 1
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_photographer_usage_photographer ON photographer_usage(photographer_id);

-- ============================================
-- FUNCTION: Get photographer's current plan limits
-- ============================================

CREATE OR REPLACE FUNCTION get_photographer_limits(p_photographer_id UUID)
RETURNS TABLE (
    plan_code TEXT,
    max_active_events INTEGER,
    max_photos_per_event INTEGER,
    max_face_ops_per_event INTEGER,
    storage_gb INTEGER,
    team_members INTEGER,
    platform_fee_percent DECIMAL,
    face_recognition_enabled BOOLEAN,
    custom_watermark BOOLEAN,
    live_event_mode BOOLEAN,
    api_access BOOLEAN
) AS $$
DECLARE
    v_plan_code TEXT;
    v_plan_id UUID;
BEGIN
    -- Get photographer's active subscription
    SELECT s.plan_code, s.plan_id INTO v_plan_code, v_plan_id
    FROM subscriptions s
    WHERE s.photographer_id = p_photographer_id
    AND s.status IN ('active', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1;
    
    -- Default to free if no subscription
    IF v_plan_code IS NULL THEN
        v_plan_code := 'free';
    END IF;
    
    -- Try to get from new modular system first
    IF v_plan_id IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            sp.code::TEXT as plan_code,
            COALESCE((
                SELECT (pfa.feature_value)::INTEGER 
                FROM plan_feature_assignments pfa 
                JOIN plan_features pf ON pf.id = pfa.feature_id 
                WHERE pfa.plan_id = v_plan_id AND pf.code = 'max_active_events'
            ), 3) as max_active_events,
            COALESCE((
                SELECT (pfa.feature_value)::INTEGER 
                FROM plan_feature_assignments pfa 
                JOIN plan_features pf ON pf.id = pfa.feature_id 
                WHERE pfa.plan_id = v_plan_id AND pf.code = 'max_photos_per_event'
            ), 100) as max_photos_per_event,
            COALESCE((
                SELECT (pfa.feature_value)::INTEGER 
                FROM plan_feature_assignments pfa 
                JOIN plan_features pf ON pf.id = pfa.feature_id 
                WHERE pfa.plan_id = v_plan_id AND pf.code = 'max_face_ops_per_event'
            ), 500) as max_face_ops_per_event,
            COALESCE((
                SELECT (pfa.feature_value)::INTEGER 
                FROM plan_feature_assignments pfa 
                JOIN plan_features pf ON pf.id = pfa.feature_id 
                WHERE pfa.plan_id = v_plan_id AND pf.code = 'storage_gb'
            ), 5) as storage_gb,
            COALESCE((
                SELECT (pfa.feature_value)::INTEGER 
                FROM plan_feature_assignments pfa 
                JOIN plan_features pf ON pf.id = pfa.feature_id 
                WHERE pfa.plan_id = v_plan_id AND pf.code = 'team_members'
            ), 1) as team_members,
            COALESCE(sp.platform_fee_percent, 20.00) as platform_fee_percent,
            COALESCE((
                SELECT (pfa.feature_value)::BOOLEAN 
                FROM plan_feature_assignments pfa 
                JOIN plan_features pf ON pf.id = pfa.feature_id 
                WHERE pfa.plan_id = v_plan_id AND pf.code = 'face_recognition_enabled'
            ), FALSE) as face_recognition_enabled,
            COALESCE((
                SELECT (pfa.feature_value)::BOOLEAN 
                FROM plan_feature_assignments pfa 
                JOIN plan_features pf ON pf.id = pfa.feature_id 
                WHERE pfa.plan_id = v_plan_id AND pf.code = 'custom_watermark'
            ), FALSE) as custom_watermark,
            COALESCE((
                SELECT (pfa.feature_value)::BOOLEAN 
                FROM plan_feature_assignments pfa 
                JOIN plan_features pf ON pf.id = pfa.feature_id 
                WHERE pfa.plan_id = v_plan_id AND pf.code = 'live_event_mode'
            ), FALSE) as live_event_mode,
            COALESCE((
                SELECT (pfa.feature_value)::BOOLEAN 
                FROM plan_feature_assignments pfa 
                JOIN plan_features pf ON pf.id = pfa.feature_id 
                WHERE pfa.plan_id = v_plan_id AND pf.code = 'api_access'
            ), FALSE) as api_access
        FROM subscription_plans sp
        WHERE sp.id = v_plan_id;
    END IF;
    
    -- Fallback to legacy system
    RETURN QUERY
    SELECT 
        spf.plan_code::TEXT,
        spf.max_active_events,
        spf.max_photos_per_event,
        spf.max_face_ops_per_event,
        spf.storage_gb,
        spf.team_members,
        spf.platform_fee_percent,
        spf.max_face_ops_per_event > 0 as face_recognition_enabled,
        spf.custom_watermark,
        spf.live_event_mode,
        spf.api_access
    FROM subscription_plan_features spf
    WHERE spf.plan_code::TEXT = v_plan_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Check if action is allowed
-- ============================================

CREATE OR REPLACE FUNCTION check_limit(
    p_photographer_id UUID,
    p_limit_type TEXT,
    p_event_id UUID DEFAULT NULL
) RETURNS TABLE (
    allowed BOOLEAN,
    current_value INTEGER,
    limit_value INTEGER,
    message TEXT
) AS $$
DECLARE
    v_limits RECORD;
    v_usage RECORD;
    v_current INTEGER;
    v_limit INTEGER;
    v_allowed BOOLEAN;
    v_message TEXT;
BEGIN
    -- Get limits
    SELECT * INTO v_limits FROM get_photographer_limits(p_photographer_id);
    
    -- Get or create usage record
    INSERT INTO photographer_usage (photographer_id)
    VALUES (p_photographer_id)
    ON CONFLICT (photographer_id) DO NOTHING;
    
    SELECT * INTO v_usage FROM photographer_usage WHERE photographer_id = p_photographer_id;
    
    CASE p_limit_type
        WHEN 'events' THEN
            v_current := v_usage.active_events_count;
            v_limit := v_limits.max_active_events;
            v_allowed := v_limit = -1 OR v_current < v_limit;
            v_message := CASE WHEN v_allowed THEN NULL 
                ELSE format('Event limit reached (%s/%s). Upgrade your plan to create more events.', v_current, v_limit) END;
                
        WHEN 'photos' THEN
            -- Check photos for specific event
            SELECT COUNT(*) INTO v_current FROM media WHERE event_id = p_event_id AND deleted_at IS NULL;
            v_limit := v_limits.max_photos_per_event;
            v_allowed := v_current < v_limit;
            v_message := CASE WHEN v_allowed THEN NULL 
                ELSE format('Photo limit reached for this event (%s/%s). Upgrade your plan for more photos per event.', v_current, v_limit) END;
                
        WHEN 'face_ops' THEN
            -- Check face ops for specific event
            SELECT COALESCE(face_ops_used, 0) INTO v_current FROM events WHERE id = p_event_id;
            v_limit := v_limits.max_face_ops_per_event;
            v_allowed := v_limit = -1 OR v_current < v_limit;
            v_message := CASE WHEN v_allowed THEN NULL 
                ELSE format('Face recognition limit reached for this event (%s/%s). Upgrade for more face operations.', v_current, v_limit) END;
                
        WHEN 'storage' THEN
            v_current := (v_usage.storage_used_bytes / (1024 * 1024 * 1024))::INTEGER; -- Convert to GB
            v_limit := v_limits.storage_gb;
            v_allowed := v_current < v_limit;
            v_message := CASE WHEN v_allowed THEN NULL 
                ELSE format('Storage limit reached (%sGB/%sGB). Upgrade your plan for more storage.', v_current, v_limit) END;
                
        WHEN 'team_members' THEN
            v_current := v_usage.active_team_members;
            v_limit := v_limits.team_members;
            v_allowed := v_current < v_limit;
            v_message := CASE WHEN v_allowed THEN NULL 
                ELSE format('Team member limit reached (%s/%s). Upgrade your plan to add more team members.', v_current, v_limit) END;
                
        ELSE
            v_allowed := TRUE;
            v_current := 0;
            v_limit := 0;
            v_message := NULL;
    END CASE;
    
    RETURN QUERY SELECT v_allowed, v_current, v_limit, v_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Check if feature is enabled
-- ============================================

CREATE OR REPLACE FUNCTION check_feature(
    p_photographer_id UUID,
    p_feature TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_limits RECORD;
BEGIN
    SELECT * INTO v_limits FROM get_photographer_limits(p_photographer_id);
    
    CASE p_feature
        WHEN 'face_recognition' THEN RETURN v_limits.face_recognition_enabled;
        WHEN 'custom_watermark' THEN RETURN v_limits.custom_watermark;
        WHEN 'live_event_mode' THEN RETURN v_limits.live_event_mode;
        WHEN 'api_access' THEN RETURN v_limits.api_access;
        ELSE RETURN FALSE;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGER: Update usage on event changes
-- ============================================

CREATE OR REPLACE FUNCTION update_usage_on_event_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment counts
        UPDATE photographer_usage 
        SET 
            total_events_count = total_events_count + 1,
            active_events_count = active_events_count + CASE WHEN NEW.status IN ('draft', 'active') THEN 1 ELSE 0 END,
            updated_at = NOW()
        WHERE photographer_id = NEW.photographer_id;
        
        -- Create usage record if doesn't exist
        INSERT INTO photographer_usage (photographer_id, total_events_count, active_events_count)
        VALUES (NEW.photographer_id, 1, CASE WHEN NEW.status IN ('draft', 'active') THEN 1 ELSE 0 END)
        ON CONFLICT (photographer_id) DO NOTHING;
        
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle status changes
        IF OLD.status != NEW.status THEN
            UPDATE photographer_usage 
            SET 
                active_events_count = active_events_count 
                    + CASE WHEN NEW.status IN ('draft', 'active') THEN 1 ELSE 0 END
                    - CASE WHEN OLD.status IN ('draft', 'active') THEN 1 ELSE 0 END,
                updated_at = NOW()
            WHERE photographer_id = NEW.photographer_id;
        END IF;
        
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE photographer_usage 
        SET 
            total_events_count = GREATEST(0, total_events_count - 1),
            active_events_count = GREATEST(0, active_events_count - CASE WHEN OLD.status IN ('draft', 'active') THEN 1 ELSE 0 END),
            updated_at = NOW()
        WHERE photographer_id = OLD.photographer_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_usage_on_event ON events;
CREATE TRIGGER trigger_update_usage_on_event
    AFTER INSERT OR UPDATE OR DELETE ON events
    FOR EACH ROW EXECUTE FUNCTION update_usage_on_event_change();

-- ============================================
-- TRIGGER: Update usage on media changes
-- ============================================

CREATE OR REPLACE FUNCTION update_usage_on_media_change()
RETURNS TRIGGER AS $$
DECLARE
    v_photographer_id UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Get photographer from event
        SELECT photographer_id INTO v_photographer_id FROM events WHERE id = NEW.event_id;
        
        UPDATE photographer_usage 
        SET 
            total_photos_count = total_photos_count + 1,
            storage_used_bytes = storage_used_bytes + COALESCE(NEW.file_size, 0),
            updated_at = NOW()
        WHERE photographer_id = v_photographer_id;
        
        -- Create if doesn't exist
        INSERT INTO photographer_usage (photographer_id, total_photos_count, storage_used_bytes)
        VALUES (v_photographer_id, 1, COALESCE(NEW.file_size, 0))
        ON CONFLICT (photographer_id) DO NOTHING;
        
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle soft delete
        IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
            SELECT photographer_id INTO v_photographer_id FROM events WHERE id = NEW.event_id;
            UPDATE photographer_usage 
            SET 
                total_photos_count = GREATEST(0, total_photos_count - 1),
                storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size, 0)),
                updated_at = NOW()
            WHERE photographer_id = v_photographer_id;
        END IF;
        
    ELSIF TG_OP = 'DELETE' THEN
        SELECT photographer_id INTO v_photographer_id FROM events WHERE id = OLD.event_id;
        UPDATE photographer_usage 
        SET 
            total_photos_count = GREATEST(0, total_photos_count - 1),
            storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size, 0)),
            updated_at = NOW()
        WHERE photographer_id = v_photographer_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_usage_on_media ON media;
CREATE TRIGGER trigger_update_usage_on_media
    AFTER INSERT OR UPDATE OR DELETE ON media
    FOR EACH ROW EXECUTE FUNCTION update_usage_on_media_change();

-- ============================================
-- TRIGGER: Update usage on collaborator changes
-- ============================================
-- Note: This trigger is only created if event_collaborators table exists

CREATE OR REPLACE FUNCTION update_usage_on_collaborator_change()
RETURNS TRIGGER AS $$
DECLARE
    v_photographer_id UUID;
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Get event owner
        SELECT photographer_id INTO v_photographer_id FROM events WHERE id = NEW.event_id;
        
        -- Count active collaborators (excluding owner)
        UPDATE photographer_usage 
        SET 
            active_team_members = 1 + (
                SELECT COUNT(DISTINCT ec.photographer_id)
                FROM event_collaborators ec
                JOIN events e ON e.id = ec.event_id
                WHERE e.photographer_id = v_photographer_id
                AND ec.status = 'active'
                AND ec.role != 'owner'
            ),
            updated_at = NOW()
        WHERE photographer_id = v_photographer_id;
        
    ELSIF TG_OP = 'DELETE' THEN
        SELECT photographer_id INTO v_photographer_id FROM events WHERE id = OLD.event_id;
        
        UPDATE photographer_usage 
        SET 
            active_team_members = 1 + (
                SELECT COUNT(DISTINCT ec.photographer_id)
                FROM event_collaborators ec
                JOIN events e ON e.id = ec.event_id
                WHERE e.photographer_id = v_photographer_id
                AND ec.status = 'active'
                AND ec.role != 'owner'
            ),
            updated_at = NOW()
        WHERE photographer_id = v_photographer_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if event_collaborators table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_collaborators') THEN
        DROP TRIGGER IF EXISTS trigger_update_usage_on_collaborator ON event_collaborators;
        CREATE TRIGGER trigger_update_usage_on_collaborator
            AFTER INSERT OR UPDATE OR DELETE ON event_collaborators
            FOR EACH ROW EXECUTE FUNCTION update_usage_on_collaborator_change();
    END IF;
END $$;

-- ============================================
-- TRIGGER: Enforce event limit on insert
-- ============================================

CREATE OR REPLACE FUNCTION enforce_event_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_check RECORD;
BEGIN
    SELECT * INTO v_check FROM check_limit(NEW.photographer_id, 'events');
    
    IF NOT v_check.allowed THEN
        RAISE EXCEPTION 'LIMIT_EXCEEDED: %', v_check.message;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_event_limit ON events;
CREATE TRIGGER trigger_enforce_event_limit
    BEFORE INSERT ON events
    FOR EACH ROW EXECUTE FUNCTION enforce_event_limit();

-- ============================================
-- TRIGGER: Enforce photo limit on insert
-- ============================================

CREATE OR REPLACE FUNCTION enforce_photo_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_photographer_id UUID;
    v_check RECORD;
    v_storage_check RECORD;
BEGIN
    -- Get photographer
    SELECT photographer_id INTO v_photographer_id FROM events WHERE id = NEW.event_id;
    
    -- Check photo limit
    SELECT * INTO v_check FROM check_limit(v_photographer_id, 'photos', NEW.event_id);
    IF NOT v_check.allowed THEN
        RAISE EXCEPTION 'LIMIT_EXCEEDED: %', v_check.message;
    END IF;
    
    -- Check storage limit
    SELECT * INTO v_storage_check FROM check_limit(v_photographer_id, 'storage');
    IF NOT v_storage_check.allowed THEN
        RAISE EXCEPTION 'LIMIT_EXCEEDED: %', v_storage_check.message;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_photo_limit ON media;
CREATE TRIGGER trigger_enforce_photo_limit
    BEFORE INSERT ON media
    FOR EACH ROW EXECUTE FUNCTION enforce_photo_limit();

-- ============================================
-- TRIGGER: Enforce team member limit
-- ============================================

CREATE OR REPLACE FUNCTION enforce_team_member_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_photographer_id UUID;
    v_check RECORD;
BEGIN
    -- Only check on new active collaborators
    IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != 'active')) THEN
        -- Get event owner
        SELECT photographer_id INTO v_photographer_id FROM events WHERE id = NEW.event_id;
        
        -- Check limit
        SELECT * INTO v_check FROM check_limit(v_photographer_id, 'team_members');
        IF NOT v_check.allowed THEN
            RAISE EXCEPTION 'LIMIT_EXCEEDED: %', v_check.message;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if event_collaborators table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_collaborators') THEN
        DROP TRIGGER IF EXISTS trigger_enforce_team_member_limit ON event_collaborators;
        CREATE TRIGGER trigger_enforce_team_member_limit
            BEFORE INSERT OR UPDATE ON event_collaborators
            FOR EACH ROW EXECUTE FUNCTION enforce_team_member_limit();
    END IF;
END $$;

-- ============================================
-- FUNCTION: Increment face ops (with limit check)
-- ============================================

CREATE OR REPLACE FUNCTION increment_face_ops(
    p_event_id UUID,
    p_count INTEGER DEFAULT 1
) RETURNS TABLE (
    success BOOLEAN,
    new_count INTEGER,
    limit_value INTEGER,
    message TEXT
) AS $$
DECLARE
    v_photographer_id UUID;
    v_check RECORD;
    v_new_count INTEGER;
BEGIN
    -- Get photographer
    SELECT photographer_id INTO v_photographer_id FROM events WHERE id = p_event_id;
    
    -- Check limit first
    SELECT * INTO v_check FROM check_limit(v_photographer_id, 'face_ops', p_event_id);
    
    IF NOT v_check.allowed THEN
        RETURN QUERY SELECT FALSE, v_check.current_value, v_check.limit_value, v_check.message;
        RETURN;
    END IF;
    
    -- Increment
    UPDATE events 
    SET face_ops_used = COALESCE(face_ops_used, 0) + p_count
    WHERE id = p_event_id
    RETURNING face_ops_used INTO v_new_count;
    
    -- Update usage tracking
    UPDATE photographer_usage 
    SET 
        total_face_ops = total_face_ops + p_count,
        period_face_ops = period_face_ops + p_count,
        updated_at = NOW()
    WHERE photographer_id = v_photographer_id;
    
    RETURN QUERY SELECT TRUE, v_new_count, v_check.limit_value, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Get usage summary for photographer
-- ============================================

CREATE OR REPLACE FUNCTION get_usage_summary(p_photographer_id UUID)
RETURNS TABLE (
    -- Current usage
    active_events INTEGER,
    total_photos INTEGER,
    storage_used_gb DECIMAL,
    team_members INTEGER,
    face_ops_used INTEGER,
    
    -- Limits
    max_events INTEGER,
    max_photos_per_event INTEGER,
    max_storage_gb INTEGER,
    max_team_members INTEGER,
    max_face_ops INTEGER,
    
    -- Percentages
    events_percent INTEGER,
    storage_percent INTEGER,
    team_percent INTEGER,
    
    -- Plan info
    plan_code TEXT,
    platform_fee DECIMAL
) AS $$
DECLARE
    v_usage RECORD;
    v_limits RECORD;
BEGIN
    -- Get or create usage
    INSERT INTO photographer_usage (photographer_id)
    VALUES (p_photographer_id)
    ON CONFLICT (photographer_id) DO NOTHING;
    
    SELECT * INTO v_usage FROM photographer_usage WHERE photographer_id = p_photographer_id;
    SELECT * INTO v_limits FROM get_photographer_limits(p_photographer_id);
    
    RETURN QUERY SELECT
        v_usage.active_events_count,
        v_usage.total_photos_count,
        ROUND((v_usage.storage_used_bytes / (1024.0 * 1024.0 * 1024.0))::DECIMAL, 2),
        v_usage.active_team_members,
        v_usage.total_face_ops,
        
        v_limits.max_active_events,
        v_limits.max_photos_per_event,
        v_limits.storage_gb,
        v_limits.team_members,
        v_limits.max_face_ops_per_event,
        
        CASE WHEN v_limits.max_active_events = -1 THEN 0 
            ELSE LEAST(100, (v_usage.active_events_count * 100 / NULLIF(v_limits.max_active_events, 0)))::INTEGER END,
        LEAST(100, (v_usage.storage_used_bytes * 100 / NULLIF(v_limits.storage_gb::BIGINT * 1024 * 1024 * 1024, 0)))::INTEGER,
        LEAST(100, (v_usage.active_team_members * 100 / NULLIF(v_limits.team_members, 0)))::INTEGER,
        
        v_limits.plan_code,
        v_limits.platform_fee_percent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- BACKFILL: Initialize usage for existing photographers
-- ============================================

-- First, insert basic usage without team members (works even without event_collaborators)
INSERT INTO photographer_usage (
    photographer_id,
    active_events_count,
    total_events_count,
    total_photos_count,
    storage_used_bytes,
    active_team_members
)
SELECT 
    p.id,
    COALESCE((SELECT COUNT(*) FROM events e WHERE e.photographer_id = p.id AND e.status IN ('draft', 'active')), 0)::INTEGER,
    COALESCE((SELECT COUNT(*) FROM events e WHERE e.photographer_id = p.id), 0)::INTEGER,
    COALESCE((SELECT COUNT(*) FROM media m JOIN events e ON e.id = m.event_id WHERE e.photographer_id = p.id AND m.deleted_at IS NULL), 0)::INTEGER,
    COALESCE((SELECT SUM(COALESCE(m.file_size, 0)) FROM media m JOIN events e ON e.id = m.event_id WHERE e.photographer_id = p.id AND m.deleted_at IS NULL), 0)::BIGINT,
    1 -- Default to 1 (owner only)
FROM photographers p
ON CONFLICT (photographer_id) DO UPDATE SET
    active_events_count = EXCLUDED.active_events_count,
    total_events_count = EXCLUDED.total_events_count,
    total_photos_count = EXCLUDED.total_photos_count,
    storage_used_bytes = EXCLUDED.storage_used_bytes,
    updated_at = NOW();

-- Then update team members if event_collaborators exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_collaborators') THEN
        UPDATE photographer_usage pu
        SET active_team_members = 1 + COALESCE((
            SELECT COUNT(DISTINCT ec.photographer_id)
            FROM event_collaborators ec
            JOIN events e ON e.id = ec.event_id
            WHERE e.photographer_id = pu.photographer_id
            AND ec.status = 'active'
            AND ec.role != 'owner'
        ), 0);
    END IF;
END $$;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE photographer_usage ENABLE ROW LEVEL SECURITY;

-- Photographers can view their own usage
CREATE POLICY "Photographers can view own usage"
    ON photographer_usage FOR SELECT
    USING (photographer_id = auth.uid());

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE photographer_usage IS 'Real-time usage tracking for plan limit enforcement';
COMMENT ON FUNCTION check_limit IS 'Check if a specific action is allowed based on plan limits';
COMMENT ON FUNCTION check_feature IS 'Check if a specific feature is enabled for the photographer';
COMMENT ON FUNCTION get_usage_summary IS 'Get complete usage summary with limits and percentages';
COMMENT ON FUNCTION increment_face_ops IS 'Safely increment face operations with limit checking';
