-- Migration: 043_modular_pricing_features
-- Description: Create modular pricing plan features system for both photographer and drop-in plans

-- ============================================
-- PLAN TYPES ENUM
-- ============================================

CREATE TYPE plan_type AS ENUM ('photographer', 'drop_in');

-- ============================================
-- PLAN FEATURES TABLE
-- ============================================
-- Stores individual features that can be assigned to any plan type

CREATE TABLE plan_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'max_active_events', 'face_recognition', 'drop_in_external_search'
    name VARCHAR(255) NOT NULL,
    description TEXT,
    feature_type VARCHAR(50) NOT NULL, -- 'limit', 'boolean', 'numeric', 'text'
    default_value JSONB, -- Default value for this feature
    applicable_to plan_type[] NOT NULL DEFAULT ARRAY['photographer', 'drop_in']::plan_type[], -- Which plan types can use this feature
    category VARCHAR(100), -- e.g., 'events', 'photos', 'face_recognition', 'drop_in'
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_plan_features_code ON plan_features(code);
CREATE INDEX idx_plan_features_category ON plan_features(category);
CREATE INDEX idx_plan_features_applicable_to ON plan_features USING GIN(applicable_to);

-- ============================================
-- UPDATE EXISTING SUBSCRIPTION PLANS TABLE
-- ============================================
-- Add plan_type column if it doesn't exist (for backward compatibility)

DO $$ 
BEGIN
    -- Add plan_type column if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'subscription_plans' AND column_name = 'plan_type') THEN
        ALTER TABLE subscription_plans ADD COLUMN plan_type plan_type NOT NULL DEFAULT 'photographer';
    END IF;
    
    -- Update unique constraint to include plan_type
    -- Drop existing unique constraint on code if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'subscription_plans_code_key' 
        AND conrelid = 'subscription_plans'::regclass
    ) THEN
        ALTER TABLE subscription_plans DROP CONSTRAINT subscription_plans_code_key;
    END IF;
    
    -- Add new unique constraint on (plan_type, code)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'subscription_plans_plan_type_code_key' 
        AND conrelid = 'subscription_plans'::regclass
    ) THEN
        ALTER TABLE subscription_plans ADD CONSTRAINT subscription_plans_plan_type_code_key UNIQUE (plan_type, code);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscription_plans_type ON subscription_plans(plan_type);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_code ON subscription_plans(code);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active) WHERE is_active = TRUE;

-- ============================================
-- PLAN FEATURE ASSIGNMENTS TABLE
-- ============================================
-- Junction table linking plans to features with their values

CREATE TABLE plan_feature_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    feature_id UUID NOT NULL REFERENCES plan_features(id) ON DELETE CASCADE,
    feature_value JSONB NOT NULL, -- The value for this feature on this plan
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(plan_id, feature_id)
);

CREATE INDEX idx_plan_feature_assignments_plan ON plan_feature_assignments(plan_id);
CREATE INDEX idx_plan_feature_assignments_feature ON plan_feature_assignments(feature_id);

-- ============================================
-- HELPER FUNCTION: Get plan features
-- ============================================

CREATE OR REPLACE FUNCTION get_plan_features(p_plan_id UUID)
RETURNS TABLE (
    feature_code VARCHAR(100),
    feature_name VARCHAR(255),
    feature_type VARCHAR(50),
    feature_value JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pf.code AS feature_code,
        pf.name AS feature_name,
        pf.feature_type,
        pfa.feature_value
    FROM plan_feature_assignments pfa
    JOIN plan_features pf ON pfa.feature_id = pf.id
    WHERE pfa.plan_id = p_plan_id
    ORDER BY pf.display_order, pf.name;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- INSERT DEFAULT FEATURES FOR PHOTOGRAPHERS
-- ============================================

INSERT INTO plan_features (code, name, description, feature_type, default_value, applicable_to, category, display_order) VALUES
-- Event Limits
('max_active_events', 'Max Active Events', 'Maximum number of active events allowed', 'numeric', '1'::jsonb, ARRAY['photographer']::plan_type[], 'events', 10),
('max_photos_per_event', 'Max Photos Per Event', 'Maximum number of photos allowed per event', 'numeric', '100'::jsonb, ARRAY['photographer']::plan_type[], 'photos', 20),
('max_face_ops_per_event', 'Max Face Operations Per Event', 'Maximum face recognition operations per event', 'numeric', '0'::jsonb, ARRAY['photographer']::plan_type[], 'face_recognition', 30),

-- Feature Flags
('face_recognition_enabled', 'Face Recognition', 'Enable AI face recognition for events', 'boolean', 'false'::jsonb, ARRAY['photographer']::plan_type[], 'face_recognition', 40),
('priority_processing', 'Priority Processing', 'Get faster photo processing and indexing', 'boolean', 'false'::jsonb, ARRAY['photographer']::plan_type[], 'performance', 50),
('api_access', 'API Access', 'Access to FaceFindr API for integrations', 'boolean', 'false'::jsonb, ARRAY['photographer']::plan_type[], 'integrations', 60),
('custom_watermark', 'Custom Watermark', 'Upload and use custom watermarks on photos', 'boolean', 'false'::jsonb, ARRAY['photographer']::plan_type[], 'branding', 70),
('live_event_mode', 'Live Event Mode', 'Enable real-time notifications during events', 'boolean', 'false'::jsonb, ARRAY['photographer']::plan_type[], 'events', 80),

-- Retention
('retention_days', 'Photo Retention (Days)', 'Number of days photos are retained', 'numeric', '30'::jsonb, ARRAY['photographer']::plan_type[], 'storage', 90),

-- Analytics
('advanced_analytics', 'Advanced Analytics', 'Access to detailed analytics and insights', 'boolean', 'false'::jsonb, ARRAY['photographer']::plan_type[], 'analytics', 100);

-- ============================================
-- INSERT DEFAULT FEATURES FOR DROP-IN
-- ============================================

INSERT INTO plan_features (code, name, description, feature_type, default_value, applicable_to, category, display_order) VALUES
-- Drop-In Specific Features
('drop_in_external_search', 'External Search', 'Search for photos on external social media and websites', 'boolean', 'false'::jsonb, ARRAY['drop_in']::plan_type[], 'drop_in', 10),
('drop_in_contact_search', 'Contact Search', 'Find photos from contacts and registered events (free tier)', 'boolean', 'true'::jsonb, ARRAY['drop_in']::plan_type[], 'drop_in', 20),
('drop_in_gift_enabled', 'Gift Drop-Ins', 'Allow gifting drop-in notifications to recipients', 'boolean', 'false'::jsonb, ARRAY['drop_in']::plan_type[], 'drop_in', 30),
('drop_in_notifications', 'Drop-In Notifications', 'Receive notifications when photos of you are found', 'boolean', 'true'::jsonb, ARRAY['drop_in']::plan_type[], 'drop_in', 40),
('drop_in_max_uploads_per_month', 'Max Uploads Per Month', 'Maximum number of drop-in photos you can upload per month', 'numeric', '10'::jsonb, ARRAY['drop_in']::plan_type[], 'drop_in', 50),
('drop_in_unlimited_uploads', 'Unlimited Uploads', 'Unlimited drop-in photo uploads', 'boolean', 'false'::jsonb, ARRAY['drop_in']::plan_type[], 'drop_in', 60);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_feature_assignments ENABLE ROW LEVEL SECURITY;

-- Plan features are readable by all authenticated users
CREATE POLICY "Plan features are viewable by authenticated users"
    ON plan_features FOR SELECT
    TO authenticated
    USING (true);

-- Subscription plans are readable by all authenticated users
CREATE POLICY "Subscription plans are viewable by authenticated users"
    ON subscription_plans FOR SELECT
    TO authenticated
    USING (true);

-- Plan feature assignments are readable by all authenticated users
CREATE POLICY "Plan feature assignments are viewable by authenticated users"
    ON plan_feature_assignments FOR SELECT
    TO authenticated
    USING (true);

-- Admin-only write access (service role bypasses RLS)
-- Admins can manage features and plans through the admin dashboard

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE plan_features IS 'Individual features that can be assigned to pricing plans';
COMMENT ON TABLE subscription_plans IS 'Pricing plans for photographers and drop-in users';
COMMENT ON TABLE plan_feature_assignments IS 'Junction table linking plans to features with their values';
COMMENT ON FUNCTION get_plan_features IS 'Helper function to retrieve all features for a given plan';
