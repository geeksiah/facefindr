-- Fix Pricing System
-- Migration: 025_fix_pricing_system
-- Description: Add bulk pricing support, fix fee calculations, ensure currency consistency

-- ============================================
-- UPDATE EVENT_PRICING TABLE
-- ============================================

-- Add pricing_type and bulk_tiers columns
ALTER TABLE event_pricing 
    ADD COLUMN IF NOT EXISTS pricing_type VARCHAR(20) DEFAULT 'per_photo' CHECK (pricing_type IN ('free', 'per_photo', 'bulk')),
    ADD COLUMN IF NOT EXISTS bulk_tiers JSONB DEFAULT NULL;

-- Add constraint to ensure bulk_tiers is provided when pricing_type is 'bulk'
-- Note: This will be validated in application layer as JSONB constraints are complex

-- Update existing records to have pricing_type
UPDATE event_pricing
SET pricing_type = CASE 
    WHEN is_free = TRUE THEN 'free'
    WHEN unlock_all_price IS NOT NULL THEN 'per_photo' -- Has unlock-all
    ELSE 'per_photo'
END
WHERE pricing_type IS NULL;

-- ============================================
-- UPDATE REGION_CONFIG TABLE
-- ============================================

-- Add missing fee columns if they don't exist
ALTER TABLE region_config
    ADD COLUMN IF NOT EXISTS platform_commission_percent DECIMAL(5,2) DEFAULT 15.00,
    ADD COLUMN IF NOT EXISTS transaction_fee_percent DECIMAL(5,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS transaction_fee_fixed INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payout_minimum_threshold INTEGER DEFAULT 5000,
    ADD COLUMN IF NOT EXISTS payout_fee_percent DECIMAL(5,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS payout_fee_fixed INTEGER DEFAULT 0;

-- ============================================
-- UPDATE TRANSACTIONS TABLE
-- ============================================

-- Add columns for better tracking
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50) DEFAULT 'stripe',
    ADD COLUMN IF NOT EXISTS transaction_fee INTEGER DEFAULT 0, -- Region-based transaction fee
    ADD COLUMN IF NOT EXISTS provider_fee INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS event_currency VARCHAR(3),
    ADD COLUMN IF NOT EXISTS original_amount INTEGER, -- Amount in event currency before conversion
    ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10,6) DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Update existing transactions with payment_provider if not set
UPDATE transactions
SET payment_provider = 'stripe'
WHERE payment_provider IS NULL;

-- ============================================
-- SUBSCRIPTION PLAN PLATFORM FEES FUNCTION
-- ============================================

-- Function to get platform fee for a photographer based on their plan
CREATE OR REPLACE FUNCTION get_photographer_platform_fee(p_photographer_id UUID, p_region_code VARCHAR DEFAULT NULL)
RETURNS DECIMAL AS $$
DECLARE
    v_plan subscription_plan;
    v_region_fee DECIMAL;
    v_plan_fee DECIMAL;
    v_final_fee DECIMAL;
BEGIN
    -- Get photographer's active subscription plan
    SELECT plan_code INTO v_plan
    FROM subscriptions
    WHERE photographer_id = p_photographer_id
    AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Default to 'free' if no subscription
    v_plan := COALESCE(v_plan, 'free');
    
    -- Get plan-based fee from constants
    v_plan_fee := CASE v_plan
        WHEN 'free' THEN 25.0  -- 25% (but payments disabled)
        WHEN 'starter' THEN 20.0  -- 20%
        WHEN 'pro' THEN 15.0  -- 15%
        WHEN 'studio' THEN 10.0  -- 10%
        ELSE 20.0
    END;
    
    -- Get region commission if region code provided
    IF p_region_code IS NOT NULL THEN
        SELECT platform_commission_percent INTO v_region_fee
        FROM region_config
        WHERE region_code = UPPER(p_region_code)
        AND is_active = TRUE;
    END IF;
    
    -- Use the higher of region fee or plan fee (region can override to be higher, but not lower than plan)
    v_final_fee := GREATEST(COALESCE(v_region_fee, 0), v_plan_fee);
    
    RETURN v_final_fee / 100.0; -- Return as decimal (0.15 for 15%)
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Calculate Transaction Fees
-- ============================================

CREATE OR REPLACE FUNCTION calculate_transaction_fees(
    p_gross_amount INTEGER,
    p_currency VARCHAR(3),
    p_photographer_id UUID,
    p_region_code VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    platform_fee INTEGER,
    transaction_fee INTEGER,
    provider_fee INTEGER,
    net_amount INTEGER,
    fee_breakdown JSONB
) AS $$
DECLARE
    v_platform_fee_rate DECIMAL;
    v_platform_fee INTEGER;
    v_transaction_fee_percent DECIMAL;
    v_transaction_fee_fixed INTEGER;
    v_transaction_fee INTEGER;
    v_provider_fee INTEGER;
    v_stripe_fee_rate DECIMAL;
    v_stripe_fee_fixed INTEGER;
    v_net_amount INTEGER;
    v_breakdown JSONB;
BEGIN
    -- Get platform fee rate
    v_platform_fee_rate := get_photographer_platform_fee(p_photographer_id, p_region_code);
    v_platform_fee := ROUND(p_gross_amount * v_platform_fee_rate);
    
    -- Get transaction fees from region config
    IF p_region_code IS NOT NULL THEN
        SELECT transaction_fee_percent / 100.0, transaction_fee_fixed
        INTO v_transaction_fee_percent, v_transaction_fee_fixed
        FROM region_config
        WHERE region_code = UPPER(p_region_code)
        AND is_active = TRUE;
    END IF;
    
    v_transaction_fee_percent := COALESCE(v_transaction_fee_percent, 0);
    v_transaction_fee_fixed := COALESCE(v_transaction_fee_fixed, 0);
    v_transaction_fee := ROUND(p_gross_amount * v_transaction_fee_percent) + v_transaction_fee_fixed;
    
    -- Calculate Stripe/provider fee based on currency
    -- Stripe fees vary by country and currency
    -- Using approximate rates (should be updated with actual Stripe rates)
    v_stripe_fee_rate := CASE p_currency
        WHEN 'USD' THEN 0.029  -- 2.9%
        WHEN 'EUR' THEN 0.014  -- 1.4%
        WHEN 'GBP' THEN 0.014  -- 1.4%
        WHEN 'GHS' THEN 0.035  -- 3.5% (approximate)
        WHEN 'NGN' THEN 0.035  -- 3.5%
        WHEN 'KES' THEN 0.035  -- 3.5%
        WHEN 'ZAR' THEN 0.035  -- 3.5%
        ELSE 0.029  -- Default to USD rate
    END;
    
    v_stripe_fee_fixed := CASE p_currency
        WHEN 'USD' THEN 30  -- $0.30
        WHEN 'EUR' THEN 25  -- €0.25
        WHEN 'GBP' THEN 20  -- £0.20
        WHEN 'GHS' THEN 150  -- ~₵1.50 (approximate)
        WHEN 'NGN' THEN 1500  -- ~₦15 (approximate)
        WHEN 'KES' THEN 50  -- ~KSh0.50 (approximate)
        WHEN 'ZAR' THEN 300  -- ~R3.00 (approximate)
        ELSE 30
    END;
    
    v_provider_fee := ROUND(p_gross_amount * v_stripe_fee_rate) + v_stripe_fee_fixed;
    
    -- Calculate net amount
    v_net_amount := p_gross_amount - v_platform_fee - v_transaction_fee - v_provider_fee;
    
    -- Ensure net amount is not negative
    IF v_net_amount < 0 THEN
        v_net_amount := 0;
    END IF;
    
    -- Build breakdown
    v_breakdown := jsonb_build_object(
        'platform_fee_rate', v_platform_fee_rate,
        'transaction_fee_rate', v_transaction_fee_percent,
        'transaction_fee_fixed', v_transaction_fee_fixed,
        'provider_fee_rate', v_stripe_fee_rate,
        'provider_fee_fixed', v_stripe_fee_fixed,
        'gross_amount', p_gross_amount,
        'currency', p_currency
    );
    
    RETURN QUERY SELECT 
        v_platform_fee,
        v_transaction_fee,
        v_provider_fee,
        v_net_amount,
        v_breakdown;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Calculate Bulk Pricing
-- ============================================

CREATE OR REPLACE FUNCTION calculate_bulk_price(
    p_event_id UUID,
    p_quantity INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    v_pricing event_pricing%ROWTYPE;
    v_tier JSONB;
    v_price INTEGER;
    v_best_tier_price INTEGER;
    v_best_tier JSONB;
BEGIN
    -- Get event pricing
    SELECT * INTO v_pricing
    FROM event_pricing
    WHERE event_id = p_event_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- If free or per_photo, use price_per_media
    IF v_pricing.is_free OR v_pricing.pricing_type = 'free' THEN
        RETURN 0;
    END IF;
    
    IF v_pricing.pricing_type = 'per_photo' OR v_pricing.pricing_type IS NULL THEN
        RETURN v_pricing.price_per_media * p_quantity;
    END IF;
    
    -- If bulk pricing, find the best tier
    IF v_pricing.pricing_type = 'bulk' AND v_pricing.bulk_tiers IS NOT NULL THEN
        v_best_tier_price := NULL;
        
        -- Iterate through tiers to find the best match
        FOR v_tier IN SELECT * FROM jsonb_array_elements(v_pricing.bulk_tiers)
        LOOP
            -- Check if quantity falls in this tier
            IF (v_tier->>'min_photos')::INTEGER <= p_quantity AND
               ((v_tier->>'max_photos') IS NULL OR (v_tier->>'max_photos')::INTEGER >= p_quantity) THEN
                
                -- Calculate price for this tier
                v_price := ROUND((v_tier->>'price')::DECIMAL / 100.0 * p_quantity);
                
                -- Keep the best (lowest) price
                IF v_best_tier_price IS NULL OR v_price < v_best_tier_price THEN
                    v_best_tier_price := v_price;
                    v_best_tier := v_tier;
                END IF;
            END IF;
        END LOOP;
        
        -- If tier found, return price
        IF v_best_tier_price IS NOT NULL THEN
            RETURN v_best_tier_price;
        END IF;
    END IF;
    
    -- Fallback to per-photo pricing
    RETURN v_pricing.price_per_media * p_quantity;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Validate Bulk Tiers
-- ============================================

CREATE OR REPLACE FUNCTION validate_bulk_tiers(p_tiers JSONB)
RETURNS BOOLEAN AS $$
DECLARE
    v_tier JSONB;
    v_prev_max INTEGER := -1;
    v_tier_count INTEGER;
    v_current_min INTEGER;
    v_current_max INTEGER;
    v_current_price DECIMAL;
    v_prev_price DECIMAL := NULL;
BEGIN
    -- Must be an array
    IF jsonb_typeof(p_tiers) != 'array' THEN
        RETURN FALSE;
    END IF;
    
    v_tier_count := jsonb_array_length(p_tiers);
    
    -- Must have at least one tier
    IF v_tier_count = 0 THEN
        RETURN FALSE;
    END IF;
    
    -- Sort tiers by min_photos (this is a simplification - in reality, should sort in application)
    FOR v_tier IN SELECT * FROM jsonb_array_elements(p_tiers) ORDER BY (value->>'min_photos')::INTEGER
    LOOP
        v_current_min := (v_tier->>'min_photos')::INTEGER;
        v_current_max := CASE 
            WHEN v_tier->>'max_photos' IS NULL THEN NULL
            ELSE (v_tier->>'max_photos')::INTEGER
        END;
        v_current_price := (v_tier->>'price')::DECIMAL;
        
        -- Validate: min_photos must be >= 0
        IF v_current_min < 0 THEN
            RETURN FALSE;
        END IF;
        
        -- Validate: max_photos must be > min_photos (if provided)
        IF v_current_max IS NOT NULL AND v_current_max <= v_current_min THEN
            RETURN FALSE;
        END IF;
        
        -- Validate: tiers must not overlap
        IF v_prev_max >= 0 AND v_current_min <= v_prev_max THEN
            RETURN FALSE;
        END IF;
        
        -- Validate: prices should decrease or stay same with higher quantities (best practice)
        -- But we'll allow any pricing structure
        
        -- Validate: price must be positive
        IF v_current_price <= 0 THEN
            RETURN FALSE;
        END IF;
        
        v_prev_max := COALESCE(v_current_max, 999999);
        v_prev_price := v_current_price;
    END LOOP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: Validate Bulk Tiers on Update
-- ============================================

CREATE OR REPLACE FUNCTION check_bulk_tiers()
RETURNS TRIGGER AS $$
BEGIN
    -- If pricing_type is 'bulk', validate tiers
    IF NEW.pricing_type = 'bulk' THEN
        IF NEW.bulk_tiers IS NULL OR NOT validate_bulk_tiers(NEW.bulk_tiers) THEN
            RAISE EXCEPTION 'Invalid bulk pricing tiers: tiers must be valid, non-overlapping, and properly ordered';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_event_pricing_bulk_tiers ON event_pricing;
CREATE TRIGGER validate_event_pricing_bulk_tiers
    BEFORE INSERT OR UPDATE ON event_pricing
    FOR EACH ROW
    WHEN (NEW.pricing_type = 'bulk')
    EXECUTE FUNCTION check_bulk_tiers();

-- ============================================
-- TRIGGER: Sync currency and currency_code on events
-- ============================================

CREATE OR REPLACE FUNCTION sync_event_currency()
RETURNS TRIGGER AS $$
BEGIN
    -- If currency_code is updated, sync to currency
    IF TG_OP = 'UPDATE' AND NEW.currency_code IS DISTINCT FROM OLD.currency_code THEN
        NEW.currency := NEW.currency_code;
    END IF;
    
    -- If currency is updated, sync to currency_code
    IF TG_OP = 'UPDATE' AND NEW.currency IS DISTINCT FROM OLD.currency THEN
        NEW.currency_code := NEW.currency;
    END IF;
    
    -- On insert, ensure both are set
    IF TG_OP = 'INSERT' THEN
        IF NEW.currency_code IS NOT NULL AND NEW.currency IS NULL THEN
            NEW.currency := NEW.currency_code;
        ELSIF NEW.currency IS NOT NULL AND NEW.currency_code IS NULL THEN
            NEW.currency_code := NEW.currency;
        ELSIF NEW.currency IS NULL AND NEW.currency_code IS NULL THEN
            NEW.currency := 'USD';
            NEW.currency_code := 'USD';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_events_currency ON events;
CREATE TRIGGER sync_events_currency
    BEFORE INSERT OR UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION sync_event_currency();

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_transactions_currency ON transactions(currency);
CREATE INDEX IF NOT EXISTS idx_transactions_event_currency ON transactions(event_currency);
CREATE INDEX IF NOT EXISTS idx_event_pricing_type ON event_pricing(pricing_type);
CREATE INDEX IF NOT EXISTS idx_region_config_active_code ON region_config(is_active, region_code);

-- ============================================
-- ADD CURRENCY_CODE TO EVENTS TABLE
-- ============================================

-- Add currency_code column to events (if it doesn't exist)
-- This is needed because codebase uses currency_code while migration 007 added currency
ALTER TABLE events
    ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3);

-- Sync currency_code with currency (copy currency to currency_code if currency_code is NULL)
UPDATE events
SET currency_code = COALESCE(currency, 'USD')
WHERE currency_code IS NULL;

-- Set default for currency_code
ALTER TABLE events
    ALTER COLUMN currency_code SET DEFAULT 'USD';

-- Ensure both currency and currency_code are set
UPDATE events
SET 
    currency = COALESCE(currency, COALESCE(currency_code, 'USD')),
    currency_code = COALESCE(currency_code, COALESCE(currency, 'USD'))
WHERE currency IS NULL OR currency_code IS NULL;

-- ============================================
-- UPDATE EXISTING DATA
-- ============================================

-- Ensure all events have currency set
UPDATE events
SET currency = COALESCE(currency, 'USD')
WHERE currency IS NULL;

-- Update event_pricing currency to match event
UPDATE event_pricing ep
SET currency = (SELECT COALESCE(e.currency_code, e.currency, 'USD') FROM events e WHERE e.id = ep.event_id)
WHERE currency IS NULL OR currency != (SELECT COALESCE(e.currency_code, e.currency, 'USD') FROM events e WHERE e.id = ep.event_id);
