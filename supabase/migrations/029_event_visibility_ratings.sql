-- Event Visibility Control and Photographer Ratings
-- Migration: 029_event_visibility_ratings

-- ============================================
-- Add event visibility control for public profiles
-- ============================================
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS include_in_public_profile BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_events_public_profile 
ON events(photographer_id, include_in_public_profile) 
WHERE include_in_public_profile = TRUE;

COMMENT ON COLUMN events.include_in_public_profile IS 'Controls whether this event appears on the photographer''s public profile';

-- ============================================
-- Photographer Ratings System
-- ============================================

-- Ratings table
CREATE TABLE IF NOT EXISTS photographer_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
    attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    
    -- Rating (1-5 stars)
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    
    -- Optional review text
    review_text TEXT,
    
    -- Metadata
    is_verified BOOLEAN DEFAULT FALSE, -- True if attendee actually purchased/downloaded photos
    is_public BOOLEAN DEFAULT TRUE, -- Whether review is visible publicly
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One rating per attendee per photographer (can update)
    UNIQUE(photographer_id, attendee_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ratings_photographer ON photographer_ratings(photographer_id);
CREATE INDEX IF NOT EXISTS idx_ratings_attendee ON photographer_ratings(attendee_id);
CREATE INDEX IF NOT EXISTS idx_ratings_event ON photographer_ratings(event_id);
CREATE INDEX IF NOT EXISTS idx_ratings_public ON photographer_ratings(photographer_id, is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_ratings_verified ON photographer_ratings(photographer_id, is_verified) WHERE is_verified = TRUE;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_photographer_ratings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_photographer_ratings_updated_at ON photographer_ratings;
CREATE TRIGGER update_photographer_ratings_updated_at
    BEFORE UPDATE ON photographer_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_photographer_ratings_updated_at();

-- Function to calculate average rating
CREATE OR REPLACE FUNCTION get_photographer_rating_stats(p_photographer_id UUID)
RETURNS TABLE (
    average_rating DECIMAL(3,2),
    total_ratings INTEGER,
    rating_breakdown JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(ROUND(AVG(rating)::DECIMAL, 2), 0.00)::DECIMAL(3,2) as average_rating,
        COUNT(*)::INTEGER as total_ratings,
        jsonb_object_agg(
            rating::TEXT, 
            count::TEXT
        ) as rating_breakdown
    FROM (
        SELECT 
            rating,
            COUNT(*) as count
        FROM photographer_ratings
        WHERE photographer_id = p_photographer_id
            AND is_public = TRUE
        GROUP BY rating
    ) breakdown
    CROSS JOIN (
        SELECT COUNT(*) as total
        FROM photographer_ratings
        WHERE photographer_id = p_photographer_id
            AND is_public = TRUE
    ) totals;
END;
$$ LANGUAGE plpgsql;

-- Add rating stats to photographers table (computed columns via view or function)
-- We'll use a materialized view for performance
DROP MATERIALIZED VIEW IF EXISTS photographer_rating_stats;

CREATE MATERIALIZED VIEW photographer_rating_stats AS
SELECT 
    p.id as photographer_id,
    COALESCE(ROUND(AVG(r.rating)::DECIMAL, 2), 0.00)::DECIMAL(3,2) as average_rating,
    COUNT(r.id)::INTEGER as total_ratings,
    COUNT(r.id) FILTER (WHERE r.rating = 5)::INTEGER as five_star_count,
    COUNT(r.id) FILTER (WHERE r.rating = 4)::INTEGER as four_star_count,
    COUNT(r.id) FILTER (WHERE r.rating = 3)::INTEGER as three_star_count,
    COUNT(r.id) FILTER (WHERE r.rating = 2)::INTEGER as two_star_count,
    COUNT(r.id) FILTER (WHERE r.rating = 1)::INTEGER as one_star_count
FROM photographers p
LEFT JOIN photographer_ratings r ON r.photographer_id = p.id AND r.is_public = TRUE
GROUP BY p.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rating_stats_photographer ON photographer_rating_stats(photographer_id);

-- Function to refresh rating stats
CREATE OR REPLACE FUNCTION refresh_photographer_rating_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW photographer_rating_stats;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-refresh stats when ratings change
CREATE OR REPLACE FUNCTION trigger_refresh_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM refresh_photographer_rating_stats();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS refresh_rating_stats_on_change ON photographer_ratings;
CREATE TRIGGER refresh_rating_stats_on_change
    AFTER INSERT OR UPDATE OR DELETE ON photographer_ratings
    FOR EACH STATEMENT
    EXECUTE FUNCTION trigger_refresh_rating_stats();

-- ============================================
-- RLS Policies for Ratings
-- ============================================
ALTER TABLE photographer_ratings ENABLE ROW LEVEL SECURITY;

-- Anyone can view public ratings
CREATE POLICY "Public ratings are viewable" ON photographer_ratings
    FOR SELECT
    USING (is_public = TRUE);

-- Attendees can create/update their own ratings
CREATE POLICY "Attendees can manage own ratings" ON photographer_ratings
    FOR ALL
    USING (attendee_id = auth.uid())
    WITH CHECK (attendee_id = auth.uid());

-- Photographers can view all ratings for their profile (including private)
CREATE POLICY "Photographers can view own ratings" ON photographer_ratings
    FOR SELECT
    USING (photographer_id = auth.uid());

-- ============================================
-- Initial refresh of rating stats
-- ============================================
REFRESH MATERIALIZED VIEW photographer_rating_stats;
