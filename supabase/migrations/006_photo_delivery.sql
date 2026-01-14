-- FaceFindr Database Migration
-- Migration: 006_photo_delivery
-- Description: Photo delivery system - watermarks, purchases, downloads, entitlements

-- ============================================
-- WATERMARK SETTINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS watermark_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
    
    -- Watermark type
    watermark_type VARCHAR(20) DEFAULT 'text', -- 'text', 'logo', 'both'
    
    -- Text watermark
    text_content VARCHAR(255), -- e.g., "© John Photography"
    text_font VARCHAR(100) DEFAULT 'Arial',
    text_size INTEGER DEFAULT 24, -- in pixels
    text_color VARCHAR(9) DEFAULT '#FFFFFF', -- hex with alpha
    text_opacity DECIMAL(3,2) DEFAULT 0.5, -- 0-1
    
    -- Logo watermark
    logo_url TEXT,
    logo_width INTEGER DEFAULT 150, -- in pixels
    logo_opacity DECIMAL(3,2) DEFAULT 0.5,
    
    -- Positioning
    position VARCHAR(20) DEFAULT 'center', -- 'center', 'bottom-right', 'bottom-left', 'top-right', 'top-left', 'tile'
    margin INTEGER DEFAULT 20, -- pixels from edge
    
    -- Tile pattern (if position = 'tile')
    tile_spacing INTEGER DEFAULT 100,
    tile_angle INTEGER DEFAULT -30, -- rotation in degrees
    
    -- Preview settings
    preview_quality INTEGER DEFAULT 60, -- JPEG quality for previews
    preview_max_dimension INTEGER DEFAULT 1200, -- max width or height
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(photographer_id)
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_watermark_settings_updated_at ON watermark_settings;
CREATE TRIGGER update_watermark_settings_updated_at 
    BEFORE UPDATE ON watermark_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DIGITAL PRODUCTS TABLE (Download packages)
-- ============================================

CREATE TABLE IF NOT EXISTS digital_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Product info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    product_type VARCHAR(50) NOT NULL, -- 'single_photo', 'event_package', 'all_photos'
    
    -- Resolution/Quality
    resolution VARCHAR(20) NOT NULL, -- 'web' (1200px), 'standard' (2400px), 'full' (original), 'raw'
    include_raw BOOLEAN DEFAULT FALSE,
    
    -- Pricing (default, can be overridden per event)
    default_price INTEGER NOT NULL, -- in cents
    
    -- Limits
    download_limit INTEGER, -- null = unlimited
    expiry_days INTEGER DEFAULT 30, -- days after purchase
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default digital products
INSERT INTO digital_products (name, description, product_type, resolution, default_price, download_limit, expiry_days)
VALUES
    ('Web Resolution', 'Perfect for social media (1200px)', 'single_photo', 'web', 299, 5, 30),
    ('Standard Resolution', 'Great for printing up to 8x10 (2400px)', 'single_photo', 'standard', 499, 5, 30),
    ('Full Resolution', 'Original quality for large prints', 'single_photo', 'full', 799, 3, 30),
    ('Full + RAW', 'Original + RAW file for professionals', 'single_photo', 'raw', 1499, 2, 30),
    ('Event Package - Web', 'All your photos from this event (web res)', 'event_package', 'web', 1999, 3, 30),
    ('Event Package - Full', 'All your photos from this event (full res)', 'event_package', 'full', 3999, 2, 30)
ON CONFLICT DO NOTHING;

-- ============================================
-- EVENT PRICING OVERRIDES
-- ============================================

CREATE TABLE IF NOT EXISTS event_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE CASCADE,
    
    -- Override pricing
    price INTEGER NOT NULL, -- in cents
    
    -- Override limits
    download_limit INTEGER,
    
    -- Availability
    is_available BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(event_id, digital_product_id)
);

-- ============================================
-- SHOPPING CART
-- ============================================

CREATE TABLE IF NOT EXISTS cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Who's cart
    attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    
    -- What's in the cart
    media_id UUID REFERENCES media(id) ON DELETE CASCADE, -- null for packages
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE RESTRICT,
    
    -- For print products
    print_product_id UUID REFERENCES print_products(id),
    print_region_id UUID REFERENCES print_regions(id),
    photographer_markup INTEGER DEFAULT 0,
    
    -- Quantity (mainly for prints)
    quantity INTEGER DEFAULT 1,
    
    -- Price at time of adding (may change)
    unit_price INTEGER NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_attendee ON cart_items(attendee_id);

-- ============================================
-- PURCHASES/ORDERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS photo_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Transaction reference
    transaction_id UUID REFERENCES transactions(id),
    order_number VARCHAR(20) NOT NULL UNIQUE,
    
    -- Buyer
    attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE RESTRICT,
    
    -- Seller
    photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE RESTRICT,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    
    -- Totals
    subtotal INTEGER NOT NULL,
    platform_fee INTEGER NOT NULL,
    photographer_amount INTEGER NOT NULL,
    total_amount INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Payment
    payment_provider VARCHAR(50),
    payment_status VARCHAR(50) DEFAULT 'pending', -- pending, succeeded, failed, refunded
    paid_at TIMESTAMPTZ,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- pending, completed, cancelled, refunded
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_attendee ON photo_purchases(attendee_id);
CREATE INDEX IF NOT EXISTS idx_purchases_photographer ON photo_purchases(photographer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_event ON photo_purchases(event_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON photo_purchases(status);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_photo_purchases_updated_at ON photo_purchases;
CREATE TRIGGER update_photo_purchases_updated_at 
    BEFORE UPDATE ON photo_purchases 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PURCHASE ITEMS (Line items in a purchase)
-- ============================================

CREATE TABLE IF NOT EXISTS purchase_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id UUID NOT NULL REFERENCES photo_purchases(id) ON DELETE CASCADE,
    
    -- Item type
    item_type VARCHAR(50) NOT NULL, -- 'digital', 'print'
    
    -- For digital downloads
    media_id UUID REFERENCES media(id) ON DELETE RESTRICT,
    digital_product_id UUID REFERENCES digital_products(id) ON DELETE RESTRICT,
    resolution VARCHAR(20), -- actual resolution purchased
    
    -- For prints
    print_product_id UUID REFERENCES print_products(id),
    print_order_id UUID REFERENCES print_orders(id),
    
    -- Pricing
    quantity INTEGER DEFAULT 1,
    unit_price INTEGER NOT NULL,
    total_price INTEGER NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_media ON purchase_items(media_id);

-- ============================================
-- ENTITLEMENTS (What user can access)
-- ============================================

CREATE TABLE IF NOT EXISTS entitlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Who has access
    attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    
    -- What they can access
    media_id UUID REFERENCES media(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    
    -- Type of access
    entitlement_type VARCHAR(50) NOT NULL, -- 'single_photo', 'event_all', 'gifted', 'free_preview'
    resolution VARCHAR(20) NOT NULL, -- 'web', 'standard', 'full', 'raw'
    include_raw BOOLEAN DEFAULT FALSE,
    
    -- Source
    purchase_id UUID REFERENCES photo_purchases(id) ON DELETE SET NULL,
    gifted_by UUID REFERENCES photographers(id),
    gift_message TEXT,
    
    -- Limits
    download_limit INTEGER, -- null = unlimited
    downloads_used INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entitlements_attendee ON entitlements(attendee_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_media ON entitlements(media_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_event ON entitlements(event_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_active ON entitlements(is_active) WHERE is_active = TRUE;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_entitlements_updated_at ON entitlements;
CREATE TRIGGER update_entitlements_updated_at 
    BEFORE UPDATE ON entitlements 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DOWNLOAD HISTORY
-- ============================================

CREATE TABLE IF NOT EXISTS download_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Who downloaded
    attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    
    -- What was downloaded
    entitlement_id UUID NOT NULL REFERENCES entitlements(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    
    -- Download details
    resolution VARCHAR(20) NOT NULL,
    file_size_bytes BIGINT,
    
    -- Client info
    ip_address INET,
    user_agent TEXT,
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Status
    status VARCHAR(20) DEFAULT 'started' -- started, completed, failed
);

CREATE INDEX IF NOT EXISTS idx_download_history_attendee ON download_history(attendee_id);
CREATE INDEX IF NOT EXISTS idx_download_history_media ON download_history(media_id);
CREATE INDEX IF NOT EXISTS idx_download_history_entitlement ON download_history(entitlement_id);

-- ============================================
-- SECURE DOWNLOAD TOKENS
-- ============================================

CREATE TABLE IF NOT EXISTS download_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Token
    token VARCHAR(64) NOT NULL UNIQUE,
    
    -- What it grants access to
    entitlement_id UUID NOT NULL REFERENCES entitlements(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    resolution VARCHAR(20) NOT NULL,
    
    -- Security
    attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    ip_address INET, -- Optional: lock to IP
    
    -- Validity
    expires_at TIMESTAMPTZ NOT NULL,
    max_uses INTEGER DEFAULT 1,
    uses INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_download_tokens_token ON download_tokens(token);
CREATE INDEX IF NOT EXISTS idx_download_tokens_expires ON download_tokens(expires_at);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Check if attendee has entitlement to a photo
CREATE OR REPLACE FUNCTION check_entitlement(
    p_attendee_id UUID,
    p_media_id UUID,
    p_resolution VARCHAR DEFAULT 'web'
)
RETURNS TABLE(
    has_access BOOLEAN,
    entitlement_id UUID,
    max_resolution VARCHAR,
    downloads_remaining INTEGER,
    expires_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        TRUE as has_access,
        e.id as entitlement_id,
        e.resolution as max_resolution,
        CASE 
            WHEN e.download_limit IS NULL THEN NULL
            ELSE e.download_limit - e.downloads_used
        END as downloads_remaining,
        e.expires_at
    FROM entitlements e
    WHERE e.attendee_id = p_attendee_id
    AND (e.media_id = p_media_id OR e.event_id = (SELECT event_id FROM media WHERE id = p_media_id))
    AND e.is_active = TRUE
    AND (e.expires_at IS NULL OR e.expires_at > NOW())
    AND (e.download_limit IS NULL OR e.downloads_used < e.download_limit)
    AND (
        -- Resolution check: purchased resolution must be >= requested
        CASE p_resolution
            WHEN 'web' THEN TRUE
            WHEN 'standard' THEN e.resolution IN ('standard', 'full', 'raw')
            WHEN 'full' THEN e.resolution IN ('full', 'raw')
            WHEN 'raw' THEN e.resolution = 'raw' AND e.include_raw = TRUE
            ELSE FALSE
        END
    )
    ORDER BY 
        CASE e.resolution
            WHEN 'raw' THEN 4
            WHEN 'full' THEN 3
            WHEN 'standard' THEN 2
            WHEN 'web' THEN 1
            ELSE 0
        END DESC
    LIMIT 1;
    
    -- If no rows returned, return no access
    IF NOT FOUND THEN
        has_access := FALSE;
        entitlement_id := NULL;
        max_resolution := NULL;
        downloads_remaining := NULL;
        expires_at := NULL;
        RETURN NEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR AS $$
DECLARE
    v_number VARCHAR;
    v_exists BOOLEAN;
BEGIN
    LOOP
        -- Format: FF-YYYYMMDD-XXXXX
        v_number := 'FF-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                    UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 5));
        
        -- Check if exists
        SELECT EXISTS(SELECT 1 FROM photo_purchases WHERE order_number = v_number) INTO v_exists;
        
        IF NOT v_exists THEN
            RETURN v_number;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE watermark_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_tokens ENABLE ROW LEVEL SECURITY;

-- Watermark settings: photographers only
CREATE POLICY "Photographers can manage own watermark settings" 
    ON watermark_settings FOR ALL 
    USING (photographer_id = auth.uid());

-- Digital products: everyone can view active
CREATE POLICY "Anyone can view active digital products" 
    ON digital_products FOR SELECT 
    USING (is_active = TRUE);

-- Event pricing: everyone can view available
CREATE POLICY "Anyone can view available event pricing" 
    ON event_pricing FOR SELECT 
    USING (is_available = TRUE);

-- Photographers can manage their event pricing
CREATE POLICY "Photographers can manage own event pricing" 
    ON event_pricing FOR ALL 
    USING (event_id IN (SELECT id FROM events WHERE photographer_id = auth.uid()));

-- Cart: attendees only
CREATE POLICY "Attendees can manage own cart" 
    ON cart_items FOR ALL 
    USING (attendee_id = auth.uid());

-- Purchases: attendees and photographers can view their own
CREATE POLICY "Attendees can view own purchases" 
    ON photo_purchases FOR SELECT 
    USING (attendee_id = auth.uid());

CREATE POLICY "Photographers can view sales" 
    ON photo_purchases FOR SELECT 
    USING (photographer_id = auth.uid());

-- Purchase items: same as purchases
CREATE POLICY "Users can view purchase items for their purchases" 
    ON purchase_items FOR SELECT 
    USING (purchase_id IN (
        SELECT id FROM photo_purchases 
        WHERE attendee_id = auth.uid() OR photographer_id = auth.uid()
    ));

-- Entitlements: attendees only
CREATE POLICY "Attendees can view own entitlements" 
    ON entitlements FOR SELECT 
    USING (attendee_id = auth.uid());

-- Download history: attendees only
CREATE POLICY "Attendees can view own download history" 
    ON download_history FOR SELECT 
    USING (attendee_id = auth.uid());

-- Download tokens: attendees only
CREATE POLICY "Attendees can use own tokens" 
    ON download_tokens FOR SELECT 
    USING (attendee_id = auth.uid());
