-- Migration: 048_drop_in_credits
-- Description: Implement Drop-in as pay-as-you-go credits system

-- ============================================
-- ADD DROP-IN CREDITS TO ATTENDEES
-- ============================================

ALTER TABLE attendees 
ADD COLUMN IF NOT EXISTS drop_in_credits INTEGER DEFAULT 0;

-- ============================================
-- DROP-IN CREDIT PACKS (predefined options)
-- ============================================

CREATE TABLE IF NOT EXISTS drop_in_credit_packs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    credits INTEGER NOT NULL,
    price_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    expires_after_days INTEGER, -- NULL = never expires
    is_active BOOLEAN DEFAULT TRUE,
    is_popular BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default credit packs
INSERT INTO drop_in_credit_packs (code, name, description, credits, price_cents, expires_after_days, is_popular, display_order) VALUES
    ('pack_10', 'Starter Pack', '10 Drop-in searches, valid for 1 year', 10, 499, 365, FALSE, 10),
    ('pack_25', 'Value Pack', '25 Drop-in searches, valid for 1 year', 25, 999, 365, TRUE, 20),
    ('pack_50', 'Pro Pack', '50 Drop-in searches with priority support', 50, 1799, 365, FALSE, 30),
    ('pack_100', 'Power Pack', '100 Drop-in searches, never expires', 100, 2999, NULL, FALSE, 40)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- DROP-IN CREDIT PURCHASES
-- ============================================

CREATE TABLE IF NOT EXISTS drop_in_credit_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pack_id UUID REFERENCES drop_in_credit_packs(id),
    credits_purchased INTEGER NOT NULL,
    credits_remaining INTEGER NOT NULL,
    amount_paid INTEGER NOT NULL, -- in cents
    currency VARCHAR(3) DEFAULT 'USD',
    payment_intent_id VARCHAR(255),
    expires_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'active', -- active, expired, exhausted
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_purchases_user ON drop_in_credit_purchases(user_id);
CREATE INDEX idx_credit_purchases_status ON drop_in_credit_purchases(status);

-- ============================================
-- DROP-IN CREDIT USAGE LOG
-- ============================================

CREATE TABLE IF NOT EXISTS drop_in_credit_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    purchase_id UUID REFERENCES drop_in_credit_purchases(id),
    action VARCHAR(100) NOT NULL, -- 'external_search', 'gift_notification', etc.
    credits_used INTEGER DEFAULT 1,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_usage_user ON drop_in_credit_usage(user_id);
CREATE INDEX idx_credit_usage_action ON drop_in_credit_usage(action);

-- ============================================
-- DROP-IN SEARCHES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS drop_in_searches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    search_type VARCHAR(50) NOT NULL, -- 'contacts', 'external'
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    match_count INTEGER DEFAULT 0,
    credits_used INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drop_in_searches_user ON drop_in_searches(user_id);
CREATE INDEX idx_drop_in_searches_status ON drop_in_searches(status);

-- ============================================
-- DROP-IN MATCHES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS drop_in_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    search_id UUID REFERENCES drop_in_searches(id) ON DELETE CASCADE,
    media_id UUID REFERENCES media(id) ON DELETE SET NULL,
    source VARCHAR(50) DEFAULT 'facefindr', -- 'facefindr', 'external'
    external_url TEXT,
    confidence REAL DEFAULT 0.0,
    is_viewed BOOLEAN DEFAULT FALSE,
    is_purchased BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drop_in_matches_user ON drop_in_matches(user_id);
CREATE INDEX idx_drop_in_matches_search ON drop_in_matches(search_id);

-- ============================================
-- FUNCTION: Use Drop-in Credits
-- ============================================

CREATE OR REPLACE FUNCTION use_drop_in_credits(
    p_user_id UUID,
    p_action VARCHAR(100),
    p_credits_needed INTEGER DEFAULT 1,
    p_metadata JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_purchase RECORD;
    v_remaining INTEGER;
BEGIN
    -- Find an active purchase with remaining credits
    SELECT id, credits_remaining, expires_at INTO v_purchase
    FROM drop_in_credit_purchases
    WHERE user_id = p_user_id
      AND status = 'active'
      AND credits_remaining >= p_credits_needed
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY expires_at ASC NULLS LAST, created_at ASC
    LIMIT 1
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Deduct credits
    v_remaining := v_purchase.credits_remaining - p_credits_needed;
    
    UPDATE drop_in_credit_purchases
    SET 
        credits_remaining = v_remaining,
        status = CASE WHEN v_remaining = 0 THEN 'exhausted' ELSE status END,
        updated_at = NOW()
    WHERE id = v_purchase.id;
    
    -- Update total credits on attendee
    UPDATE attendees
    SET drop_in_credits = drop_in_credits - p_credits_needed
    WHERE id = p_user_id;
    
    -- Log usage
    INSERT INTO drop_in_credit_usage (user_id, purchase_id, action, credits_used, metadata)
    VALUES (p_user_id, v_purchase.id, p_action, p_credits_needed, p_metadata);
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Add Drop-in Credits
-- ============================================

CREATE OR REPLACE FUNCTION add_drop_in_credits(
    p_user_id UUID,
    p_pack_code VARCHAR(50),
    p_payment_intent_id VARCHAR(255)
)
RETURNS UUID AS $$
DECLARE
    v_pack RECORD;
    v_purchase_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Get pack details
    SELECT * INTO v_pack
    FROM drop_in_credit_packs
    WHERE code = p_pack_code AND is_active = TRUE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid credit pack code';
    END IF;
    
    -- Calculate expiry
    IF v_pack.expires_after_days IS NOT NULL THEN
        v_expires_at := NOW() + (v_pack.expires_after_days || ' days')::INTERVAL;
    END IF;
    
    -- Create purchase record
    INSERT INTO drop_in_credit_purchases (
        user_id, pack_id, credits_purchased, credits_remaining,
        amount_paid, currency, payment_intent_id, expires_at
    ) VALUES (
        p_user_id, v_pack.id, v_pack.credits, v_pack.credits,
        v_pack.price_cents, v_pack.currency, p_payment_intent_id, v_expires_at
    )
    RETURNING id INTO v_purchase_id;
    
    -- Update total credits on attendee
    UPDATE attendees
    SET drop_in_credits = drop_in_credits + v_pack.credits
    WHERE id = p_user_id;
    
    RETURN v_purchase_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Get Drop-in Credit Balance
-- ============================================

CREATE OR REPLACE FUNCTION get_drop_in_balance(p_user_id UUID)
RETURNS TABLE (
    total_credits INTEGER,
    expiring_soon INTEGER,
    next_expiry TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(credits_remaining), 0)::INTEGER AS total_credits,
        COALESCE(SUM(
            CASE WHEN expires_at IS NOT NULL AND expires_at < NOW() + INTERVAL '30 days'
            THEN credits_remaining ELSE 0 END
        ), 0)::INTEGER AS expiring_soon,
        MIN(CASE WHEN expires_at IS NOT NULL THEN expires_at END) AS next_expiry
    FROM drop_in_credit_purchases
    WHERE user_id = p_user_id
      AND status = 'active'
      AND credits_remaining > 0
      AND (expires_at IS NULL OR expires_at > NOW());
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE drop_in_credit_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE drop_in_credit_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE drop_in_credit_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE drop_in_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE drop_in_matches ENABLE ROW LEVEL SECURITY;

-- Credit packs are readable by all
CREATE POLICY "Credit packs are viewable by all"
    ON drop_in_credit_packs FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

-- Users can only see their own purchases
CREATE POLICY "Users can view own purchases"
    ON drop_in_credit_purchases FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can only see their own usage
CREATE POLICY "Users can view own usage"
    ON drop_in_credit_usage FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can only see their own searches
CREATE POLICY "Users can view own searches"
    ON drop_in_searches FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can create own searches"
    ON drop_in_searches FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Users can only see their own matches
CREATE POLICY "Users can view own matches"
    ON drop_in_matches FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- ============================================
-- CRON JOB: Expire old credit purchases
-- ============================================

-- This would be run as a scheduled job
CREATE OR REPLACE FUNCTION expire_drop_in_credits()
RETURNS void AS $$
BEGIN
    UPDATE drop_in_credit_purchases
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE drop_in_credit_packs IS 'Predefined credit pack options for purchase';
COMMENT ON TABLE drop_in_credit_purchases IS 'User credit purchases with remaining balance';
COMMENT ON TABLE drop_in_credit_usage IS 'Log of credit consumption';
COMMENT ON TABLE drop_in_searches IS 'Drop-in search requests and their status';
COMMENT ON TABLE drop_in_matches IS 'Photos matched via drop-in searches';
COMMENT ON FUNCTION use_drop_in_credits IS 'Consume credits for an action, returns false if insufficient';
COMMENT ON FUNCTION add_drop_in_credits IS 'Add credits from a pack purchase, returns purchase ID';
COMMENT ON FUNCTION get_drop_in_balance IS 'Get user credit balance summary';
