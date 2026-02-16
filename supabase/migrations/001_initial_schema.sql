-- Ferchr Database Schema
-- Migration: 001_initial_schema
-- Description: Initial database setup with all core tables

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE account_status AS ENUM ('active', 'suspended', 'pending_verification');
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled', 'trialing');
CREATE TYPE subscription_plan AS ENUM ('free', 'starter', 'pro', 'studio');
CREATE TYPE event_status AS ENUM ('draft', 'active', 'closed', 'archived', 'expired');
CREATE TYPE media_type AS ENUM ('photo', 'video');
CREATE TYPE wallet_provider AS ENUM ('stripe');
CREATE TYPE wallet_status AS ENUM ('pending', 'active', 'restricted');
CREATE TYPE entitlement_type AS ENUM ('single', 'bulk');
CREATE TYPE access_token_role AS ENUM ('event_owner', 'attendee');
CREATE TYPE consent_type AS ENUM ('biometric', 'marketing');
CREATE TYPE face_profile_source AS ENUM ('initial_scan', 'event_scan', 'manual_update');
CREATE TYPE transaction_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
CREATE TYPE actor_type AS ENUM ('photographer', 'attendee', 'system', 'admin');

-- ============================================
-- PHOTOGRAPHERS TABLE
-- ============================================

CREATE TABLE photographers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    business_name VARCHAR(255),
    profile_photo_url TEXT,
    status account_status DEFAULT 'pending_verification',
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_photographers_email ON photographers(email);
CREATE INDEX idx_photographers_status ON photographers(status);

-- ============================================
-- ATTENDEES TABLE
-- ============================================

CREATE TABLE attendees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,
    display_name VARCHAR(255),
    face_tag VARCHAR(30) UNIQUE NOT NULL,
    face_tag_suffix VARCHAR(4) NOT NULL,
    profile_photo_url TEXT,
    status account_status DEFAULT 'active',
    email_verified BOOLEAN DEFAULT FALSE,
    date_of_birth DATE,
    last_face_refresh TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attendees_email ON attendees(email);
CREATE INDEX idx_attendees_face_tag ON attendees(face_tag);

-- ============================================
-- SUBSCRIPTIONS TABLE
-- ============================================

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
    plan_code subscription_plan DEFAULT 'free',
    status subscription_status DEFAULT 'active',
    stripe_subscription_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(photographer_id)
);

CREATE INDEX idx_subscriptions_photographer ON subscriptions(photographer_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);

-- ============================================
-- EVENTS TABLE
-- ============================================

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    location VARCHAR(255),
    event_date DATE,
    status event_status DEFAULT 'draft',
    is_public BOOLEAN DEFAULT FALSE,
    face_recognition_enabled BOOLEAN DEFAULT TRUE,
    live_mode_enabled BOOLEAN DEFAULT FALSE,
    attendee_access_enabled BOOLEAN DEFAULT TRUE,
    face_ops_used INTEGER DEFAULT 0,
    face_ops_limit INTEGER DEFAULT 2000,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

CREATE INDEX idx_events_photographer ON events(photographer_id);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_is_public ON events(is_public) WHERE is_public = TRUE;
CREATE INDEX idx_events_expires_at ON events(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================
-- EVENT ACCESS TOKENS TABLE
-- ============================================

CREATE TABLE event_access_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    token VARCHAR(64) UNIQUE NOT NULL,
    role access_token_role DEFAULT 'attendee',
    label VARCHAR(100),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_event_access_tokens_event ON event_access_tokens(event_id);
CREATE INDEX idx_event_access_tokens_token ON event_access_tokens(token);

-- ============================================
-- MEDIA TABLE
-- ============================================

CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    original_filename VARCHAR(255),
    media_type media_type DEFAULT 'photo',
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    width INTEGER,
    height INTEGER,
    thumbnail_path TEXT,
    watermarked_path TEXT,
    faces_detected INTEGER DEFAULT 0,
    faces_indexed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_media_event ON media(event_id);
CREATE INDEX idx_media_faces_indexed ON media(faces_indexed) WHERE faces_indexed = FALSE;
CREATE INDEX idx_media_deleted ON media(deleted_at) WHERE deleted_at IS NULL;

-- ============================================
-- FACE EMBEDDINGS TABLE
-- ============================================

CREATE TABLE face_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    face_id VARCHAR(255) NOT NULL,
    rekognition_face_id VARCHAR(255) NOT NULL,
    bounding_box JSONB,
    confidence DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_face_embeddings_event ON face_embeddings(event_id);
CREATE INDEX idx_face_embeddings_media ON face_embeddings(media_id);
CREATE INDEX idx_face_embeddings_rekognition ON face_embeddings(rekognition_face_id);

-- ============================================
-- ATTENDEE FACE PROFILES TABLE
-- ============================================

CREATE TABLE attendee_face_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    rekognition_face_id VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    source face_profile_source DEFAULT 'initial_scan',
    confidence DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attendee_face_profiles_attendee ON attendee_face_profiles(attendee_id);
CREATE INDEX idx_attendee_face_profiles_primary ON attendee_face_profiles(attendee_id) WHERE is_primary = TRUE;

-- ============================================
-- WALLETS TABLE
-- ============================================

CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
    provider wallet_provider DEFAULT 'stripe',
    stripe_account_id VARCHAR(255) UNIQUE NOT NULL,
    status wallet_status DEFAULT 'pending',
    payouts_enabled BOOLEAN DEFAULT FALSE,
    charges_enabled BOOLEAN DEFAULT FALSE,
    details_submitted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(photographer_id, provider)
);

CREATE INDEX idx_wallets_photographer ON wallets(photographer_id);
CREATE INDEX idx_wallets_stripe_account ON wallets(stripe_account_id);

-- ============================================
-- EVENT PRICING TABLE
-- ============================================

CREATE TABLE event_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
    price_per_media INTEGER DEFAULT 0,
    unlock_all_price INTEGER,
    currency VARCHAR(3) DEFAULT 'USD',
    is_free BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_event_pricing_event ON event_pricing(event_id);

-- ============================================
-- TRANSACTIONS TABLE
-- ============================================

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    attendee_id UUID REFERENCES attendees(id) ON DELETE SET NULL,
    attendee_email VARCHAR(255),
    stripe_payment_intent_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_checkout_session_id VARCHAR(255),
    gross_amount INTEGER NOT NULL,
    platform_fee INTEGER NOT NULL,
    stripe_fee INTEGER NOT NULL,
    net_amount INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status transaction_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_event ON transactions(event_id);
CREATE INDEX idx_transactions_wallet ON transactions(wallet_id);
CREATE INDEX idx_transactions_attendee ON transactions(attendee_id);
CREATE INDEX idx_transactions_stripe_pi ON transactions(stripe_payment_intent_id);
CREATE INDEX idx_transactions_status ON transactions(status);

-- ============================================
-- ENTITLEMENTS TABLE
-- ============================================

CREATE TABLE entitlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    attendee_id UUID REFERENCES attendees(id) ON DELETE SET NULL,
    attendee_face_hash VARCHAR(64),
    media_id UUID REFERENCES media(id) ON DELETE CASCADE,
    entitlement_type entitlement_type NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entitlements_event ON entitlements(event_id);
CREATE INDEX idx_entitlements_transaction ON entitlements(transaction_id);
CREATE INDEX idx_entitlements_attendee ON entitlements(attendee_id);
CREATE INDEX idx_entitlements_face_hash ON entitlements(attendee_face_hash);

-- ============================================
-- ATTENDEE CONSENTS TABLE
-- ============================================

CREATE TABLE attendee_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendee_id UUID REFERENCES attendees(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    session_id VARCHAR(64),
    consent_type consent_type NOT NULL,
    consent_version VARCHAR(10) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    withdrawn_at TIMESTAMPTZ
);

CREATE INDEX idx_attendee_consents_attendee ON attendee_consents(attendee_id);
CREATE INDEX idx_attendee_consents_event ON attendee_consents(event_id);
CREATE INDEX idx_attendee_consents_session ON attendee_consents(session_id);

-- ============================================
-- DOWNLOAD LOGS TABLE
-- ============================================

CREATE TABLE download_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    entitlement_id UUID REFERENCES entitlements(id) ON DELETE SET NULL,
    attendee_id UUID REFERENCES attendees(id) ON DELETE SET NULL,
    ip_address INET,
    downloaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_download_logs_media ON download_logs(media_id);
CREATE INDEX idx_download_logs_entitlement ON download_logs(entitlement_id);
CREATE INDEX idx_download_logs_attendee ON download_logs(attendee_id);

-- ============================================
-- AUDIT LOGS TABLE
-- ============================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_type actor_type NOT NULL,
    actor_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    metadata JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_photographers_updated_at BEFORE UPDATE ON photographers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_attendees_updated_at BEFORE UPDATE ON attendees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_event_pricing_updated_at BEFORE UPDATE ON event_pricing FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE photographers ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendee_face_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendee_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Photographers can only access their own data
CREATE POLICY "Photographers can view own profile" ON photographers FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Photographers can update own profile" ON photographers FOR UPDATE USING (auth.uid() = id);

-- Photographers can manage their subscriptions
CREATE POLICY "Photographers can view own subscription" ON subscriptions FOR SELECT USING (photographer_id = auth.uid());

-- Photographers can manage their events
CREATE POLICY "Photographers can view own events" ON events FOR SELECT USING (photographer_id = auth.uid());
CREATE POLICY "Photographers can create events" ON events FOR INSERT WITH CHECK (photographer_id = auth.uid());
CREATE POLICY "Photographers can update own events" ON events FOR UPDATE USING (photographer_id = auth.uid());
CREATE POLICY "Photographers can delete own events" ON events FOR DELETE USING (photographer_id = auth.uid());

-- Public events are viewable by anyone
CREATE POLICY "Public events are viewable" ON events FOR SELECT USING (is_public = TRUE AND status = 'active');

-- Event access tokens
CREATE POLICY "Photographers can manage event tokens" ON event_access_tokens FOR ALL USING (
    event_id IN (SELECT id FROM events WHERE photographer_id = auth.uid())
);

-- Media policies
CREATE POLICY "Photographers can manage event media" ON media FOR ALL USING (
    event_id IN (SELECT id FROM events WHERE photographer_id = auth.uid())
);

-- Wallets
CREATE POLICY "Photographers can view own wallet" ON wallets FOR SELECT USING (photographer_id = auth.uid());
CREATE POLICY "Photographers can manage own wallet" ON wallets FOR ALL USING (photographer_id = auth.uid());

-- Event pricing
CREATE POLICY "Photographers can manage event pricing" ON event_pricing FOR ALL USING (
    event_id IN (SELECT id FROM events WHERE photographer_id = auth.uid())
);
CREATE POLICY "Anyone can view event pricing" ON event_pricing FOR SELECT USING (TRUE);

-- Transactions
CREATE POLICY "Photographers can view event transactions" ON transactions FOR SELECT USING (
    event_id IN (SELECT id FROM events WHERE photographer_id = auth.uid())
);

-- Attendees can view their own profile
CREATE POLICY "Attendees can view own profile" ON attendees FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Attendees can update own profile" ON attendees FOR UPDATE USING (auth.uid() = id);

-- Attendee face profiles
CREATE POLICY "Attendees can manage own face profiles" ON attendee_face_profiles FOR ALL USING (attendee_id = auth.uid());

-- Entitlements
CREATE POLICY "Attendees can view own entitlements" ON entitlements FOR SELECT USING (attendee_id = auth.uid());

-- Download logs
CREATE POLICY "Photographers can view download logs" ON download_logs FOR SELECT USING (
    media_id IN (
        SELECT m.id FROM media m 
        JOIN events e ON m.event_id = e.id 
        WHERE e.photographer_id = auth.uid()
    )
);

-- Consents
CREATE POLICY "Attendees can view own consents" ON attendee_consents FOR SELECT USING (attendee_id = auth.uid());
CREATE POLICY "Attendees can manage own consents" ON attendee_consents FOR ALL USING (attendee_id = auth.uid());
