-- Ferchr Database Migration
-- Migration: 009_analytics
-- Description: Analytics tracking for views, revenue, and event performance

-- ============================================
-- PAGE/PHOTO VIEWS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS analytics_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- What was viewed
    view_type VARCHAR(50) NOT NULL, -- 'photo', 'event', 'profile', 'gallery'
    
    -- References
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    media_id UUID REFERENCES media(id) ON DELETE CASCADE,
    photographer_id UUID REFERENCES photographers(id) ON DELETE CASCADE,
    
    -- Who viewed (optional - can be anonymous)
    viewer_id UUID,
    viewer_type VARCHAR(20), -- 'photographer', 'attendee', 'anonymous'
    
    -- Client info
    ip_hash VARCHAR(64), -- Hashed IP for unique counting
    user_agent TEXT,
    referrer TEXT,
    
    -- Location
    country_code VARCHAR(2),
    city VARCHAR(100),
    
    -- Device
    device_type VARCHAR(20), -- 'mobile', 'tablet', 'desktop'
    browser VARCHAR(50),
    os VARCHAR(50),
    
    -- Timing
    viewed_at TIMESTAMPTZ DEFAULT NOW(),
    duration_seconds INTEGER, -- How long they viewed
    
    -- Session
    session_id VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_views_event ON analytics_views(event_id);
CREATE INDEX IF NOT EXISTS idx_views_media ON analytics_views(media_id);
CREATE INDEX IF NOT EXISTS idx_views_photographer ON analytics_views(photographer_id);
CREATE INDEX IF NOT EXISTS idx_views_date ON analytics_views(viewed_at);
CREATE INDEX IF NOT EXISTS idx_views_type ON analytics_views(view_type);

-- Partition by month for performance (optional, for large scale)
-- CREATE INDEX IF NOT EXISTS idx_views_month ON analytics_views(DATE_TRUNC('month', viewed_at));

-- ============================================
-- DAILY AGGREGATES (Pre-computed for performance)
-- ============================================

CREATE TABLE IF NOT EXISTS analytics_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Date
    date DATE NOT NULL,
    
    -- Scope
    photographer_id UUID REFERENCES photographers(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    
    -- View counts
    total_views INTEGER DEFAULT 0,
    unique_views INTEGER DEFAULT 0,
    photo_views INTEGER DEFAULT 0,
    event_views INTEGER DEFAULT 0,
    
    -- Engagement
    downloads INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    face_scans INTEGER DEFAULT 0,
    
    -- Revenue (in cents)
    gross_revenue INTEGER DEFAULT 0,
    net_revenue INTEGER DEFAULT 0,
    photo_sales INTEGER DEFAULT 0,
    print_sales INTEGER DEFAULT 0,
    
    -- Traffic sources
    direct_traffic INTEGER DEFAULT 0,
    social_traffic INTEGER DEFAULT 0,
    search_traffic INTEGER DEFAULT 0,
    referral_traffic INTEGER DEFAULT 0,
    
    -- Device breakdown
    mobile_views INTEGER DEFAULT 0,
    desktop_views INTEGER DEFAULT 0,
    tablet_views INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(date, photographer_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_photographer ON analytics_daily(photographer_id);
CREATE INDEX IF NOT EXISTS idx_daily_event ON analytics_daily(event_id);
CREATE INDEX IF NOT EXISTS idx_daily_date ON analytics_daily(date);

-- ============================================
-- REVENUE ANALYTICS
-- ============================================

CREATE TABLE IF NOT EXISTS analytics_revenue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Date
    date DATE NOT NULL,
    
    -- Scope
    photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    
    -- Revenue breakdown
    gross_revenue INTEGER DEFAULT 0,
    platform_fees INTEGER DEFAULT 0,
    net_revenue INTEGER DEFAULT 0,
    
    -- By product type
    digital_revenue INTEGER DEFAULT 0,
    print_revenue INTEGER DEFAULT 0,
    
    -- By resolution
    web_sales INTEGER DEFAULT 0,
    standard_sales INTEGER DEFAULT 0,
    full_sales INTEGER DEFAULT 0,
    raw_sales INTEGER DEFAULT 0,
    
    -- Counts
    transaction_count INTEGER DEFAULT 0,
    unique_buyers INTEGER DEFAULT 0,
    photos_sold INTEGER DEFAULT 0,
    prints_ordered INTEGER DEFAULT 0,
    
    -- Currency
    currency VARCHAR(3) DEFAULT 'USD',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(date, photographer_id, event_id, currency)
);

CREATE INDEX IF NOT EXISTS idx_revenue_photographer ON analytics_revenue(photographer_id);
CREATE INDEX IF NOT EXISTS idx_revenue_date ON analytics_revenue(date);

-- ============================================
-- EVENT PERFORMANCE
-- ============================================

CREATE TABLE IF NOT EXISTS analytics_event_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    -- Last calculated
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Photo stats
    total_photos INTEGER DEFAULT 0,
    photos_with_faces INTEGER DEFAULT 0,
    unique_faces_detected INTEGER DEFAULT 0,
    
    -- Engagement
    total_views INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,
    face_scans INTEGER DEFAULT 0,
    photos_matched INTEGER DEFAULT 0,
    
    -- Conversion
    cart_additions INTEGER DEFAULT 0,
    purchases INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Revenue
    total_revenue INTEGER DEFAULT 0,
    avg_order_value INTEGER DEFAULT 0,
    
    -- Top photos (JSON array of media_ids)
    top_viewed_photos JSONB DEFAULT '[]',
    top_sold_photos JSONB DEFAULT '[]',
    
    -- Traffic sources
    traffic_sources JSONB DEFAULT '{}',
    
    UNIQUE(event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_perf_event ON analytics_event_performance(event_id);

-- ============================================
-- REALTIME COUNTERS (For live dashboards)
-- ============================================

CREATE TABLE IF NOT EXISTS analytics_realtime (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
    
    -- Current period (resets hourly)
    period_start TIMESTAMPTZ NOT NULL,
    
    -- Live counts
    active_viewers INTEGER DEFAULT 0,
    views_this_hour INTEGER DEFAULT 0,
    sales_this_hour INTEGER DEFAULT 0,
    revenue_this_hour INTEGER DEFAULT 0,
    
    -- Today's totals
    views_today INTEGER DEFAULT 0,
    sales_today INTEGER DEFAULT 0,
    revenue_today INTEGER DEFAULT 0,
    
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(photographer_id, period_start)
);

-- Enable realtime for live dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE analytics_realtime;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Record a view
CREATE OR REPLACE FUNCTION record_view(
    p_view_type VARCHAR,
    p_event_id UUID DEFAULT NULL,
    p_media_id UUID DEFAULT NULL,
    p_photographer_id UUID DEFAULT NULL,
    p_viewer_id UUID DEFAULT NULL,
    p_viewer_type VARCHAR DEFAULT 'anonymous',
    p_ip_hash VARCHAR DEFAULT NULL,
    p_country_code VARCHAR DEFAULT NULL,
    p_device_type VARCHAR DEFAULT 'desktop',
    p_session_id VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_photographer_id UUID;
BEGIN
    -- Get photographer_id if not provided
    IF p_photographer_id IS NULL AND p_event_id IS NOT NULL THEN
        SELECT photographer_id INTO v_photographer_id FROM events WHERE id = p_event_id;
    ELSIF p_photographer_id IS NULL AND p_media_id IS NOT NULL THEN
        SELECT e.photographer_id INTO v_photographer_id 
        FROM media m JOIN events e ON m.event_id = e.id 
        WHERE m.id = p_media_id;
    ELSE
        v_photographer_id := p_photographer_id;
    END IF;
    
    -- Insert view record
    INSERT INTO analytics_views (
        view_type, event_id, media_id, photographer_id,
        viewer_id, viewer_type, ip_hash, country_code,
        device_type, session_id
    ) VALUES (
        p_view_type, p_event_id, p_media_id, v_photographer_id,
        p_viewer_id, p_viewer_type, p_ip_hash, p_country_code,
        p_device_type, p_session_id
    )
    RETURNING id INTO v_id;
    
    -- Update daily aggregate
    INSERT INTO analytics_daily (date, photographer_id, event_id, total_views, photo_views, event_views, mobile_views, desktop_views, tablet_views)
    VALUES (
        CURRENT_DATE,
        v_photographer_id,
        p_event_id,
        1,
        CASE WHEN p_view_type = 'photo' THEN 1 ELSE 0 END,
        CASE WHEN p_view_type = 'event' THEN 1 ELSE 0 END,
        CASE WHEN p_device_type = 'mobile' THEN 1 ELSE 0 END,
        CASE WHEN p_device_type = 'desktop' THEN 1 ELSE 0 END,
        CASE WHEN p_device_type = 'tablet' THEN 1 ELSE 0 END
    )
    ON CONFLICT (date, photographer_id, event_id) DO UPDATE SET
        total_views = analytics_daily.total_views + 1,
        photo_views = analytics_daily.photo_views + CASE WHEN p_view_type = 'photo' THEN 1 ELSE 0 END,
        event_views = analytics_daily.event_views + CASE WHEN p_view_type = 'event' THEN 1 ELSE 0 END,
        mobile_views = analytics_daily.mobile_views + CASE WHEN p_device_type = 'mobile' THEN 1 ELSE 0 END,
        desktop_views = analytics_daily.desktop_views + CASE WHEN p_device_type = 'desktop' THEN 1 ELSE 0 END,
        tablet_views = analytics_daily.tablet_views + CASE WHEN p_device_type = 'tablet' THEN 1 ELSE 0 END,
        updated_at = NOW();
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Get photographer dashboard stats
CREATE OR REPLACE FUNCTION get_photographer_stats(
    p_photographer_id UUID,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    total_views BIGINT,
    unique_views BIGINT,
    total_revenue BIGINT,
    total_sales BIGINT,
    total_downloads BIGINT,
    total_events BIGINT,
    total_photos BIGINT,
    avg_views_per_event NUMERIC,
    avg_revenue_per_event NUMERIC,
    conversion_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(d.total_views), 0)::BIGINT as total_views,
        COALESCE(SUM(d.unique_views), 0)::BIGINT as unique_views,
        COALESCE(SUM(d.gross_revenue), 0)::BIGINT as total_revenue,
        COALESCE(SUM(d.photo_sales + d.print_sales), 0)::BIGINT as total_sales,
        COALESCE(SUM(d.downloads), 0)::BIGINT as total_downloads,
        (SELECT COUNT(*) FROM events WHERE photographer_id = p_photographer_id)::BIGINT as total_events,
        (SELECT COUNT(*) FROM media m JOIN events e ON m.event_id = e.id WHERE e.photographer_id = p_photographer_id)::BIGINT as total_photos,
        COALESCE(AVG(d.total_views), 0)::NUMERIC as avg_views_per_event,
        COALESCE(AVG(d.gross_revenue), 0)::NUMERIC as avg_revenue_per_event,
        CASE 
            WHEN SUM(d.total_views) > 0 
            THEN (SUM(d.photo_sales)::NUMERIC / SUM(d.total_views) * 100)
            ELSE 0 
        END as conversion_rate
    FROM analytics_daily d
    WHERE d.photographer_id = p_photographer_id
    AND d.date BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- Get time series data for charts
CREATE OR REPLACE FUNCTION get_analytics_timeseries(
    p_photographer_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_event_id UUID DEFAULT NULL
)
RETURNS TABLE(
    date DATE,
    views INTEGER,
    revenue INTEGER,
    sales INTEGER,
    downloads INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.date,
        d.total_views,
        d.gross_revenue,
        d.photo_sales + d.print_sales,
        d.downloads
    FROM analytics_daily d
    WHERE d.photographer_id = p_photographer_id
    AND d.date BETWEEN p_start_date AND p_end_date
    AND (p_event_id IS NULL OR d.event_id = p_event_id)
    ORDER BY d.date;
END;
$$ LANGUAGE plpgsql;

-- Get top performing events
CREATE OR REPLACE FUNCTION get_top_events(
    p_photographer_id UUID,
    p_limit INTEGER DEFAULT 5,
    p_metric VARCHAR DEFAULT 'views' -- 'views', 'revenue', 'conversion'
)
RETURNS TABLE(
    event_id UUID,
    event_name VARCHAR,
    event_date DATE,
    total_views INTEGER,
    total_revenue INTEGER,
    conversion_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id as event_id,
        e.name as event_name,
        e.event_date::DATE,
        COALESCE(p.total_views, 0) as total_views,
        COALESCE(p.total_revenue, 0) as total_revenue,
        COALESCE(p.conversion_rate, 0) as conversion_rate
    FROM events e
    LEFT JOIN analytics_event_performance p ON e.id = p.event_id
    WHERE e.photographer_id = p_photographer_id
    ORDER BY
        CASE p_metric
            WHEN 'views' THEN COALESCE(p.total_views, 0)
            WHEN 'revenue' THEN COALESCE(p.total_revenue, 0)
            WHEN 'conversion' THEN COALESCE(p.conversion_rate, 0)
            ELSE COALESCE(p.total_views, 0)
        END DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE analytics_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_event_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_realtime ENABLE ROW LEVEL SECURITY;

-- Photographers can view their own analytics
CREATE POLICY "Photographers can view own analytics views" 
    ON analytics_views FOR SELECT 
    USING (photographer_id = auth.uid());

CREATE POLICY "Photographers can view own daily analytics" 
    ON analytics_daily FOR SELECT 
    USING (photographer_id = auth.uid());

CREATE POLICY "Photographers can view own revenue analytics" 
    ON analytics_revenue FOR SELECT 
    USING (photographer_id = auth.uid());

CREATE POLICY "Photographers can view own event performance" 
    ON analytics_event_performance FOR SELECT 
    USING (event_id IN (SELECT id FROM events WHERE photographer_id = auth.uid()));

CREATE POLICY "Photographers can view own realtime analytics" 
    ON analytics_realtime FOR SELECT 
    USING (photographer_id = auth.uid());

-- ============================================
-- CRON JOB FOR AGGREGATION (Run daily)
-- ============================================

-- This would be triggered by a cron job
CREATE OR REPLACE FUNCTION aggregate_daily_analytics()
RETURNS void AS $$
DECLARE
    v_yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
BEGIN
    -- Aggregate views into daily table
    INSERT INTO analytics_daily (
        date, photographer_id, event_id,
        total_views, unique_views, photo_views, event_views,
        mobile_views, desktop_views, tablet_views
    )
    SELECT
        v_yesterday,
        photographer_id,
        event_id,
        COUNT(*) as total_views,
        COUNT(DISTINCT ip_hash) as unique_views,
        COUNT(*) FILTER (WHERE view_type = 'photo') as photo_views,
        COUNT(*) FILTER (WHERE view_type = 'event') as event_views,
        COUNT(*) FILTER (WHERE device_type = 'mobile') as mobile_views,
        COUNT(*) FILTER (WHERE device_type = 'desktop') as desktop_views,
        COUNT(*) FILTER (WHERE device_type = 'tablet') as tablet_views
    FROM analytics_views
    WHERE viewed_at::DATE = v_yesterday
    GROUP BY photographer_id, event_id
    ON CONFLICT (date, photographer_id, event_id) DO UPDATE SET
        total_views = EXCLUDED.total_views,
        unique_views = EXCLUDED.unique_views,
        photo_views = EXCLUDED.photo_views,
        event_views = EXCLUDED.event_views,
        mobile_views = EXCLUDED.mobile_views,
        desktop_views = EXCLUDED.desktop_views,
        tablet_views = EXCLUDED.tablet_views,
        updated_at = NOW();
    
    -- Update event performance
    INSERT INTO analytics_event_performance (event_id, total_photos, total_views, unique_visitors, total_revenue)
    SELECT
        e.id,
        (SELECT COUNT(*) FROM media WHERE event_id = e.id),
        COALESCE(SUM(d.total_views), 0),
        COALESCE(SUM(d.unique_views), 0),
        COALESCE(SUM(d.gross_revenue), 0)
    FROM events e
    LEFT JOIN analytics_daily d ON e.id = d.event_id
    GROUP BY e.id
    ON CONFLICT (event_id) DO UPDATE SET
        total_photos = EXCLUDED.total_photos,
        total_views = EXCLUDED.total_views,
        unique_visitors = EXCLUDED.unique_visitors,
        total_revenue = EXCLUDED.total_revenue,
        calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;
