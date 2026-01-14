-- FaceFindr Database Migration
-- Migration: 010_payment_methods
-- Description: User payment methods for subscriptions and purchases

-- ============================================
-- PAYMENT METHODS TABLE
-- ============================================

CREATE TYPE payment_method_type AS ENUM ('card', 'mobile_money', 'paypal', 'bank_account');
CREATE TYPE payment_method_status AS ENUM ('pending_verification', 'verified', 'failed', 'expired');

CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    
    -- Type
    method_type payment_method_type NOT NULL,
    
    -- Display info
    display_name VARCHAR(100), -- "Visa ending in 4242", "MTN MoMo 024***789"
    
    -- Card details (for Stripe)
    stripe_payment_method_id VARCHAR(255),
    card_brand VARCHAR(20), -- visa, mastercard, amex
    card_last_four VARCHAR(4),
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    
    -- Mobile Money details
    mobile_money_provider VARCHAR(50), -- 'mtn_momo', 'vodafone_cash', 'airteltigo_money'
    mobile_money_number VARCHAR(20),
    mobile_money_name VARCHAR(100), -- Account holder name
    mobile_money_verified BOOLEAN DEFAULT FALSE,
    mobile_money_verification_ref VARCHAR(100),
    
    -- PayPal details
    paypal_email VARCHAR(255),
    paypal_payer_id VARCHAR(100),
    
    -- Bank account details (for future)
    bank_name VARCHAR(100),
    bank_account_last_four VARCHAR(4),
    
    -- Status
    status payment_method_status DEFAULT 'pending_verification',
    is_default BOOLEAN DEFAULT FALSE,
    
    -- Billing address (for cards)
    billing_country VARCHAR(2),
    billing_postal_code VARCHAR(20),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    
    UNIQUE(user_id, stripe_payment_method_id),
    UNIQUE(user_id, mobile_money_provider, mobile_money_number)
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON payment_methods(user_id, is_default) WHERE is_default = TRUE;

-- ============================================
-- SUBSCRIPTION SETTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS subscription_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    
    -- Auto-renewal
    auto_renew BOOLEAN DEFAULT TRUE,
    
    -- Default payment method for subscription
    default_payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
    
    -- Reminder settings
    renewal_reminder_days INTEGER DEFAULT 7,
    
    -- Currency preference
    preferred_currency VARCHAR(3) DEFAULT 'USD',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MOBILE MONEY PROVIDERS
-- ============================================

CREATE TABLE IF NOT EXISTS mobile_money_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Provider info
    provider_code VARCHAR(50) NOT NULL UNIQUE, -- 'mtn_momo_gh', 'vodafone_cash_gh'
    provider_name VARCHAR(100) NOT NULL, -- 'MTN Mobile Money'
    
    -- Country
    country_code VARCHAR(2) NOT NULL,
    
    -- Verification
    supports_name_verification BOOLEAN DEFAULT FALSE,
    verification_api VARCHAR(50), -- 'paystack', 'flutterwave', 'hubtel'
    
    -- Number format
    number_prefix VARCHAR(255), -- Comma-separated prefixes like '024,054,055'
    number_length INTEGER DEFAULT 10,
    
    -- Limits
    min_amount INTEGER DEFAULT 100, -- In local currency cents
    max_amount INTEGER DEFAULT 500000,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Ghana mobile money providers
INSERT INTO mobile_money_providers (provider_code, provider_name, country_code, supports_name_verification, verification_api, number_prefix, number_length)
VALUES
    ('mtn_momo_gh', 'MTN Mobile Money', 'GH', TRUE, 'paystack', '024,054,055,059', 10),
    ('vodafone_cash_gh', 'Vodafone Cash', 'GH', TRUE, 'paystack', '020,050', 10),
    ('airteltigo_money_gh', 'AirtelTigo Money', 'GH', TRUE, 'paystack', '026,027,056,057', 10)
ON CONFLICT (provider_code) DO UPDATE SET
    provider_name = EXCLUDED.provider_name,
    supports_name_verification = EXCLUDED.supports_name_verification;

-- Insert Nigeria mobile money providers
INSERT INTO mobile_money_providers (provider_code, provider_name, country_code, supports_name_verification, verification_api, number_prefix)
VALUES
    ('mtn_momo_ng', 'MTN MoMo', 'NG', TRUE, 'paystack', '0803,0806,0703,0706,0813,0816,0810,0814,0903,0906,0913,0916', 11),
    ('opay_ng', 'OPay', 'NG', TRUE, 'paystack', '', 11)
ON CONFLICT (provider_code) DO UPDATE SET
    provider_name = EXCLUDED.provider_name;

-- ============================================
-- MOBILE MONEY VERIFICATION LOGS
-- ============================================

CREATE TABLE IF NOT EXISTS mobile_money_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE CASCADE,
    
    -- Verification details
    phone_number VARCHAR(20) NOT NULL,
    provider_code VARCHAR(50) NOT NULL,
    
    -- Response
    verified BOOLEAN DEFAULT FALSE,
    account_name VARCHAR(100),
    response_data JSONB,
    
    -- Tracking
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_money_verifications ENABLE ROW LEVEL SECURITY;

-- Users can manage their own payment methods
CREATE POLICY "Users can manage own payment methods" 
    ON payment_methods FOR ALL 
    USING (user_id = auth.uid());

-- Users can manage their own subscription settings
CREATE POLICY "Users can manage own subscription settings" 
    ON subscription_settings FOR ALL 
    USING (user_id = auth.uid());

-- Users can view their own verifications
CREATE POLICY "Users can view own verifications" 
    ON mobile_money_verifications FOR SELECT 
    USING (payment_method_id IN (SELECT id FROM payment_methods WHERE user_id = auth.uid()));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Set default payment method (only one can be default)
CREATE OR REPLACE FUNCTION set_default_payment_method(
    p_user_id UUID,
    p_payment_method_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Remove default from all other methods
    UPDATE payment_methods
    SET is_default = FALSE, updated_at = NOW()
    WHERE user_id = p_user_id AND id != p_payment_method_id;
    
    -- Set new default
    UPDATE payment_methods
    SET is_default = TRUE, updated_at = NOW()
    WHERE id = p_payment_method_id AND user_id = p_user_id;
    
    -- Update subscription settings
    UPDATE subscription_settings
    SET default_payment_method_id = p_payment_method_id, updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's default payment method
CREATE OR REPLACE FUNCTION get_default_payment_method(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_method_id UUID;
BEGIN
    SELECT id INTO v_method_id
    FROM payment_methods
    WHERE user_id = p_user_id AND is_default = TRUE AND status = 'verified'
    LIMIT 1;
    
    -- If no default, get most recently used
    IF v_method_id IS NULL THEN
        SELECT id INTO v_method_id
        FROM payment_methods
        WHERE user_id = p_user_id AND status = 'verified'
        ORDER BY last_used_at DESC NULLS LAST, created_at DESC
        LIMIT 1;
    END IF;
    
    RETURN v_method_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
