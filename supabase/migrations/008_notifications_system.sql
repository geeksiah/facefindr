-- Ferchr Database Migration
-- Migration: 008_notifications_system
-- Description: Comprehensive notification system with SMS, WhatsApp, Email, OTP verification, and ad placements

-- ============================================
-- NOTIFICATION CHANNELS ENUM
-- ============================================

CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'whatsapp', 'push', 'in_app');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'delivered', 'failed', 'read');
CREATE TYPE verification_type AS ENUM ('email', 'phone');

-- ============================================
-- ADMIN NOTIFICATION SETTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS admin_notification_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Channel toggles
    email_enabled BOOLEAN DEFAULT TRUE,
    sms_enabled BOOLEAN DEFAULT FALSE,
    whatsapp_enabled BOOLEAN DEFAULT FALSE,
    push_enabled BOOLEAN DEFAULT FALSE,
    
    -- Verification settings
    email_verification_enabled BOOLEAN DEFAULT TRUE,
    email_verification_required BOOLEAN DEFAULT FALSE,
    phone_verification_enabled BOOLEAN DEFAULT FALSE,
    phone_verification_required BOOLEAN DEFAULT FALSE,
    
    -- User can choose verification method
    user_can_choose_verification BOOLEAN DEFAULT TRUE,
    
    -- Default channel priority (JSON array)
    channel_priority JSONB DEFAULT '["email", "push", "sms", "whatsapp"]',
    
    -- Rate limiting
    max_sms_per_user_per_day INTEGER DEFAULT 10,
    max_whatsapp_per_user_per_day INTEGER DEFAULT 20,
    max_email_per_user_per_day INTEGER DEFAULT 50,
    
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID
);

-- Insert default settings
INSERT INTO admin_notification_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- ============================================
-- SMS/WHATSAPP PROVIDERS
-- ============================================

CREATE TABLE IF NOT EXISTS messaging_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Provider info
    provider_name VARCHAR(50) NOT NULL, -- 'twilio', 'africas_talking', 'termii', 'messagebird'
    provider_type VARCHAR(20) NOT NULL, -- 'sms', 'whatsapp', 'both'
    display_name VARCHAR(100) NOT NULL,
    
    -- Configuration (encrypted in production)
    config JSONB NOT NULL, -- { api_key, api_secret, sender_id, etc. }
    
    -- Country mapping
    supported_countries TEXT[] NOT NULL,
    is_default_for_countries TEXT[], -- Countries where this is the default
    
    -- Cost tracking
    cost_per_sms DECIMAL(10,4),
    cost_per_whatsapp DECIMAL(10,4),
    cost_currency VARCHAR(3) DEFAULT 'USD',
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default providers (config would be filled by admin)
INSERT INTO messaging_providers (provider_name, provider_type, display_name, supported_countries, is_default_for_countries, config)
VALUES
    ('twilio', 'both', 'Twilio', ARRAY['US', 'GB', 'CA', 'AU'], ARRAY['US', 'GB', 'CA', 'AU'], '{}'),
    ('africas_talking', 'sms', 'Africa''s Talking', ARRAY['GH', 'NG', 'KE', 'UG', 'TZ', 'RW'], ARRAY['GH', 'KE', 'UG', 'TZ', 'RW'], '{}'),
    ('termii', 'sms', 'Termii', ARRAY['NG'], ARRAY['NG'], '{}'),
    ('messagebird', 'whatsapp', 'MessageBird', ARRAY['GH', 'NG', 'KE', 'ZA'], ARRAY['GH', 'NG', 'KE', 'ZA'], '{}')
ON CONFLICT DO NOTHING;

-- ============================================
-- NOTIFICATION TEMPLATES
-- ============================================

CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Template info
    template_code VARCHAR(50) NOT NULL UNIQUE, -- 'photo_drop', 'payout_success', 'order_shipped', etc.
    template_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Category
    category VARCHAR(50) NOT NULL, -- 'transactional', 'marketing', 'system', 'verification'
    
    -- Channel-specific content
    email_subject VARCHAR(255),
    email_body TEXT,
    email_html TEXT,
    
    sms_body VARCHAR(160), -- SMS character limit
    
    whatsapp_template_id VARCHAR(100), -- Pre-approved WhatsApp template
    whatsapp_body TEXT,
    
    push_title VARCHAR(100),
    push_body VARCHAR(255),
    
    -- Variables (JSON array of variable names)
    variables JSONB DEFAULT '[]', -- ['user_name', 'photo_count', 'event_name']
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default templates
INSERT INTO notification_templates (template_code, template_name, description, category, email_subject, email_body, sms_body, push_title, push_body, variables)
VALUES
    -- Photo Drop
    ('photo_drop', 'Photo Drop', 'New photos matching user face', 'transactional',
     'New photos from {{event_name}}!',
     'Hi {{user_name}},\n\nGreat news! {{photo_count}} new photos from {{event_name}} match your face profile.\n\nView them now: {{view_url}}\n\nBest,\nFerchr',
     'Ferchr: {{photo_count}} new photos from {{event_name}} match you! View: {{short_url}}',
     'New Photos!',
     '{{photo_count}} photos from {{event_name}} match your face',
     '["user_name", "event_name", "photo_count", "view_url", "short_url"]'),
    
    -- Payout Success
    ('payout_success', 'Payout Success', 'Photographer payout completed', 'transactional',
     'Payout of {{amount}} sent!',
     'Hi {{user_name}},\n\nYour payout of {{amount}} has been sent to your {{payout_method}}.\n\nTransaction ID: {{transaction_id}}\n\nBest,\nFerchr',
     'Ferchr: Payout of {{amount}} sent to your {{payout_method}}. Ref: {{transaction_id}}',
     'Payout Sent!',
     '{{amount}} has been sent to your account',
     '["user_name", "amount", "payout_method", "transaction_id"]'),
    
    -- Order Shipped
    ('order_shipped', 'Order Shipped', 'Print order has shipped', 'transactional',
     'Your order is on its way!',
     'Hi {{user_name}},\n\nYour order #{{order_number}} has shipped!\n\nTracking: {{tracking_url}}\n\nEstimated delivery: {{delivery_date}}\n\nBest,\nFerchr',
     'Ferchr: Order #{{order_number}} shipped! Track: {{short_url}}',
     'Order Shipped!',
     'Your order #{{order_number}} is on the way',
     '["user_name", "order_number", "tracking_url", "short_url", "delivery_date"]'),
    
    -- Verification OTP
    ('verification_otp', 'Verification OTP', 'Phone/Email verification code', 'verification',
     'Your Ferchr verification code',
     'Your verification code is: {{otp_code}}\n\nThis code expires in {{expiry_minutes}} minutes.\n\nIf you didn''t request this, please ignore this message.',
     'Ferchr: Your verification code is {{otp_code}}. Expires in {{expiry_minutes}} min.',
     'Verification Code',
     'Your code: {{otp_code}}',
     '["otp_code", "expiry_minutes"]'),
    
    -- Event Live
    ('event_live', 'Event Live', 'Event is now accepting photos', 'transactional',
     '{{event_name}} is now live!',
     'Hi {{user_name}},\n\nThe event "{{event_name}}" is now live and accepting photos.\n\nScan your face to find your photos: {{scan_url}}\n\nBest,\nFerchr',
     'Ferchr: {{event_name}} is live! Find your photos: {{short_url}}',
     'Event Live!',
     '{{event_name}} is now accepting photos',
     '["user_name", "event_name", "scan_url", "short_url"]'),
    
    -- Purchase Complete
    ('purchase_complete', 'Purchase Complete', 'Photo purchase confirmation', 'transactional',
     'Your purchase is complete!',
     'Hi {{user_name}},\n\nThank you for your purchase!\n\nOrder: #{{order_number}}\nTotal: {{total_amount}}\n\nDownload your photos: {{download_url}}\n\nBest,\nFerchr',
     'Ferchr: Purchase complete! Order #{{order_number}}. Download: {{short_url}}',
     'Purchase Complete!',
     'Your photos are ready to download',
     '["user_name", "order_number", "total_amount", "download_url", "short_url"]')
ON CONFLICT (template_code) DO UPDATE SET
    template_name = EXCLUDED.template_name,
    email_subject = EXCLUDED.email_subject,
    email_body = EXCLUDED.email_body,
    sms_body = EXCLUDED.sms_body,
    push_title = EXCLUDED.push_title,
    push_body = EXCLUDED.push_body,
    variables = EXCLUDED.variables,
    updated_at = NOW();

-- ============================================
-- USER NOTIFICATION PREFERENCES
-- ============================================

CREATE TABLE IF NOT EXISTS user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    
    -- Channel preferences
    email_enabled BOOLEAN DEFAULT TRUE,
    sms_enabled BOOLEAN DEFAULT FALSE,
    whatsapp_enabled BOOLEAN DEFAULT FALSE,
    push_enabled BOOLEAN DEFAULT TRUE,
    
    -- Category preferences
    photo_drop_enabled BOOLEAN DEFAULT TRUE,
    event_updates_enabled BOOLEAN DEFAULT TRUE,
    order_updates_enabled BOOLEAN DEFAULT TRUE,
    payout_updates_enabled BOOLEAN DEFAULT TRUE,
    marketing_enabled BOOLEAN DEFAULT FALSE,
    
    -- Contact info
    phone_number VARCHAR(20),
    phone_country_code VARCHAR(5),
    phone_verified BOOLEAN DEFAULT FALSE,
    phone_verified_at TIMESTAMPTZ,
    
    whatsapp_number VARCHAR(20),
    whatsapp_opted_in BOOLEAN DEFAULT FALSE,
    whatsapp_opted_in_at TIMESTAMPTZ,
    
    -- Quiet hours
    quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    quiet_hours_timezone VARCHAR(50),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON user_notification_preferences(user_id);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Recipient
    user_id UUID NOT NULL,
    
    -- Template
    template_code VARCHAR(50) NOT NULL,
    
    -- Channel used
    channel notification_channel NOT NULL,
    
    -- Content (rendered from template)
    subject VARCHAR(255),
    body TEXT NOT NULL,
    html_body TEXT,
    
    -- Variables used
    variables JSONB DEFAULT '{}',
    
    -- Status
    status notification_status DEFAULT 'pending',
    
    -- Delivery info
    provider_used VARCHAR(50),
    provider_message_id VARCHAR(255),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    
    -- Retry tracking
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_template ON notifications(template_code);

-- ============================================
-- VERIFICATION CODES (OTP)
-- ============================================

CREATE TABLE IF NOT EXISTS verification_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Who
    user_id UUID,
    email VARCHAR(255),
    phone VARCHAR(20),
    
    -- What
    verification_type verification_type NOT NULL,
    code VARCHAR(10) NOT NULL,
    
    -- When
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    
    -- Attempts
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    
    -- Status
    is_used BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_user ON verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_verification_codes_phone ON verification_codes(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);

-- ============================================
-- AD PLACEMENTS (System Ads)
-- ============================================

CREATE TABLE IF NOT EXISTS ad_placements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Placement info
    placement_code VARCHAR(50) NOT NULL UNIQUE, -- 'dashboard_banner', 'gallery_sidebar', etc.
    placement_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Dimensions
    width INTEGER,
    height INTEGER,
    aspect_ratio VARCHAR(10), -- '16:9', '1:1', etc.
    
    -- Location
    page_path VARCHAR(255), -- '/dashboard', '/gallery', etc.
    position VARCHAR(50), -- 'top', 'sidebar', 'bottom', 'inline'
    
    -- Status
    is_active BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default placements
INSERT INTO ad_placements (placement_code, placement_name, description, page_path, position, width, height)
VALUES
    ('dashboard_banner', 'Dashboard Banner', 'Top banner on photographer dashboard', '/dashboard', 'top', 1200, 100),
    ('dashboard_sidebar', 'Dashboard Sidebar', 'Sidebar ad on dashboard', '/dashboard', 'sidebar', 300, 250),
    ('gallery_banner', 'Gallery Banner', 'Banner on attendee gallery', '/gallery', 'top', 1200, 100),
    ('gallery_inline', 'Gallery Inline', 'Between photo grid rows', '/gallery', 'inline', 600, 100),
    ('checkout_sidebar', 'Checkout Sidebar', 'Sidebar during checkout', '/checkout', 'sidebar', 300, 250),
    ('event_page_banner', 'Event Page Banner', 'Banner on public event pages', '/events/*', 'top', 1200, 150),
    ('settings_inline', 'Settings Inline', 'Inline ad in settings page', '/settings', 'inline', 600, 100),
    ('mobile_bottom_sheet', 'Mobile Bottom Sheet', 'Bottom sheet on mobile', '*', 'bottom', 375, 80)
ON CONFLICT (placement_code) DO UPDATE SET
    placement_name = EXCLUDED.placement_name,
    description = EXCLUDED.description;

-- ============================================
-- AD CAMPAIGNS
-- ============================================

CREATE TABLE IF NOT EXISTS ad_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Campaign info
    campaign_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Content
    headline VARCHAR(100),
    body_text VARCHAR(255),
    image_url TEXT,
    cta_text VARCHAR(50), -- 'Learn More', 'Try Now', etc.
    cta_url TEXT,
    
    -- Styling
    background_color VARCHAR(9),
    text_color VARCHAR(9),
    accent_color VARCHAR(9),
    
    -- Targeting
    target_user_types TEXT[], -- ['photographer', 'attendee']
    target_plans TEXT[], -- ['free', 'starter']
    target_countries TEXT[], -- ['US', 'GH']
    
    -- Placements
    placement_ids UUID[],
    
    -- Schedule
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    
    -- Priority (higher = shown first)
    priority INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT FALSE,
    
    -- Tracking
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_active ON ad_campaigns(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_dates ON ad_campaigns(start_date, end_date);

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- Enable realtime for notifications
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE ad_campaigns;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE admin_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;

-- Users can manage their own preferences
CREATE POLICY "Users can manage own notification preferences" 
    ON user_notification_preferences FOR ALL 
    USING (user_id = auth.uid());

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications" 
    ON notifications FOR SELECT 
    USING (user_id = auth.uid());

-- Users can update read status
CREATE POLICY "Users can update own notification status" 
    ON notifications FOR UPDATE 
    USING (user_id = auth.uid());

-- Users can view their own verification codes
CREATE POLICY "Users can view own verification codes" 
    ON verification_codes FOR SELECT 
    USING (user_id = auth.uid() OR email = auth.email());

-- Everyone can view active ad placements
CREATE POLICY "Anyone can view ad placements" 
    ON ad_placements FOR SELECT 
    USING (is_active = TRUE);

-- Everyone can view active campaigns
CREATE POLICY "Anyone can view active campaigns" 
    ON ad_campaigns FOR SELECT 
    USING (is_active = TRUE AND (start_date IS NULL OR start_date <= NOW()) AND (end_date IS NULL OR end_date >= NOW()));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Generate OTP code
CREATE OR REPLACE FUNCTION generate_otp_code(p_length INTEGER DEFAULT 6)
RETURNS VARCHAR AS $$
DECLARE
    v_code VARCHAR;
BEGIN
    v_code := '';
    FOR i IN 1..p_length LOOP
        v_code := v_code || FLOOR(RANDOM() * 10)::TEXT;
    END LOOP;
    RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Create verification code
CREATE OR REPLACE FUNCTION create_verification_code(
    p_user_id UUID,
    p_type verification_type,
    p_email VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL,
    p_expiry_minutes INTEGER DEFAULT 10
)
RETURNS TABLE(code VARCHAR, expires_at TIMESTAMPTZ) AS $$
DECLARE
    v_code VARCHAR;
    v_expires TIMESTAMPTZ;
BEGIN
    -- Invalidate any existing codes
    UPDATE verification_codes 
    SET is_used = TRUE 
    WHERE (user_id = p_user_id OR email = p_email OR phone = p_phone)
    AND is_used = FALSE 
    AND expires_at > NOW();
    
    -- Generate new code
    v_code := generate_otp_code(6);
    v_expires := NOW() + (p_expiry_minutes || ' minutes')::INTERVAL;
    
    -- Insert new code
    INSERT INTO verification_codes (user_id, email, phone, verification_type, code, expires_at)
    VALUES (p_user_id, p_email, p_phone, p_type, v_code, v_expires);
    
    RETURN QUERY SELECT v_code, v_expires;
END;
$$ LANGUAGE plpgsql;

-- Verify code
CREATE OR REPLACE FUNCTION verify_code(
    p_code VARCHAR,
    p_email VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_record verification_codes%ROWTYPE;
BEGIN
    SELECT * INTO v_record
    FROM verification_codes
    WHERE code = p_code
    AND ((p_email IS NOT NULL AND email = p_email) OR (p_phone IS NOT NULL AND phone = p_phone))
    AND is_used = FALSE
    AND expires_at > NOW()
    AND attempts < max_attempts
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_record.id IS NULL THEN
        -- Increment attempts on any matching record
        UPDATE verification_codes
        SET attempts = attempts + 1
        WHERE ((p_email IS NOT NULL AND email = p_email) OR (p_phone IS NOT NULL AND phone = p_phone))
        AND is_used = FALSE
        AND expires_at > NOW();
        
        RETURN FALSE;
    END IF;
    
    -- Mark as used
    UPDATE verification_codes
    SET is_used = TRUE, verified_at = NOW()
    WHERE id = v_record.id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Get active ad for placement
CREATE OR REPLACE FUNCTION get_active_ad(
    p_placement_code VARCHAR,
    p_user_type VARCHAR DEFAULT NULL,
    p_user_plan VARCHAR DEFAULT NULL,
    p_user_country VARCHAR DEFAULT NULL
)
RETURNS TABLE(
    campaign_id UUID,
    headline VARCHAR,
    body_text VARCHAR,
    image_url TEXT,
    cta_text VARCHAR,
    cta_url TEXT,
    background_color VARCHAR,
    text_color VARCHAR,
    accent_color VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.headline,
        c.body_text,
        c.image_url,
        c.cta_text,
        c.cta_url,
        c.background_color,
        c.text_color,
        c.accent_color
    FROM ad_campaigns c
    JOIN ad_placements p ON p.id = ANY(c.placement_ids)
    WHERE p.placement_code = p_placement_code
    AND p.is_active = TRUE
    AND c.is_active = TRUE
    AND (c.start_date IS NULL OR c.start_date <= NOW())
    AND (c.end_date IS NULL OR c.end_date >= NOW())
    AND (c.target_user_types IS NULL OR p_user_type = ANY(c.target_user_types))
    AND (c.target_plans IS NULL OR p_user_plan = ANY(c.target_plans))
    AND (c.target_countries IS NULL OR p_user_country = ANY(c.target_countries))
    ORDER BY c.priority DESC, RANDOM()
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;
