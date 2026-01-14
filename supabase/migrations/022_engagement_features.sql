-- Engagement Features
-- SRS §6.6-6.7: Memory resurfacing, reactions, tips

-- ============================================
-- PHOTO REACTIONS
-- ============================================

DO $$ BEGIN
    CREATE TYPE reaction_type AS ENUM ('love', 'fire', 'amazing', 'beautiful');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS photo_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reaction reaction_type NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(media_id, user_id)
);

CREATE INDEX idx_photo_reactions_media ON photo_reactions(media_id);
CREATE INDEX idx_photo_reactions_user ON photo_reactions(user_id);

-- ============================================
-- TIPS
-- ============================================

DO $$ BEGIN
    CREATE TYPE tip_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS tips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    to_photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE RESTRICT,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    media_id UUID REFERENCES media(id) ON DELETE SET NULL,
    
    amount INTEGER NOT NULL, -- In cents
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    
    stripe_payment_intent_id VARCHAR(255),
    status tip_status NOT NULL DEFAULT 'pending',
    
    message TEXT,
    is_anonymous BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tips_from ON tips(from_user_id);
CREATE INDEX idx_tips_to ON tips(to_photographer_id);
CREATE INDEX idx_tips_event ON tips(event_id);
CREATE INDEX idx_tips_status ON tips(status);

-- ============================================
-- MEMORY NOTIFICATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS memory_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    memory_type VARCHAR(50) NOT NULL, -- 'anniversary', 'monthly', etc.
    memory_date DATE NOT NULL,
    
    notification_sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    clicked BOOLEAN DEFAULT FALSE,
    clicked_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memory_notifications_user ON memory_notifications(user_id);
CREATE INDEX idx_memory_notifications_pending ON memory_notifications(memory_date) 
    WHERE notification_sent = FALSE;

-- ============================================
-- FACETAG IMPORTS (for pre-registration)
-- ============================================

CREATE TABLE IF NOT EXISTS facetag_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
    
    face_tag VARCHAR(30) NOT NULL,
    attendee_id UUID REFERENCES attendees(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, matched, invalid
    
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_facetag_imports_event ON facetag_imports(event_id);
CREATE INDEX idx_facetag_imports_status ON facetag_imports(status);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Get reaction counts for a media item
CREATE OR REPLACE FUNCTION get_reaction_counts(p_media_id UUID)
RETURNS TABLE(reaction reaction_type, count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT pr.reaction, COUNT(*)::BIGINT
    FROM photo_reactions pr
    WHERE pr.media_id = p_media_id
    GROUP BY pr.reaction;
END;
$$ LANGUAGE plpgsql;

-- Schedule memory notifications (run daily)
CREATE OR REPLACE FUNCTION schedule_memory_notifications()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_record RECORD;
BEGIN
    -- Find events from exactly 1 year ago
    FOR v_record IN (
        SELECT DISTINCT e.id as event_id, pdm.attendee_id
        FROM events e
        JOIN photo_drop_matches pdm ON pdm.event_id = e.id
        WHERE e.event_date = CURRENT_DATE - INTERVAL '1 year'
        AND NOT EXISTS (
            SELECT 1 FROM memory_notifications mn
            WHERE mn.event_id = e.id 
            AND mn.user_id = pdm.attendee_id
            AND mn.memory_type = 'anniversary'
            AND mn.memory_date = CURRENT_DATE
        )
    )
    LOOP
        INSERT INTO memory_notifications (user_id, event_id, memory_type, memory_date)
        VALUES (v_record.attendee_id, v_record.event_id, 'anniversary', CURRENT_DATE);
        v_count := v_count + 1;
    END LOOP;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE photo_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE facetag_imports ENABLE ROW LEVEL SECURITY;

-- Anyone can see reactions (aggregate)
CREATE POLICY "Anyone can view reactions" ON photo_reactions
    FOR SELECT USING (TRUE);

-- Users can add/remove their own reactions
CREATE POLICY "Users can manage own reactions" ON photo_reactions
    FOR ALL USING (auth.uid() = user_id);

-- Users can view tips they sent
CREATE POLICY "Users can view sent tips" ON tips
    FOR SELECT USING (auth.uid() = from_user_id);

-- Photographers can view received tips
CREATE POLICY "Photographers can view received tips" ON tips
    FOR SELECT USING (auth.uid() = to_photographer_id);

-- Users can view their memory notifications
CREATE POLICY "Users can view own memories" ON memory_notifications
    FOR SELECT USING (auth.uid() = user_id);

-- Photographers can manage FaceTag imports
CREATE POLICY "Photographers can manage imports" ON facetag_imports
    FOR ALL USING (auth.uid() = photographer_id);
