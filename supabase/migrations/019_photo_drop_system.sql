-- Photo Drop & Live Event Mode System
-- SRS §6.4-6.5: Real-time notifications during live events

-- ============================================
-- NOTIFICATION QUEUE TABLE
-- ============================================

DO $$ BEGIN
    CREATE TYPE notification_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_channel AS ENUM ('push', 'email', 'sms', 'in_app');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE queue_status AS ENUM ('pending', 'processing', 'sent', 'failed', 'throttled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('attendee', 'photographer')),
    notification_type VARCHAR(50) NOT NULL,
    channel notification_channel NOT NULL DEFAULT 'push',
    priority notification_priority NOT NULL DEFAULT 'normal',
    status queue_status NOT NULL DEFAULT 'pending',
    
    -- Content
    title VARCHAR(255) NOT NULL,
    body TEXT,
    data JSONB DEFAULT '{}',
    
    -- Deep linking
    action_url TEXT,
    
    -- Delivery tracking
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    
    -- Error handling
    attempt_count INTEGER DEFAULT 0,
    last_error TEXT,
    
    -- Metadata
    source_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    source_media_ids UUID[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_queue_user ON notification_queue(user_id);
CREATE INDEX idx_notification_queue_status ON notification_queue(status);
CREATE INDEX idx_notification_queue_scheduled ON notification_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_notification_queue_priority ON notification_queue(priority, scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_notification_queue_event ON notification_queue(source_event_id);

-- ============================================
-- NOTIFICATION THROTTLE LOG
-- Tracks recent notifications to enforce rate limits
-- ============================================

CREATE TABLE IF NOT EXISTS notification_throttle_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    channel notification_channel NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- For aggregation tracking
    photo_count INTEGER DEFAULT 0,
    match_count INTEGER DEFAULT 0
);

CREATE INDEX idx_throttle_log_user_event ON notification_throttle_log(user_id, event_id, notification_type);
CREATE INDEX idx_throttle_log_sent ON notification_throttle_log(sent_at);

-- ============================================
-- PHOTO DROP MATCHES TABLE
-- Tracks which attendees matched which photos (for batching)
-- ============================================

CREATE TABLE IF NOT EXISTS photo_drop_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    similarity DECIMAL(5,2) NOT NULL,
    notified BOOLEAN DEFAULT FALSE,
    notification_id UUID REFERENCES notification_queue(id) ON DELETE SET NULL,
    matched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_photo_drop_matches_event ON photo_drop_matches(event_id);
CREATE INDEX idx_photo_drop_matches_attendee ON photo_drop_matches(attendee_id);
CREATE INDEX idx_photo_drop_matches_unnotified ON photo_drop_matches(event_id, attendee_id) WHERE notified = FALSE;
CREATE UNIQUE INDEX idx_photo_drop_matches_unique ON photo_drop_matches(event_id, media_id, attendee_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Check if notification should be throttled
CREATE OR REPLACE FUNCTION should_throttle_notification(
    p_user_id UUID,
    p_event_id UUID,
    p_notification_type VARCHAR(50),
    p_channel notification_channel
)
RETURNS BOOLEAN AS $$
DECLARE
    v_last_sent TIMESTAMPTZ;
    v_throttle_minutes INTEGER;
BEGIN
    -- Get throttle duration based on notification type
    v_throttle_minutes := CASE p_notification_type
        WHEN 'photo_drop' THEN 60        -- Max 1 per hour for photo drop
        WHEN 'photo_drop_live' THEN 5    -- Max 1 per 5 min for live events
        ELSE 30                           -- Default 30 min throttle
    END;
    
    -- Check last notification time
    SELECT MAX(sent_at) INTO v_last_sent
    FROM notification_throttle_log
    WHERE user_id = p_user_id
    AND event_id = p_event_id
    AND notification_type = p_notification_type
    AND channel = p_channel
    AND sent_at > NOW() - (v_throttle_minutes || ' minutes')::INTERVAL;
    
    RETURN v_last_sent IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Get pending photo drops for an attendee (unnotified matches)
CREATE OR REPLACE FUNCTION get_pending_photo_drops(
    p_attendee_id UUID,
    p_event_id UUID DEFAULT NULL
)
RETURNS TABLE(
    event_id UUID,
    event_name VARCHAR(255),
    match_count BIGINT,
    latest_match TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pdm.event_id,
        e.name,
        COUNT(*)::BIGINT as match_count,
        MAX(pdm.matched_at)
    FROM photo_drop_matches pdm
    JOIN events e ON pdm.event_id = e.id
    WHERE pdm.attendee_id = p_attendee_id
    AND pdm.notified = FALSE
    AND (p_event_id IS NULL OR pdm.event_id = p_event_id)
    GROUP BY pdm.event_id, e.name;
END;
$$ LANGUAGE plpgsql;

-- Queue photo drop notification for an attendee
CREATE OR REPLACE FUNCTION queue_photo_drop_notification(
    p_attendee_id UUID,
    p_event_id UUID,
    p_is_live BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
    v_attendee RECORD;
    v_event RECORD;
    v_match_count INTEGER;
    v_notification_type VARCHAR(50);
    v_priority notification_priority;
    v_notification_id UUID;
    v_should_throttle BOOLEAN;
BEGIN
    -- Get attendee and event info
    SELECT * INTO v_attendee FROM attendees WHERE id = p_attendee_id;
    SELECT * INTO v_event FROM events WHERE id = p_event_id;
    
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    
    -- Count unnotified matches
    SELECT COUNT(*) INTO v_match_count
    FROM photo_drop_matches
    WHERE event_id = p_event_id
    AND attendee_id = p_attendee_id
    AND notified = FALSE;
    
    IF v_match_count = 0 THEN
        RETURN NULL;
    END IF;
    
    -- Determine notification type and priority
    v_notification_type := CASE WHEN p_is_live THEN 'photo_drop_live' ELSE 'photo_drop' END;
    v_priority := CASE WHEN p_is_live THEN 'high'::notification_priority ELSE 'normal'::notification_priority END;
    
    -- Check throttling
    v_should_throttle := should_throttle_notification(p_attendee_id, p_event_id, v_notification_type, 'push');
    
    IF v_should_throttle THEN
        -- Update any existing pending notification with new counts instead
        UPDATE notification_queue
        SET 
            data = jsonb_set(data, '{match_count}', v_match_count::TEXT::JSONB),
            body = v_match_count || ' new photos of you at ' || v_event.name
        WHERE user_id = p_attendee_id
        AND source_event_id = p_event_id
        AND notification_type = v_notification_type
        AND status = 'pending'
        RETURNING id INTO v_notification_id;
        
        IF v_notification_id IS NOT NULL THEN
            RETURN v_notification_id;
        END IF;
        
        RETURN NULL; -- Throttled
    END IF;
    
    -- Queue new notification
    INSERT INTO notification_queue (
        user_id,
        user_type,
        notification_type,
        channel,
        priority,
        title,
        body,
        data,
        action_url,
        source_event_id,
        metadata
    )
    VALUES (
        p_attendee_id,
        'attendee',
        v_notification_type,
        'push',
        v_priority,
        '📸 New photos of you!',
        v_match_count || ' new photos at ' || v_event.name,
        jsonb_build_object(
            'event_id', p_event_id,
            'event_name', v_event.name,
            'match_count', v_match_count,
            'is_live', p_is_live
        ),
        '/gallery/events/' || p_event_id || '?filter=matched',
        p_event_id,
        jsonb_build_object('photographer_id', v_event.photographer_id)
    )
    RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

-- Process photo matches after upload and queue notifications
CREATE OR REPLACE FUNCTION process_photo_matches_for_notification(
    p_event_id UUID,
    p_media_ids UUID[]
)
RETURNS INTEGER AS $$
DECLARE
    v_event RECORD;
    v_attendee_id UUID;
    v_notification_count INTEGER := 0;
BEGIN
    -- Get event info
    SELECT * INTO v_event FROM events WHERE id = p_event_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- Queue notifications for each attendee with new matches
    FOR v_attendee_id IN (
        SELECT DISTINCT attendee_id 
        FROM photo_drop_matches 
        WHERE event_id = p_event_id 
        AND media_id = ANY(p_media_ids)
        AND notified = FALSE
    )
    LOOP
        IF queue_photo_drop_notification(v_attendee_id, p_event_id, v_event.live_mode_enabled) IS NOT NULL THEN
            v_notification_count := v_notification_count + 1;
        END IF;
    END LOOP;
    
    RETURN v_notification_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_throttle_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_drop_matches ENABLE ROW LEVEL SECURITY;

-- Users can see their own notifications
CREATE POLICY "Users can view own notifications" ON notification_queue
    FOR SELECT USING (auth.uid() = user_id);

-- Photographers can view event photo matches
CREATE POLICY "Photographers can view event matches" ON photo_drop_matches
    FOR SELECT USING (
        event_id IN (SELECT id FROM events WHERE photographer_id = auth.uid())
    );

-- Attendees can see their own matches
CREATE POLICY "Attendees can view own matches" ON photo_drop_matches
    FOR SELECT USING (auth.uid() = attendee_id);

-- ============================================
-- TRIGGER: Auto-queue notification when match is created
-- ============================================

CREATE OR REPLACE FUNCTION on_photo_match_created()
RETURNS TRIGGER AS $$
BEGIN
    -- This is called after a batch of matches is inserted
    -- The actual notification queueing is done by process_photo_matches_for_notification
    -- which is called after the upload batch completes
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Clean up old throttle logs (keep 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_throttle_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM notification_throttle_log
    WHERE sent_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
