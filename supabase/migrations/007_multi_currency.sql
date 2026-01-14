-- FaceFindr Database Migration
-- Migration: 007_multi_currency
-- Description: Multi-currency support for events, pricing, and user preferences

-- ============================================
-- ADD CURRENCY TO EVENTS
-- ============================================

ALTER TABLE events 
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

-- ============================================
-- USER CURRENCY PREFERENCES
-- ============================================

CREATE TABLE IF NOT EXISTS user_currency_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    
    -- Detected location
    detected_country VARCHAR(2),
    detected_currency VARCHAR(3),
    
    -- User override
    preferred_currency VARCHAR(3),
    
    -- Last updated
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_currency_prefs_user ON user_currency_preferences(user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_user_currency_preferences_updated_at ON user_currency_preferences;
CREATE TRIGGER update_user_currency_preferences_updated_at 
    BEFORE UPDATE ON user_currency_preferences 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SUPPORTED CURRENCIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS supported_currencies (
    code VARCHAR(3) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    symbol_position VARCHAR(10) DEFAULT 'before', -- 'before' or 'after'
    decimal_places INTEGER DEFAULT 2,
    
    -- Countries using this currency
    countries TEXT[] NOT NULL,
    
    -- For display/sorting
    display_order INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert supported currencies
INSERT INTO supported_currencies (code, name, symbol, symbol_position, decimal_places, countries, display_order)
VALUES
    ('USD', 'US Dollar', '$', 'before', 2, ARRAY['US'], 1),
    ('GBP', 'British Pound', '£', 'before', 2, ARRAY['GB'], 2),
    ('EUR', 'Euro', '€', 'before', 2, ARRAY['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'GR'], 3),
    ('GHS', 'Ghanaian Cedi', 'GH₵', 'before', 2, ARRAY['GH'], 10),
    ('NGN', 'Nigerian Naira', '₦', 'before', 0, ARRAY['NG'], 11),
    ('KES', 'Kenyan Shilling', 'KSh', 'before', 0, ARRAY['KE'], 12),
    ('ZAR', 'South African Rand', 'R', 'before', 2, ARRAY['ZA'], 13),
    ('UGX', 'Ugandan Shilling', 'USh', 'before', 0, ARRAY['UG'], 14),
    ('TZS', 'Tanzanian Shilling', 'TSh', 'before', 0, ARRAY['TZ'], 15),
    ('RWF', 'Rwandan Franc', 'FRw', 'before', 0, ARRAY['RW'], 16),
    ('XOF', 'West African CFA', 'CFA', 'after', 0, ARRAY['SN', 'CI', 'BJ', 'BF', 'ML', 'NE', 'TG'], 17),
    ('XAF', 'Central African CFA', 'FCFA', 'after', 0, ARRAY['CM', 'CF', 'TD', 'CG', 'GQ', 'GA'], 18),
    ('CAD', 'Canadian Dollar', 'CA$', 'before', 2, ARRAY['CA'], 4),
    ('AUD', 'Australian Dollar', 'A$', 'before', 2, ARRAY['AU'], 5),
    ('INR', 'Indian Rupee', '₹', 'before', 2, ARRAY['IN'], 20),
    ('AED', 'UAE Dirham', 'AED', 'before', 2, ARRAY['AE'], 21),
    ('SAR', 'Saudi Riyal', 'SAR', 'before', 2, ARRAY['SA'], 22)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    symbol = EXCLUDED.symbol,
    countries = EXCLUDED.countries;

-- ============================================
-- EXCHANGE RATES TABLE (Updated daily via cron)
-- ============================================

CREATE TABLE IF NOT EXISTS exchange_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Rate info
    from_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    to_currency VARCHAR(3) NOT NULL,
    rate DECIMAL(20, 10) NOT NULL,
    
    -- Validity
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    
    -- Source
    source VARCHAR(50) DEFAULT 'manual', -- 'manual', 'openexchange', 'currencyapi'
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(from_currency, to_currency, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies ON exchange_rates(from_currency, to_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_valid ON exchange_rates(valid_until);

-- Insert some baseline rates (USD as base)
INSERT INTO exchange_rates (from_currency, to_currency, rate, source)
VALUES
    ('USD', 'USD', 1.0, 'manual'),
    ('USD', 'GBP', 0.79, 'manual'),
    ('USD', 'EUR', 0.92, 'manual'),
    ('USD', 'GHS', 12.50, 'manual'),
    ('USD', 'NGN', 1550.00, 'manual'),
    ('USD', 'KES', 153.00, 'manual'),
    ('USD', 'ZAR', 18.50, 'manual'),
    ('USD', 'UGX', 3750.00, 'manual'),
    ('USD', 'CAD', 1.36, 'manual'),
    ('USD', 'AUD', 1.53, 'manual'),
    ('USD', 'INR', 83.00, 'manual'),
    ('USD', 'AED', 3.67, 'manual')
ON CONFLICT DO NOTHING;

-- ============================================
-- HELPER FUNCTION: Get currency for country
-- ============================================

CREATE OR REPLACE FUNCTION get_currency_for_country(p_country_code VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_currency VARCHAR;
BEGIN
    SELECT code INTO v_currency
    FROM supported_currencies
    WHERE p_country_code = ANY(countries)
    AND is_active = TRUE
    LIMIT 1;
    
    RETURN COALESCE(v_currency, 'USD');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- HELPER FUNCTION: Convert amount between currencies
-- ============================================

CREATE OR REPLACE FUNCTION convert_currency(
    p_amount INTEGER,
    p_from_currency VARCHAR,
    p_to_currency VARCHAR
)
RETURNS INTEGER AS $$
DECLARE
    v_rate DECIMAL;
    v_converted DECIMAL;
BEGIN
    -- Same currency, no conversion
    IF p_from_currency = p_to_currency THEN
        RETURN p_amount;
    END IF;
    
    -- Get rate from USD to target
    IF p_from_currency = 'USD' THEN
        SELECT rate INTO v_rate
        FROM exchange_rates
        WHERE from_currency = 'USD'
        AND to_currency = p_to_currency
        AND (valid_until IS NULL OR valid_until > NOW())
        ORDER BY valid_from DESC
        LIMIT 1;
    ELSE
        -- Convert through USD
        DECLARE
            v_to_usd DECIMAL;
            v_usd_to_target DECIMAL;
        BEGIN
            -- Get rate from source to USD (inverse)
            SELECT 1.0 / rate INTO v_to_usd
            FROM exchange_rates
            WHERE from_currency = 'USD'
            AND to_currency = p_from_currency
            AND (valid_until IS NULL OR valid_until > NOW())
            ORDER BY valid_from DESC
            LIMIT 1;
            
            -- Get rate from USD to target
            SELECT rate INTO v_usd_to_target
            FROM exchange_rates
            WHERE from_currency = 'USD'
            AND to_currency = p_to_currency
            AND (valid_until IS NULL OR valid_until > NOW())
            ORDER BY valid_from DESC
            LIMIT 1;
            
            v_rate := COALESCE(v_to_usd, 1) * COALESCE(v_usd_to_target, 1);
        END;
    END IF;
    
    v_rate := COALESCE(v_rate, 1);
    v_converted := p_amount * v_rate;
    
    RETURN ROUND(v_converted)::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- HELPER FUNCTION: Format price with currency
-- ============================================

CREATE OR REPLACE FUNCTION format_price(
    p_amount INTEGER,
    p_currency VARCHAR
)
RETURNS TEXT AS $$
DECLARE
    v_symbol VARCHAR;
    v_position VARCHAR;
    v_decimals INTEGER;
    v_formatted TEXT;
BEGIN
    SELECT symbol, symbol_position, decimal_places 
    INTO v_symbol, v_position, v_decimals
    FROM supported_currencies
    WHERE code = p_currency;
    
    v_symbol := COALESCE(v_symbol, p_currency || ' ');
    v_position := COALESCE(v_position, 'before');
    v_decimals := COALESCE(v_decimals, 2);
    
    IF v_decimals = 0 THEN
        v_formatted := TO_CHAR(p_amount / 100, 'FM999,999,999');
    ELSE
        v_formatted := TO_CHAR(p_amount / 100.0, 'FM999,999,999.00');
    END IF;
    
    IF v_position = 'before' THEN
        RETURN v_symbol || v_formatted;
    ELSE
        RETURN v_formatted || ' ' || v_symbol;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- UPDATE EVENT_PRICING TO SUPPORT MULTI-CURRENCY
-- ============================================

-- The event_pricing table already exists, but prices are in the event's currency
-- No schema change needed - just ensure we use event.currency when displaying

-- ============================================
-- UPDATE SUBSCRIPTION PLAN FEATURES FOR MULTI-CURRENCY
-- ============================================

CREATE TABLE IF NOT EXISTS subscription_plan_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_code subscription_plan NOT NULL,
    currency VARCHAR(3) NOT NULL,
    
    -- Pricing in this currency
    monthly_price INTEGER NOT NULL,
    annual_price INTEGER NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(plan_code, currency)
);

-- Insert subscription pricing for different currencies
INSERT INTO subscription_plan_pricing (plan_code, currency, monthly_price, annual_price)
VALUES
    -- USD (base)
    ('free', 'USD', 0, 0),
    ('starter', 'USD', 999, 9588),
    ('pro', 'USD', 2999, 28788),
    ('studio', 'USD', 7999, 76788),
    
    -- GBP
    ('free', 'GBP', 0, 0),
    ('starter', 'GBP', 799, 7668),
    ('pro', 'GBP', 2399, 23028),
    ('studio', 'GBP', 6399, 61428),
    
    -- EUR
    ('free', 'EUR', 0, 0),
    ('starter', 'EUR', 899, 8628),
    ('pro', 'EUR', 2799, 26868),
    ('studio', 'EUR', 7499, 71988),
    
    -- GHS (Ghana - adjusted for purchasing power)
    ('free', 'GHS', 0, 0),
    ('starter', 'GHS', 4999, 47988),
    ('pro', 'GHS', 14999, 143988),
    ('studio', 'GHS', 39999, 383988),
    
    -- NGN (Nigeria - adjusted for purchasing power)
    ('free', 'NGN', 0, 0),
    ('starter', 'NGN', 500000, 4800000),
    ('pro', 'NGN', 1500000, 14400000),
    ('studio', 'NGN', 4000000, 38400000),
    
    -- KES (Kenya)
    ('free', 'KES', 0, 0),
    ('starter', 'KES', 100000, 960000),
    ('pro', 'KES', 300000, 2880000),
    ('studio', 'KES', 800000, 7680000),
    
    -- ZAR (South Africa)
    ('free', 'ZAR', 0, 0),
    ('starter', 'ZAR', 17999, 172788),
    ('pro', 'ZAR', 54999, 527988),
    ('studio', 'ZAR', 144999, 1391988)
ON CONFLICT (plan_code, currency) DO UPDATE SET
    monthly_price = EXCLUDED.monthly_price,
    annual_price = EXCLUDED.annual_price,
    updated_at = NOW();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE user_currency_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE supported_currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plan_pricing ENABLE ROW LEVEL SECURITY;

-- Users can manage their own preferences
CREATE POLICY "Users can manage own currency preferences" 
    ON user_currency_preferences FOR ALL 
    USING (user_id = auth.uid());

-- Everyone can view currencies
CREATE POLICY "Anyone can view currencies" 
    ON supported_currencies FOR SELECT 
    USING (is_active = TRUE);

-- Everyone can view exchange rates
CREATE POLICY "Anyone can view exchange rates" 
    ON exchange_rates FOR SELECT 
    USING (TRUE);

-- Everyone can view subscription pricing
CREATE POLICY "Anyone can view subscription pricing" 
    ON subscription_plan_pricing FOR SELECT 
    USING (TRUE);
