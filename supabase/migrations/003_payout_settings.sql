-- Ferchr Database Migration
-- Migration: 003_payout_settings
-- Description: Photographer payout preferences and admin controls

-- ============================================
-- PAYOUT SETTINGS TABLE (Per photographer)
-- ============================================

CREATE TABLE IF NOT EXISTS payout_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
    
    -- Payout frequency preference
    payout_frequency VARCHAR(20) DEFAULT 'weekly' CHECK (payout_frequency IN ('instant', 'daily', 'weekly', 'monthly', 'manual')),
    
    -- For weekly: 1=Monday, 7=Sunday
    weekly_payout_day INTEGER DEFAULT 1 CHECK (weekly_payout_day BETWEEN 1 AND 7),
    
    -- For monthly: 1-28 (avoid end-of-month issues)
    monthly_payout_day INTEGER DEFAULT 1 CHECK (monthly_payout_day BETWEEN 1 AND 28),
    
    -- Preferred currency for display
    preferred_currency VARCHAR(3) DEFAULT 'USD',
    
    -- Auto-payout enabled (photographer can pause)
    auto_payout_enabled BOOLEAN DEFAULT TRUE,
    
    -- Notification preferences
    notify_on_sale BOOLEAN DEFAULT TRUE,
    notify_on_payout BOOLEAN DEFAULT TRUE,
    notify_on_threshold BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(photographer_id)
);

CREATE INDEX IF NOT EXISTS idx_payout_settings_photographer ON payout_settings(photographer_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_payout_settings_updated_at ON payout_settings;
CREATE TRIGGER update_payout_settings_updated_at 
    BEFORE UPDATE ON payout_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PLATFORM SETTINGS TABLE (Admin controls)
-- ============================================

CREATE TABLE IF NOT EXISTS platform_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    is_public BOOLEAN DEFAULT FALSE,
    updated_by UUID REFERENCES photographers(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_settings_key ON platform_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_platform_settings_category ON platform_settings(category);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_platform_settings_updated_at ON platform_settings;
CREATE TRIGGER update_platform_settings_updated_at 
    BEFORE UPDATE ON platform_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INSERT DEFAULT PLATFORM SETTINGS
-- ============================================

-- Minimum payout amounts by currency
INSERT INTO platform_settings (setting_key, setting_value, description, category) VALUES
('payout_minimums', '{
    "USD": 5000,
    "GHS": 10000,
    "NGN": 500000,
    "KES": 100000,
    "GBP": 4000,
    "EUR": 4500,
    "ZAR": 50000,
    "UGX": 10000000
}', 'Minimum payout amounts by currency (in smallest unit, e.g., cents)', 'payouts')
ON CONFLICT (setting_key) DO NOTHING;

-- Platform fee percentage
INSERT INTO platform_settings (setting_key, setting_value, description, category) VALUES
('platform_fee_percent', '15', 'Platform fee percentage for all transactions', 'payouts')
ON CONFLICT (setting_key) DO NOTHING;

-- Payout schedule enabled
INSERT INTO platform_settings (setting_key, setting_value, description, category) VALUES
('auto_payouts_enabled', 'true', 'Whether automatic payouts are enabled globally', 'payouts')
ON CONFLICT (setting_key) DO NOTHING;

-- Instant payout fee (extra charge for instant payouts)
INSERT INTO platform_settings (setting_key, setting_value, description, category) VALUES
('instant_payout_fee_percent', '1', 'Additional fee percentage for instant payouts', 'payouts')
ON CONFLICT (setting_key) DO NOTHING;

-- Max photos per event
INSERT INTO platform_settings (setting_key, setting_value, description, category) VALUES
('max_photos_per_event', '500', 'Maximum number of photos allowed per event', 'limits')
ON CONFLICT (setting_key) DO NOTHING;

-- Max events per photographer (free tier)
INSERT INTO platform_settings (setting_key, setting_value, description, category) VALUES
('max_events_free_tier', '3', 'Maximum active events for free tier photographers', 'limits')
ON CONFLICT (setting_key) DO NOTHING;

-- Face recognition operations limit
INSERT INTO platform_settings (setting_key, setting_value, description, category) VALUES
('face_ops_per_event', '2000', 'Face recognition operations limit per event', 'limits')
ON CONFLICT (setting_key) DO NOTHING;

-- Supported currencies
INSERT INTO platform_settings (setting_key, setting_value, description, category) VALUES
('supported_currencies', '["USD", "GHS", "NGN", "KES", "GBP", "EUR", "ZAR", "UGX"]', 'List of supported currencies', 'general')
ON CONFLICT (setting_key) DO NOTHING;

-- Photo pricing limits by currency
INSERT INTO platform_settings (setting_key, setting_value, description, category) VALUES
('pricing_limits', '{
    "USD": {"min": 100, "max": 10000, "suggested": 500},
    "GHS": {"min": 500, "max": 50000, "suggested": 2000},
    "NGN": {"min": 5000, "max": 500000, "suggested": 20000},
    "KES": {"min": 1000, "max": 100000, "suggested": 5000}
}', 'Photo pricing limits by currency (min, max, suggested in smallest unit)', 'pricing')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE payout_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Photographers can manage their own payout settings
CREATE POLICY "Photographers can view own payout settings" 
    ON payout_settings FOR SELECT 
    USING (photographer_id = auth.uid());

CREATE POLICY "Photographers can update own payout settings" 
    ON payout_settings FOR UPDATE 
    USING (photographer_id = auth.uid());

CREATE POLICY "Photographers can insert own payout settings" 
    ON payout_settings FOR INSERT 
    WITH CHECK (photographer_id = auth.uid());

-- Platform settings are readable by authenticated users (for public ones)
CREATE POLICY "Anyone can view public platform settings" 
    ON platform_settings FOR SELECT 
    USING (is_public = TRUE);

-- Service role can do anything (for admin operations)
-- Note: Actual admin role check should be implemented in API layer
