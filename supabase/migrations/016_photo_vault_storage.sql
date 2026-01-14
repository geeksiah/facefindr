-- Photo Vault & Storage Plans
-- Enables attendees to archive photos with tiered storage monetization

-- ============================================
-- Storage Plans (Admin-configurable)
-- ============================================
CREATE TABLE IF NOT EXISTS storage_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    
    -- Storage limits
    storage_limit_mb INTEGER NOT NULL, -- -1 for unlimited
    photo_limit INTEGER NOT NULL, -- -1 for unlimited
    
    -- Pricing
    price_monthly DECIMAL(10, 2) NOT NULL DEFAULT 0,
    price_yearly DECIMAL(10, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    
    -- Features
    features JSONB DEFAULT '[]'::jsonb,
    -- e.g., ["Download originals", "Create albums", "Share collections", "Priority support"]
    
    -- Display
    is_popular BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- User Storage Subscriptions
-- ============================================
CREATE TABLE IF NOT EXISTS storage_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES storage_plans(id),
    
    -- Billing
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly', -- monthly, yearly
    price_paid DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, cancelled, expired, past_due
    
    -- Dates
    started_at TIMESTAMPTZ DEFAULT NOW(),
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    
    -- Payment provider
    payment_provider VARCHAR(50), -- stripe, flutterwave, paypal
    external_subscription_id VARCHAR(255),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id) -- One active subscription per user
);

-- ============================================
-- Photo Vault (User's archived photos)
-- ============================================
CREATE TABLE IF NOT EXISTS photo_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Source reference (original media)
    media_id UUID REFERENCES media(id) ON DELETE SET NULL,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    
    -- Photo data (if stored in vault)
    file_path VARCHAR(500),
    thumbnail_path VARCHAR(500),
    original_filename VARCHAR(255),
    
    -- File info
    file_size_bytes BIGINT DEFAULT 0,
    mime_type VARCHAR(100),
    width INTEGER,
    height INTEGER,
    
    -- Organization
    album_id UUID,
    title VARCHAR(255),
    description TEXT,
    tags TEXT[],
    
    -- Status
    is_favorite BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    taken_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Photo Albums (User organization)
-- ============================================
CREATE TABLE IF NOT EXISTS photo_albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cover_photo_id UUID REFERENCES photo_vault(id) ON DELETE SET NULL,
    
    -- Privacy
    is_public BOOLEAN DEFAULT FALSE,
    share_token VARCHAR(100) UNIQUE,
    
    -- Stats (denormalized for performance)
    photo_count INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add album reference to photo_vault
ALTER TABLE photo_vault 
ADD CONSTRAINT fk_photo_vault_album 
FOREIGN KEY (album_id) REFERENCES photo_albums(id) ON DELETE SET NULL;

-- ============================================
-- Storage Usage Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS storage_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    
    -- Usage stats
    total_photos INTEGER DEFAULT 0,
    total_size_bytes BIGINT DEFAULT 0,
    
    -- Limits (cached from plan)
    storage_limit_bytes BIGINT DEFAULT 524288000, -- 500MB default
    photo_limit INTEGER DEFAULT 50,
    
    -- Last calculated
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Storage Transactions (Purchase history)
-- ============================================
CREATE TABLE IF NOT EXISTS storage_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES storage_subscriptions(id),
    plan_id UUID REFERENCES storage_plans(id),
    
    -- Transaction details
    type VARCHAR(50) NOT NULL, -- subscription_start, renewal, upgrade, downgrade, cancellation, refund
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(20) NOT NULL DEFAULT 'completed', -- pending, completed, failed, refunded
    
    -- Payment info
    payment_provider VARCHAR(50),
    external_transaction_id VARCHAR(255),
    
    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Default Storage Plans
-- ============================================
INSERT INTO storage_plans (name, slug, description, storage_limit_mb, photo_limit, price_monthly, price_yearly, features, is_popular, sort_order) VALUES
    ('Free', 'free', 'Get started with basic storage', 500, 50, 0, 0, 
     '["Store up to 50 photos", "Basic organization", "Download watermarked"]'::jsonb, 
     FALSE, 0),
    ('Starter', 'starter', 'Perfect for casual event-goers', 2048, 200, 2.99, 29.99,
     '["Store up to 200 photos", "2 GB storage", "Download originals", "Create albums", "No watermarks"]'::jsonb,
     FALSE, 1),
    ('Pro', 'pro', 'For frequent event attendees', 10240, 1000, 7.99, 79.99,
     '["Store up to 1,000 photos", "10 GB storage", "Download originals", "Unlimited albums", "Share collections", "Priority support"]'::jsonb,
     TRUE, 2),
    ('Unlimited', 'unlimited', 'Never worry about storage again', -1, -1, 14.99, 149.99,
     '["Unlimited photos", "Unlimited storage", "Download originals", "Unlimited albums", "Share collections", "Priority support", "Early access to features"]'::jsonb,
     FALSE, 3)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_storage_subscriptions_user ON storage_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_subscriptions_status ON storage_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_photo_vault_user ON photo_vault(user_id);
CREATE INDEX IF NOT EXISTS idx_photo_vault_album ON photo_vault(album_id);
CREATE INDEX IF NOT EXISTS idx_photo_vault_event ON photo_vault(event_id);
CREATE INDEX IF NOT EXISTS idx_photo_albums_user ON photo_albums(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_usage_user ON storage_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_transactions_user ON storage_transactions(user_id);

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE storage_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_transactions ENABLE ROW LEVEL SECURITY;

-- Storage plans are publicly readable
DROP POLICY IF EXISTS "Storage plans are publicly readable" ON storage_plans;
CREATE POLICY "Storage plans are publicly readable" ON storage_plans
    FOR SELECT USING (is_active = TRUE);

-- Users can read their own subscriptions
DROP POLICY IF EXISTS "Users can read own subscriptions" ON storage_subscriptions;
CREATE POLICY "Users can read own subscriptions" ON storage_subscriptions
    FOR SELECT USING (auth.uid() = user_id);

-- Users can manage their own vault photos
DROP POLICY IF EXISTS "Users can manage own vault photos" ON photo_vault;
CREATE POLICY "Users can manage own vault photos" ON photo_vault
    FOR ALL USING (auth.uid() = user_id);

-- Users can manage their own albums
DROP POLICY IF EXISTS "Users can manage own albums" ON photo_albums;
CREATE POLICY "Users can manage own albums" ON photo_albums
    FOR ALL USING (auth.uid() = user_id);

-- Public albums can be viewed by anyone
DROP POLICY IF EXISTS "Public albums are viewable" ON photo_albums;
CREATE POLICY "Public albums are viewable" ON photo_albums
    FOR SELECT USING (is_public = TRUE);

-- Users can read their own storage usage
DROP POLICY IF EXISTS "Users can read own storage usage" ON storage_usage;
CREATE POLICY "Users can read own storage usage" ON storage_usage
    FOR SELECT USING (auth.uid() = user_id);

-- Users can read their own transactions
DROP POLICY IF EXISTS "Users can read own transactions" ON storage_transactions;
CREATE POLICY "Users can read own transactions" ON storage_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- Functions
-- ============================================

-- Function to calculate user's storage usage
CREATE OR REPLACE FUNCTION calculate_storage_usage(p_user_id UUID)
RETURNS TABLE(total_photos INTEGER, total_size_bytes BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_photos,
        COALESCE(SUM(file_size_bytes), 0)::BIGINT as total_size_bytes
    FROM photo_vault
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can add photos
CREATE OR REPLACE FUNCTION can_add_to_vault(p_user_id UUID, p_file_size_bytes BIGINT DEFAULT 0)
RETURNS BOOLEAN AS $$
DECLARE
    v_usage RECORD;
    v_limits RECORD;
BEGIN
    -- Get current usage
    SELECT * INTO v_usage FROM storage_usage WHERE user_id = p_user_id;
    
    -- If no usage record, create one with defaults
    IF v_usage IS NULL THEN
        INSERT INTO storage_usage (user_id) VALUES (p_user_id)
        RETURNING * INTO v_usage;
    END IF;
    
    -- Check photo limit (-1 = unlimited)
    IF v_usage.photo_limit != -1 AND v_usage.total_photos >= v_usage.photo_limit THEN
        RETURN FALSE;
    END IF;
    
    -- Check storage limit (-1 = unlimited)
    IF v_usage.storage_limit_bytes != -1 AND 
       (v_usage.total_size_bytes + p_file_size_bytes) > v_usage.storage_limit_bytes THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update storage usage after vault changes
CREATE OR REPLACE FUNCTION update_storage_usage_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_usage RECORD;
BEGIN
    -- Determine user_id based on operation
    IF TG_OP = 'DELETE' THEN
        v_user_id := OLD.user_id;
    ELSE
        v_user_id := NEW.user_id;
    END IF;
    
    -- Calculate new usage
    SELECT * INTO v_usage FROM calculate_storage_usage(v_user_id);
    
    -- Update or insert usage record
    INSERT INTO storage_usage (user_id, total_photos, total_size_bytes, calculated_at)
    VALUES (v_user_id, v_usage.total_photos, v_usage.total_size_bytes, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        total_photos = v_usage.total_photos,
        total_size_bytes = v_usage.total_size_bytes,
        calculated_at = NOW(),
        updated_at = NOW();
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_storage_usage ON photo_vault;
CREATE TRIGGER trigger_update_storage_usage
    AFTER INSERT OR UPDATE OR DELETE ON photo_vault
    FOR EACH ROW
    EXECUTE FUNCTION update_storage_usage_trigger();

-- Trigger to update album photo count
CREATE OR REPLACE FUNCTION update_album_photo_count_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- Update old album count if album changed
    IF TG_OP = 'UPDATE' AND OLD.album_id IS DISTINCT FROM NEW.album_id THEN
        IF OLD.album_id IS NOT NULL THEN
            UPDATE photo_albums SET photo_count = (
                SELECT COUNT(*) FROM photo_vault WHERE album_id = OLD.album_id
            ), updated_at = NOW() WHERE id = OLD.album_id;
        END IF;
    END IF;
    
    -- Update new/current album count
    IF TG_OP = 'DELETE' THEN
        IF OLD.album_id IS NOT NULL THEN
            UPDATE photo_albums SET photo_count = (
                SELECT COUNT(*) FROM photo_vault WHERE album_id = OLD.album_id
            ), updated_at = NOW() WHERE id = OLD.album_id;
        END IF;
    ELSE
        IF NEW.album_id IS NOT NULL THEN
            UPDATE photo_albums SET photo_count = (
                SELECT COUNT(*) FROM photo_vault WHERE album_id = NEW.album_id
            ), updated_at = NOW() WHERE id = NEW.album_id;
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_album_photo_count ON photo_vault;
CREATE TRIGGER trigger_update_album_photo_count
    AFTER INSERT OR UPDATE OR DELETE ON photo_vault
    FOR EACH ROW
    EXECUTE FUNCTION update_album_photo_count_trigger();

-- Function to sync subscription limits to usage table
CREATE OR REPLACE FUNCTION sync_subscription_limits(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_plan RECORD;
BEGIN
    -- Get user's active plan
    SELECT sp.* INTO v_plan
    FROM storage_subscriptions ss
    JOIN storage_plans sp ON ss.plan_id = sp.id
    WHERE ss.user_id = p_user_id AND ss.status = 'active';
    
    -- If no subscription, use free tier
    IF v_plan IS NULL THEN
        SELECT * INTO v_plan FROM storage_plans WHERE slug = 'free' LIMIT 1;
    END IF;
    
    -- Update or create usage record with limits
    INSERT INTO storage_usage (
        user_id, 
        storage_limit_bytes, 
        photo_limit
    ) VALUES (
        p_user_id,
        CASE WHEN v_plan.storage_limit_mb = -1 THEN -1 ELSE v_plan.storage_limit_mb * 1024 * 1024 END,
        v_plan.photo_limit
    )
    ON CONFLICT (user_id) DO UPDATE SET
        storage_limit_bytes = CASE WHEN v_plan.storage_limit_mb = -1 THEN -1 ELSE v_plan.storage_limit_mb * 1024 * 1024 END,
        photo_limit = v_plan.photo_limit,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
