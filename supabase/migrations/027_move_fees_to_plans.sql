-- Migration: 027_move_fees_to_plans
-- Description: Move platform fees and print commissions from platform_settings to subscription_plans

-- ============================================
-- CREATE SUBSCRIPTION_PLANS TABLE IF NOT EXISTS
-- ============================================

CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    features TEXT[] DEFAULT ARRAY[]::TEXT[],
    base_price_usd INTEGER NOT NULL DEFAULT 0, -- in cents
    prices JSONB DEFAULT '{}'::JSONB, -- Currency code -> price in cents
    is_active BOOLEAN DEFAULT TRUE,
    is_popular BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_code ON subscription_plans(code);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active) WHERE is_active = TRUE;

-- Add updated_at trigger
DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER update_subscription_plans_updated_at 
    BEFORE UPDATE ON subscription_plans 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ADD FIELDS TO SUBSCRIPTION_PLANS
-- ============================================

-- Add platform fee fields (percentage and fixed)
ALTER TABLE subscription_plans
    ADD COLUMN IF NOT EXISTS platform_fee_percent DECIMAL(5,2) DEFAULT 20.00,
    ADD COLUMN IF NOT EXISTS platform_fee_fixed INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS platform_fee_type VARCHAR(20) DEFAULT 'percent' CHECK (platform_fee_type IN ('percent', 'fixed', 'both'));

-- Add print commission fields (percentage and fixed)
ALTER TABLE subscription_plans
    ADD COLUMN IF NOT EXISTS print_commission_percent DECIMAL(5,2) DEFAULT 15.00,
    ADD COLUMN IF NOT EXISTS print_commission_fixed INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS print_commission_type VARCHAR(20) DEFAULT 'percent' CHECK (print_commission_type IN ('percent', 'fixed', 'both'));

-- Migrate existing data from platform_settings if subscription_plans exist
DO $$
DECLARE
    v_plan RECORD;
    v_platform_fee_setting TEXT;
    v_print_commission_setting TEXT;
    v_platform_fee_value INTEGER;
    v_print_commission_value INTEGER;
BEGIN
    -- Update existing plans with default values from platform_settings
    FOR v_plan IN SELECT code FROM subscription_plans LOOP
        -- Get platform fee from platform_settings
        SELECT setting_value INTO v_platform_fee_setting
        FROM platform_settings
        WHERE setting_key = 'platform_fee_' || v_plan.code
        LIMIT 1;
        
        -- Get print commission from platform_settings
        SELECT setting_value INTO v_print_commission_setting
        FROM platform_settings
        WHERE setting_key = 'print_commission_' || v_plan.code
        LIMIT 1;
        
        -- Convert and update if values exist
        IF v_platform_fee_setting IS NOT NULL THEN
            v_platform_fee_value := v_platform_fee_setting::INTEGER;
            -- Convert from cents (2000 = 20%) to percentage (20.00)
            IF v_platform_fee_value > 100 THEN
                UPDATE subscription_plans
                SET platform_fee_percent = (v_platform_fee_value::DECIMAL / 100)
                WHERE code = v_plan.code;
            ELSE
                UPDATE subscription_plans
                SET platform_fee_percent = v_platform_fee_value::DECIMAL
                WHERE code = v_plan.code;
            END IF;
        END IF;
        
        IF v_print_commission_setting IS NOT NULL THEN
            v_print_commission_value := v_print_commission_setting::INTEGER;
            -- Convert from cents (1500 = 15%) to percentage (15.00)
            IF v_print_commission_value > 100 THEN
                UPDATE subscription_plans
                SET print_commission_percent = (v_print_commission_value::DECIMAL / 100)
                WHERE code = v_plan.code;
            ELSE
                UPDATE subscription_plans
                SET print_commission_percent = v_print_commission_value::DECIMAL
                WHERE code = v_plan.code;
            END IF;
        END IF;
    END LOOP;
END $$;

-- ============================================
-- REMOVE FEES AND PRINTS FROM PLATFORM_SETTINGS
-- ============================================

-- Delete platform fee settings
DELETE FROM platform_settings
WHERE setting_key IN (
    'platform_fee_free',
    'platform_fee_starter',
    'platform_fee_pro',
    'platform_fee_studio'
);

-- Delete print commission settings
DELETE FROM platform_settings
WHERE setting_key IN (
    'print_commission_free',
    'print_commission_starter',
    'print_commission_pro',
    'print_commission_studio'
);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN subscription_plans.platform_fee_percent IS 'Platform fee percentage (e.g., 20.00 for 20%)';
COMMENT ON COLUMN subscription_plans.platform_fee_fixed IS 'Fixed platform fee in cents';
COMMENT ON COLUMN subscription_plans.platform_fee_type IS 'Fee type: percent, fixed, or both';
COMMENT ON COLUMN subscription_plans.print_commission_percent IS 'Print commission percentage (e.g., 15.00 for 15%)';
COMMENT ON COLUMN subscription_plans.print_commission_fixed IS 'Fixed print commission in cents';
COMMENT ON COLUMN subscription_plans.print_commission_type IS 'Commission type: percent, fixed, or both';
