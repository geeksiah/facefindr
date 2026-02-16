-- Admin Provider Configuration
-- SMS, Email, Payment providers per region and geo-restriction controls

-- ============================================
-- PROVIDER TYPES
-- ============================================

DO $$ BEGIN
    CREATE TYPE sms_provider AS ENUM (
        'twilio',
        'arkesel',
        'africastalking',
        'termii',
        'vonage',
        'messagebird'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE email_provider AS ENUM (
        'sendgrid',
        'mailgun',
        'ses',
        'postmark',
        'resend',
        'smtp'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_provider_type AS ENUM (
        'stripe',
        'flutterwave',
        'paystack',
        'mtn_momo',
        'vodafone_cash',
        'airteltigo_money',
        'mpesa',
        'paypal'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- REGION CONFIGURATION TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS region_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_code VARCHAR(10) NOT NULL UNIQUE, -- ISO 3166-1 alpha-2 (GH, NG, KE, etc.)
    region_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    launch_date TIMESTAMPTZ,
    
    -- Currency settings
    default_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    supported_currencies TEXT[] DEFAULT ARRAY['USD'],
    
    -- SMS Provider Configuration
    sms_provider sms_provider,
    sms_provider_config JSONB DEFAULT '{}', -- API keys, sender IDs, etc.
    sms_enabled BOOLEAN DEFAULT FALSE,
    
    -- Email Provider Configuration
    email_provider email_provider DEFAULT 'sendgrid',
    email_provider_config JSONB DEFAULT '{}',
    email_enabled BOOLEAN DEFAULT TRUE,
    
    -- Verification Requirements
    phone_verification_enabled BOOLEAN DEFAULT FALSE,
    phone_verification_required BOOLEAN DEFAULT FALSE, -- If false, optional
    email_verification_enabled BOOLEAN DEFAULT TRUE,
    email_verification_required BOOLEAN DEFAULT TRUE,
    
    -- Payment Providers (ordered by priority)
    payment_providers payment_provider_type[] DEFAULT ARRAY['stripe']::payment_provider_type[],
    
    -- Payout Configuration
    payout_providers payment_provider_type[] DEFAULT ARRAY['stripe']::payment_provider_type[],
    payout_minimum INTEGER DEFAULT 5000, -- In smallest currency unit
    instant_payout_enabled BOOLEAN DEFAULT FALSE,
    
    -- Feature flags
    print_orders_enabled BOOLEAN DEFAULT TRUE,
    social_features_enabled BOOLEAN DEFAULT TRUE,
    public_events_enabled BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_region_config_active ON region_config(is_active);
CREATE INDEX IF NOT EXISTS idx_region_config_code ON region_config(region_code);

-- ============================================
-- PAYMENT PROVIDER CREDENTIALS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS payment_provider_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_code VARCHAR(10) NOT NULL,
    provider payment_provider_type NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_test_mode BOOLEAN DEFAULT TRUE,
    
    -- Encrypted credentials (store encrypted in production)
    credentials JSONB NOT NULL DEFAULT '{}',
    -- Example structure:
    -- stripe: { publishable_key, secret_key, webhook_secret }
    -- flutterwave: { public_key, secret_key, encryption_key }
    -- paystack: { public_key, secret_key }
    -- momo: { api_user, api_key, subscription_key, environment }
    
    -- Provider-specific settings
    supported_methods TEXT[] DEFAULT ARRAY['card'], -- card, momo, bank_transfer, etc.
    min_amount INTEGER DEFAULT 100,
    max_amount INTEGER DEFAULT 100000000,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(region_code, provider)
);

CREATE INDEX IF NOT EXISTS idx_payment_creds_region ON payment_provider_credentials(region_code);
CREATE INDEX IF NOT EXISTS idx_payment_creds_provider ON payment_provider_credentials(provider);

-- ============================================
-- SMS PROVIDER PRESETS
-- ============================================

CREATE TABLE IF NOT EXISTS sms_provider_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider sms_provider NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    supported_regions TEXT[] NOT NULL,
    config_schema JSONB NOT NULL, -- JSON Schema for required config fields
    documentation_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert SMS provider presets
INSERT INTO sms_provider_presets (provider, display_name, supported_regions, config_schema, documentation_url) VALUES
(
    'arkesel',
    'Arkesel',
    ARRAY['GH'],
    '{
        "type": "object",
        "required": ["api_key", "sender_id"],
        "properties": {
            "api_key": {"type": "string", "description": "Arkesel API Key"},
            "sender_id": {"type": "string", "description": "Sender ID (max 11 chars)", "maxLength": 11}
        }
    }',
    'https://developers.arkesel.com/'
),
(
    'twilio',
    'Twilio',
    ARRAY['US', 'GB', 'CA', 'AU', 'GH', 'NG', 'KE', 'ZA', 'UG'],
    '{
        "type": "object",
        "required": ["account_sid", "auth_token", "messaging_service_sid"],
        "properties": {
            "account_sid": {"type": "string", "description": "Twilio Account SID"},
            "auth_token": {"type": "string", "description": "Twilio Auth Token"},
            "messaging_service_sid": {"type": "string", "description": "Messaging Service SID"},
            "from_number": {"type": "string", "description": "Fallback phone number"}
        }
    }',
    'https://www.twilio.com/docs/sms'
),
(
    'africastalking',
    'Africa''s Talking',
    ARRAY['GH', 'NG', 'KE', 'UG', 'TZ', 'RW', 'ZA', 'MW', 'ET'],
    '{
        "type": "object",
        "required": ["api_key", "username", "sender_id"],
        "properties": {
            "api_key": {"type": "string", "description": "API Key"},
            "username": {"type": "string", "description": "Username"},
            "sender_id": {"type": "string", "description": "Sender ID"}
        }
    }',
    'https://africastalking.com/sms'
),
(
    'termii',
    'Termii',
    ARRAY['NG', 'GH', 'KE', 'ZA'],
    '{
        "type": "object",
        "required": ["api_key", "sender_id"],
        "properties": {
            "api_key": {"type": "string", "description": "Termii API Key"},
            "sender_id": {"type": "string", "description": "Sender ID"}
        }
    }',
    'https://developers.termii.com/'
),
(
    'vonage',
    'Vonage (Nexmo)',
    ARRAY['US', 'GB', 'CA', 'AU', 'GH', 'NG', 'KE', 'ZA'],
    '{
        "type": "object",
        "required": ["api_key", "api_secret", "from"],
        "properties": {
            "api_key": {"type": "string", "description": "API Key"},
            "api_secret": {"type": "string", "description": "API Secret"},
            "from": {"type": "string", "description": "Sender ID or number"}
        }
    }',
    'https://developer.vonage.com/messaging/sms/overview'
),
(
    'messagebird',
    'MessageBird',
    ARRAY['US', 'GB', 'NL', 'GH', 'NG', 'KE', 'ZA'],
    '{
        "type": "object",
        "required": ["api_key", "originator"],
        "properties": {
            "api_key": {"type": "string", "description": "API Key"},
            "originator": {"type": "string", "description": "Sender name or number"}
        }
    }',
    'https://developers.messagebird.com/api/sms-messaging/'
)
ON CONFLICT (provider) DO NOTHING;

-- ============================================
-- GEO-RESTRICTION CONFIGURATION
-- ============================================

CREATE TABLE IF NOT EXISTS geo_restriction (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Global settings
    restriction_mode VARCHAR(20) NOT NULL DEFAULT 'allowlist', -- 'allowlist' or 'blocklist'
    
    -- Allowed/blocked countries (ISO 3166-1 alpha-2 codes)
    allowed_countries TEXT[] DEFAULT ARRAY['GH']::TEXT[], -- Start with Ghana
    blocked_countries TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Platform-specific overrides
    web_enabled BOOLEAN DEFAULT TRUE,
    mobile_enabled BOOLEAN DEFAULT TRUE,
    
    -- Bypass settings
    allow_vpn BOOLEAN DEFAULT FALSE,
    strict_mode BOOLEAN DEFAULT TRUE, -- Require exact country match
    
    -- Messaging
    restriction_message TEXT DEFAULT 'Ferchr is not yet available in your region. We''re working on expanding to more countries soon!',
    waitlist_enabled BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one row exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_restriction_single ON geo_restriction ((true));

-- Insert default geo restriction
INSERT INTO geo_restriction (restriction_mode, allowed_countries, waitlist_enabled)
VALUES ('allowlist', ARRAY['GH', 'NG', 'KE', 'ZA', 'US', 'GB'], TRUE)
ON CONFLICT DO NOTHING;

-- ============================================
-- WAITLIST TABLE (for restricted regions)
-- ============================================

CREATE TABLE IF NOT EXISTS geo_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    country_code VARCHAR(10) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    notified BOOLEAN DEFAULT FALSE,
    notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(email, country_code)
);

CREATE INDEX IF NOT EXISTS idx_geo_waitlist_country ON geo_waitlist(country_code);
CREATE INDEX IF NOT EXISTS idx_geo_waitlist_notified ON geo_waitlist(notified) WHERE notified = FALSE;

-- ============================================
-- VERIFICATION SETTINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS verification_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Email verification
    email_verification_enabled BOOLEAN DEFAULT TRUE,
    email_verification_required_photographers BOOLEAN DEFAULT TRUE,
    email_verification_required_attendees BOOLEAN DEFAULT FALSE,
    email_verification_expiry_hours INTEGER DEFAULT 24,
    
    -- Phone verification
    phone_verification_enabled BOOLEAN DEFAULT FALSE,
    phone_verification_required_photographers BOOLEAN DEFAULT FALSE,
    phone_verification_required_attendees BOOLEAN DEFAULT FALSE,
    phone_verification_expiry_minutes INTEGER DEFAULT 10,
    phone_verification_max_attempts INTEGER DEFAULT 3,
    phone_verification_cooldown_minutes INTEGER DEFAULT 5,
    
    -- OTP Settings
    otp_length INTEGER DEFAULT 6,
    otp_type VARCHAR(20) DEFAULT 'numeric', -- numeric, alphanumeric
    
    -- Rate limiting
    max_verifications_per_day INTEGER DEFAULT 5,
    
    -- Metadata
    updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one row exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_settings_single ON verification_settings ((true));

-- Insert default verification settings
INSERT INTO verification_settings (
    email_verification_enabled,
    email_verification_required_photographers,
    phone_verification_enabled
)
VALUES (TRUE, TRUE, FALSE)
ON CONFLICT DO NOTHING;

-- ============================================
-- DEFAULT REGION CONFIGURATIONS
-- ============================================

INSERT INTO region_config (
    region_code, region_name, is_active, default_currency, supported_currencies,
    sms_provider, sms_enabled, email_provider, email_enabled,
    phone_verification_enabled, phone_verification_required,
    email_verification_enabled, email_verification_required,
    payment_providers, payout_providers, payout_minimum
) VALUES
-- Ghana (Primary market)
(
    'GH', 'Ghana', TRUE, 'GHS', ARRAY['GHS', 'USD'],
    'arkesel', TRUE, 'sendgrid', TRUE,
    TRUE, FALSE, TRUE, TRUE,
    ARRAY['flutterwave', 'mtn_momo', 'vodafone_cash', 'airteltigo_money']::payment_provider_type[],
    ARRAY['flutterwave', 'mtn_momo']::payment_provider_type[],
    10000 -- GHS 100
),
-- Nigeria
(
    'NG', 'Nigeria', TRUE, 'NGN', ARRAY['NGN', 'USD'],
    'termii', TRUE, 'sendgrid', TRUE,
    TRUE, FALSE, TRUE, TRUE,
    ARRAY['paystack', 'flutterwave']::payment_provider_type[],
    ARRAY['paystack', 'flutterwave']::payment_provider_type[],
    500000 -- NGN 5000
),
-- Kenya
(
    'KE', 'Kenya', FALSE, 'KES', ARRAY['KES', 'USD'],
    'africastalking', FALSE, 'sendgrid', TRUE,
    FALSE, FALSE, TRUE, TRUE,
    ARRAY['flutterwave', 'mpesa']::payment_provider_type[],
    ARRAY['mpesa', 'flutterwave']::payment_provider_type[],
    100000 -- KES 1000
),
-- South Africa
(
    'ZA', 'South Africa', FALSE, 'ZAR', ARRAY['ZAR', 'USD'],
    'twilio', FALSE, 'sendgrid', TRUE,
    FALSE, FALSE, TRUE, TRUE,
    ARRAY['paystack', 'stripe']::payment_provider_type[],
    ARRAY['paystack', 'stripe']::payment_provider_type[],
    50000 -- ZAR 500
),
-- Uganda
(
    'UG', 'Uganda', FALSE, 'UGX', ARRAY['UGX', 'USD'],
    'africastalking', FALSE, 'sendgrid', TRUE,
    FALSE, FALSE, TRUE, TRUE,
    ARRAY['flutterwave']::payment_provider_type[],
    ARRAY['flutterwave']::payment_provider_type[],
    10000000 -- UGX 100,000
),
-- United States
(
    'US', 'United States', TRUE, 'USD', ARRAY['USD'],
    'twilio', TRUE, 'sendgrid', TRUE,
    FALSE, FALSE, TRUE, TRUE,
    ARRAY['stripe', 'paypal']::payment_provider_type[],
    ARRAY['stripe']::payment_provider_type[],
    5000 -- USD 50
),
-- United Kingdom
(
    'GB', 'United Kingdom', TRUE, 'GBP', ARRAY['GBP', 'USD'],
    'twilio', TRUE, 'sendgrid', TRUE,
    FALSE, FALSE, TRUE, TRUE,
    ARRAY['stripe']::payment_provider_type[],
    ARRAY['stripe']::payment_provider_type[],
    4000 -- GBP 40
)
ON CONFLICT (region_code) DO NOTHING;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to get region config for a country
CREATE OR REPLACE FUNCTION get_region_config(p_country_code VARCHAR(10))
RETURNS region_config AS $$
DECLARE
    v_config region_config;
BEGIN
    SELECT * INTO v_config 
    FROM region_config 
    WHERE region_code = UPPER(p_country_code) AND is_active = TRUE;
    
    RETURN v_config;
END;
$$ LANGUAGE plpgsql;

-- Function to check if country is allowed
CREATE OR REPLACE FUNCTION is_country_allowed(p_country_code VARCHAR(10))
RETURNS BOOLEAN AS $$
DECLARE
    v_restriction geo_restriction;
BEGIN
    SELECT * INTO v_restriction FROM geo_restriction LIMIT 1;
    
    IF v_restriction IS NULL THEN
        RETURN TRUE; -- No restrictions configured
    END IF;
    
    IF v_restriction.restriction_mode = 'allowlist' THEN
        RETURN UPPER(p_country_code) = ANY(v_restriction.allowed_countries);
    ELSE
        RETURN NOT (UPPER(p_country_code) = ANY(v_restriction.blocked_countries));
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to add to waitlist
CREATE OR REPLACE FUNCTION add_to_waitlist(
    p_email VARCHAR(255),
    p_country_code VARCHAR(10),
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO geo_waitlist (email, country_code, ip_address, user_agent)
    VALUES (LOWER(p_email), UPPER(p_country_code), p_ip_address, p_user_agent)
    ON CONFLICT (email, country_code) DO UPDATE SET
        ip_address = COALESCE(EXCLUDED.ip_address, geo_waitlist.ip_address),
        user_agent = COALESCE(EXCLUDED.user_agent, geo_waitlist.user_agent)
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

DROP TRIGGER IF EXISTS update_region_config_updated_at ON region_config;
CREATE TRIGGER update_region_config_updated_at
    BEFORE UPDATE ON region_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_creds_updated_at ON payment_provider_credentials;
CREATE TRIGGER update_payment_creds_updated_at
    BEFORE UPDATE ON payment_provider_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_geo_restriction_updated_at ON geo_restriction;
CREATE TRIGGER update_geo_restriction_updated_at
    BEFORE UPDATE ON geo_restriction
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_verification_settings_updated_at ON verification_settings;
CREATE TRIGGER update_verification_settings_updated_at
    BEFORE UPDATE ON verification_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
