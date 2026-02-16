-- Ferchr Database Migration
-- Migration: 004_subscription_plans
-- Description: Subscription plans, features, and print products

-- ============================================
-- SUBSCRIPTION PLAN FEATURES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS subscription_plan_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_code subscription_plan NOT NULL,
    
    -- Event Limits
    max_active_events INTEGER NOT NULL,
    max_photos_per_event INTEGER NOT NULL,
    max_face_ops_per_event INTEGER NOT NULL,
    
    -- Storage
    storage_gb INTEGER NOT NULL,
    
    -- Fees
    platform_fee_percent DECIMAL(5,2) NOT NULL,
    
    -- Features (boolean flags)
    custom_watermark BOOLEAN DEFAULT FALSE,
    custom_branding BOOLEAN DEFAULT FALSE,
    live_event_mode BOOLEAN DEFAULT FALSE,
    advanced_analytics BOOLEAN DEFAULT FALSE,
    api_access BOOLEAN DEFAULT FALSE,
    priority_support BOOLEAN DEFAULT FALSE,
    team_members INTEGER DEFAULT 1,
    white_label BOOLEAN DEFAULT FALSE,
    
    -- Print Products
    print_products_enabled BOOLEAN DEFAULT TRUE,
    print_commission_percent DECIMAL(5,2) DEFAULT 20.00,
    
    -- Pricing (in cents, USD)
    monthly_price INTEGER NOT NULL,
    annual_price INTEGER, -- Discounted annual price
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(plan_code)
);

-- Insert default plan features
INSERT INTO subscription_plan_features (
    plan_code,
    max_active_events,
    max_photos_per_event,
    max_face_ops_per_event,
    storage_gb,
    platform_fee_percent,
    custom_watermark,
    custom_branding,
    live_event_mode,
    advanced_analytics,
    api_access,
    priority_support,
    team_members,
    white_label,
    print_products_enabled,
    print_commission_percent,
    monthly_price,
    annual_price
) VALUES
-- FREE: Generous to attract users, higher platform fee for revenue
(
    'free',
    3,          -- 3 active events
    100,        -- 100 photos per event
    500,        -- 500 face ops per event
    5,          -- 5GB storage
    20.00,      -- 20% platform fee (higher = revenue from free users)
    FALSE,      -- No custom watermark
    FALSE,      -- No custom branding
    FALSE,      -- No live event mode
    FALSE,      -- Basic analytics only
    FALSE,      -- No API access
    FALSE,      -- Standard support
    1,          -- Single user
    FALSE,      -- No white label
    TRUE,       -- Print products enabled
    15.00,      -- 15% commission on prints
    0,          -- Free
    0
),
-- STARTER: For growing photographers
(
    'starter',
    10,         -- 10 active events
    500,        -- 500 photos per event
    2000,       -- 2,000 face ops per event
    25,         -- 25GB storage
    15.00,      -- 15% platform fee
    TRUE,       -- Custom watermark
    FALSE,      -- No custom branding
    FALSE,      -- No live event mode
    TRUE,       -- Advanced analytics
    FALSE,      -- No API access
    TRUE,       -- Priority support
    1,          -- Single user
    FALSE,      -- No white label
    TRUE,       -- Print products enabled
    20.00,      -- 20% commission on prints
    999,        -- $9.99/month
    9588        -- $79.90/year (2 months free)
),
-- PRO: For professional photographers
(
    'pro',
    -1,         -- Unlimited events (-1 = unlimited)
    2000,       -- 2,000 photos per event
    10000,      -- 10,000 face ops per event
    100,        -- 100GB storage
    10.00,      -- 10% platform fee
    TRUE,       -- Custom watermark
    TRUE,       -- Custom branding
    TRUE,       -- Live event mode
    TRUE,       -- Advanced analytics
    TRUE,       -- API access
    TRUE,       -- Priority support
    3,          -- Up to 3 team members
    FALSE,      -- No white label
    TRUE,       -- Print products enabled
    25.00,      -- 25% commission on prints
    2999,       -- $29.99/month
    28788       -- $239.90/year (2 months free)
),
-- STUDIO: For photography businesses
(
    'studio',
    -1,         -- Unlimited events
    5000,       -- 5,000 photos per event
    50000,      -- 50,000 face ops per event
    500,        -- 500GB storage
    8.00,       -- 8% platform fee (lowest)
    TRUE,       -- Custom watermark
    TRUE,       -- Custom branding
    TRUE,       -- Live event mode
    TRUE,       -- Advanced analytics
    TRUE,       -- API access
    TRUE,       -- Dedicated support
    10,         -- Up to 10 team members
    TRUE,       -- White label options
    TRUE,       -- Print products enabled
    30.00,      -- 30% commission on prints (highest)
    7999,       -- $79.99/month
    76788       -- $639.90/year (2 months free)
)
ON CONFLICT (plan_code) DO UPDATE SET
    max_active_events = EXCLUDED.max_active_events,
    max_photos_per_event = EXCLUDED.max_photos_per_event,
    max_face_ops_per_event = EXCLUDED.max_face_ops_per_event,
    storage_gb = EXCLUDED.storage_gb,
    platform_fee_percent = EXCLUDED.platform_fee_percent,
    custom_watermark = EXCLUDED.custom_watermark,
    custom_branding = EXCLUDED.custom_branding,
    live_event_mode = EXCLUDED.live_event_mode,
    advanced_analytics = EXCLUDED.advanced_analytics,
    api_access = EXCLUDED.api_access,
    priority_support = EXCLUDED.priority_support,
    team_members = EXCLUDED.team_members,
    white_label = EXCLUDED.white_label,
    print_products_enabled = EXCLUDED.print_products_enabled,
    print_commission_percent = EXCLUDED.print_commission_percent,
    monthly_price = EXCLUDED.monthly_price,
    annual_price = EXCLUDED.annual_price,
    updated_at = NOW();

-- ============================================
-- PRINT PRODUCTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS print_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Product info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'print', 'frame', 'canvas', 'photobook', 'merchandise'
    
    -- Sizing
    size_code VARCHAR(20) NOT NULL, -- e.g., '4x6', '8x10', '16x20'
    width_inches DECIMAL(5,2),
    height_inches DECIMAL(5,2),
    
    -- Pricing (in cents)
    base_cost INTEGER NOT NULL, -- Our cost (production + shipping)
    base_price INTEGER NOT NULL, -- Minimum selling price (cost + our margin)
    suggested_price INTEGER NOT NULL, -- Suggested retail price
    max_price INTEGER, -- Maximum allowed price
    
    -- Photographer commission
    min_photographer_markup INTEGER DEFAULT 0, -- Minimum markup photographer can add
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    available_countries TEXT[], -- Countries where available
    
    -- Fulfillment
    fulfillment_partner VARCHAR(100),
    estimated_production_days INTEGER DEFAULT 3,
    estimated_shipping_days INTEGER DEFAULT 5,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_print_products_category ON print_products(category);
CREATE INDEX IF NOT EXISTS idx_print_products_active ON print_products(is_active) WHERE is_active = TRUE;

-- Insert default print products
INSERT INTO print_products (
    name, description, category, size_code,
    width_inches, height_inches,
    base_cost, base_price, suggested_price, max_price,
    min_photographer_markup,
    available_countries, fulfillment_partner,
    estimated_production_days, estimated_shipping_days
) VALUES
-- Standard Prints
('4x6 Print', 'Classic 4x6 glossy photo print', 'print', '4x6', 4, 6, 150, 299, 499, 999, 0, ARRAY['US', 'GB', 'GH', 'NG', 'KE'], 'PrintPartner', 2, 5),
('5x7 Print', 'Premium 5x7 photo print', 'print', '5x7', 5, 7, 250, 399, 699, 1499, 0, ARRAY['US', 'GB', 'GH', 'NG', 'KE'], 'PrintPartner', 2, 5),
('8x10 Print', 'Large 8x10 photo print', 'print', '8x10', 8, 10, 450, 699, 1299, 2499, 0, ARRAY['US', 'GB', 'GH', 'NG', 'KE'], 'PrintPartner', 2, 5),
('11x14 Print', 'Extra large 11x14 photo print', 'print', '11x14', 11, 14, 750, 1199, 1999, 3999, 0, ARRAY['US', 'GB', 'GH', 'NG', 'KE'], 'PrintPartner', 3, 5),
('16x20 Print', 'Poster size 16x20 photo print', 'print', '16x20', 16, 20, 1200, 1999, 2999, 5999, 0, ARRAY['US', 'GB', 'GH', 'NG', 'KE'], 'PrintPartner', 3, 5),

-- Framed Prints
('4x6 Framed', '4x6 print with black wooden frame', 'frame', '4x6-frame', 4, 6, 800, 1499, 2499, 4999, 0, ARRAY['US', 'GB'], 'FramePartner', 5, 7),
('8x10 Framed', '8x10 print with black wooden frame', 'frame', '8x10-frame', 8, 10, 1500, 2499, 3999, 7999, 0, ARRAY['US', 'GB'], 'FramePartner', 5, 7),
('11x14 Framed', '11x14 print with premium frame', 'frame', '11x14-frame', 11, 14, 2500, 3999, 5999, 9999, 0, ARRAY['US', 'GB'], 'FramePartner', 5, 7),

-- Canvas Prints
('8x10 Canvas', '8x10 gallery wrapped canvas', 'canvas', '8x10-canvas', 8, 10, 2000, 3499, 4999, 8999, 0, ARRAY['US', 'GB'], 'CanvasPartner', 5, 7),
('16x20 Canvas', '16x20 gallery wrapped canvas', 'canvas', '16x20-canvas', 16, 20, 3500, 5999, 7999, 14999, 0, ARRAY['US', 'GB'], 'CanvasPartner', 5, 7),
('24x36 Canvas', '24x36 statement canvas print', 'canvas', '24x36-canvas', 24, 36, 5500, 8999, 12999, 24999, 0, ARRAY['US', 'GB'], 'CanvasPartner', 7, 10)
ON CONFLICT DO NOTHING;

-- ============================================
-- PRINT ORDERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS print_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- References
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE RESTRICT,
    attendee_id UUID REFERENCES attendees(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES print_products(id) ON DELETE RESTRICT,
    
    -- Customer info
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255),
    
    -- Shipping address
    shipping_address JSONB NOT NULL,
    
    -- Pricing breakdown (in cents)
    product_base_price INTEGER NOT NULL,
    photographer_markup INTEGER NOT NULL DEFAULT 0,
    selling_price INTEGER NOT NULL,
    shipping_cost INTEGER NOT NULL DEFAULT 0,
    tax_amount INTEGER NOT NULL DEFAULT 0,
    total_amount INTEGER NOT NULL,
    
    -- Commission breakdown
    platform_share INTEGER NOT NULL, -- Our margin from base price
    photographer_share INTEGER NOT NULL, -- Their markup + commission %
    
    -- Payment
    transaction_id UUID REFERENCES transactions(id),
    payment_status VARCHAR(50) DEFAULT 'pending',
    
    -- Fulfillment
    fulfillment_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, shipped, delivered, cancelled
    fulfillment_partner VARCHAR(100),
    fulfillment_order_id VARCHAR(255),
    tracking_number VARCHAR(255),
    tracking_url TEXT,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_print_orders_photographer ON print_orders(photographer_id);
CREATE INDEX IF NOT EXISTS idx_print_orders_event ON print_orders(event_id);
CREATE INDEX IF NOT EXISTS idx_print_orders_status ON print_orders(status);
CREATE INDEX IF NOT EXISTS idx_print_orders_fulfillment ON print_orders(fulfillment_status);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_print_orders_updated_at ON print_orders;
CREATE TRIGGER update_print_orders_updated_at 
    BEFORE UPDATE ON print_orders 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PHOTOGRAPHER PRINT SETTINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS photographer_print_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
    
    -- Enable/disable print products
    prints_enabled BOOLEAN DEFAULT TRUE,
    
    -- Default markup for each category (in cents)
    default_markup_print INTEGER DEFAULT 0,
    default_markup_frame INTEGER DEFAULT 500,
    default_markup_canvas INTEGER DEFAULT 1000,
    
    -- Product-specific overrides (JSON map of product_id -> markup)
    product_markups JSONB DEFAULT '{}',
    
    -- Enabled products (null = all enabled)
    enabled_products UUID[],
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(photographer_id)
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_photographer_print_settings_updated_at ON photographer_print_settings;
CREATE TRIGGER update_photographer_print_settings_updated_at 
    BEFORE UPDATE ON photographer_print_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE subscription_plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE photographer_print_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can view plan features
CREATE POLICY "Anyone can view plan features" 
    ON subscription_plan_features FOR SELECT 
    USING (TRUE);

-- Everyone can view active print products
CREATE POLICY "Anyone can view active print products" 
    ON print_products FOR SELECT 
    USING (is_active = TRUE);

-- Photographers can view their own orders
CREATE POLICY "Photographers can view own print orders" 
    ON print_orders FOR SELECT 
    USING (photographer_id = auth.uid());

-- Attendees can view their own orders
CREATE POLICY "Attendees can view own print orders" 
    ON print_orders FOR SELECT 
    USING (attendee_id = auth.uid());

-- Photographers can manage their print settings
CREATE POLICY "Photographers can manage print settings" 
    ON photographer_print_settings FOR ALL 
    USING (photographer_id = auth.uid());

-- ============================================
-- HELPER FUNCTION: Get effective platform fee for photographer
-- ============================================

CREATE OR REPLACE FUNCTION get_photographer_platform_fee(p_photographer_id UUID)
RETURNS DECIMAL AS $$
DECLARE
    v_plan_code subscription_plan;
    v_fee DECIMAL;
BEGIN
    -- Get photographer's current plan
    SELECT s.plan_code INTO v_plan_code
    FROM subscriptions s
    WHERE s.photographer_id = p_photographer_id
    AND s.status IN ('active', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1;
    
    -- Default to free if no subscription
    IF v_plan_code IS NULL THEN
        v_plan_code := 'free';
    END IF;
    
    -- Get fee for plan
    SELECT platform_fee_percent INTO v_fee
    FROM subscription_plan_features
    WHERE plan_code = v_plan_code;
    
    RETURN COALESCE(v_fee, 20.00);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- HELPER FUNCTION: Calculate print commission
-- ============================================

CREATE OR REPLACE FUNCTION calculate_print_commission(
    p_photographer_id UUID,
    p_selling_price INTEGER,
    p_base_price INTEGER,
    p_photographer_markup INTEGER
)
RETURNS TABLE(platform_share INTEGER, photographer_share INTEGER) AS $$
DECLARE
    v_plan_code subscription_plan;
    v_commission_percent DECIMAL;
    v_platform_margin INTEGER;
    v_photographer_commission INTEGER;
BEGIN
    -- Get photographer's plan
    SELECT s.plan_code INTO v_plan_code
    FROM subscriptions s
    WHERE s.photographer_id = p_photographer_id
    AND s.status IN ('active', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1;
    
    IF v_plan_code IS NULL THEN
        v_plan_code := 'free';
    END IF;
    
    -- Get commission percent for plan
    SELECT print_commission_percent INTO v_commission_percent
    FROM subscription_plan_features
    WHERE plan_code = v_plan_code;
    
    v_commission_percent := COALESCE(v_commission_percent, 15.00);
    
    -- Platform gets margin from base price (selling_price - base_cost, but we use base_price as minimum)
    v_platform_margin := p_base_price - (p_base_price * 0.6)::INTEGER; -- ~40% platform margin on base
    
    -- Photographer gets their markup + commission on platform margin
    v_photographer_commission := p_photographer_markup + ((v_platform_margin * v_commission_percent / 100))::INTEGER;
    
    -- Adjust platform share
    platform_share := p_selling_price - p_photographer_markup - v_photographer_commission;
    photographer_share := v_photographer_commission + p_photographer_markup;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
