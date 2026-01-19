-- =============================================
-- DROP-IN FEATURE: Cross-Contact Photo Discovery
-- =============================================
-- Migration: 039_drop_in_feature
-- Description: Enable users to upload and discover photos of people outside their contact network

-- =============================================
-- CONTACTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    
    -- Contact metadata
    contact_type VARCHAR(20) DEFAULT 'mutual', -- 'mutual', 'one_way', 'blocked'
    added_at TIMESTAMPTZ DEFAULT NOW(),
    last_interaction_at TIMESTAMPTZ,
    
    UNIQUE(user_id, contact_id),
    CHECK(user_id != contact_id)
);

CREATE INDEX idx_contacts_user ON contacts(user_id);
CREATE INDEX idx_contacts_contact ON contacts(contact_id);
CREATE INDEX idx_contacts_type ON contacts(contact_type);

-- =============================================
-- DROP-IN PHOTOS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS drop_in_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uploader_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    
    -- Media storage
    media_id UUID REFERENCES media(id) ON DELETE SET NULL, -- If uploaded to media bucket
    storage_path TEXT NOT NULL, -- Direct storage path
    original_filename VARCHAR(255),
    file_size BIGINT,
    width INTEGER,
    height INTEGER,
    thumbnail_path TEXT,
    
    -- Discovery settings
    is_discoverable BOOLEAN DEFAULT FALSE, -- Requires payment
    discovery_scope VARCHAR(20) DEFAULT 'app_only', -- 'app_only', 'social_media', 'web_wide'
    
    -- Payment status
    upload_payment_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'paid', 'failed', 'refunded'
    upload_payment_transaction_id UUID REFERENCES transactions(id),
    upload_payment_amount INTEGER, -- In cents
    
    -- Gift settings
    is_gifted BOOLEAN DEFAULT FALSE,
    gift_payment_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'paid', 'failed', 'refunded'
    gift_payment_transaction_id UUID REFERENCES transactions(id),
    gift_payment_amount INTEGER, -- In cents
    gift_message TEXT, -- Max 200 characters, encrypted until recipient views
    gift_message_unlocked_at TIMESTAMPTZ, -- When recipient views
    
    -- Location metadata (optional)
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    location_name VARCHAR(255),
    
    -- Processing status
    face_processing_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    faces_detected INTEGER DEFAULT 0,
    matches_found INTEGER DEFAULT 0,
    
    -- Timestamps
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days') -- Auto-delete after 90 days
);

CREATE INDEX idx_drop_in_photos_uploader ON drop_in_photos(uploader_id);
CREATE INDEX idx_drop_in_photos_discoverable ON drop_in_photos(is_discoverable) WHERE is_discoverable = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_drop_in_photos_gifted ON drop_in_photos(is_gifted) WHERE is_gifted = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_drop_in_photos_processing ON drop_in_photos(face_processing_status) WHERE face_processing_status IN ('pending', 'processing');
CREATE INDEX idx_drop_in_photos_expires ON drop_in_photos(expires_at) WHERE deleted_at IS NULL;

-- =============================================
-- DROP-IN MATCHES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS drop_in_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drop_in_photo_id UUID NOT NULL REFERENCES drop_in_photos(id) ON DELETE CASCADE,
    matched_attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    
    -- Face recognition data
    rekognition_face_id VARCHAR(255) NOT NULL,
    confidence DECIMAL(5,2) NOT NULL,
    bounding_box JSONB,
    
    -- Match status
    is_verified BOOLEAN DEFAULT FALSE, -- User confirmed it's them
    verification_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'confirmed', 'rejected'
    verified_at TIMESTAMPTZ,
    
    -- Notification
    notification_sent BOOLEAN DEFAULT FALSE,
    notification_sent_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drop_in_matches_photo ON drop_in_matches(drop_in_photo_id);
CREATE INDEX idx_drop_in_matches_attendee ON drop_in_matches(matched_attendee_id);
CREATE INDEX idx_drop_in_matches_confidence ON drop_in_matches(confidence DESC);
CREATE INDEX idx_drop_in_matches_verified ON drop_in_matches(verification_status);
CREATE INDEX idx_drop_in_matches_notification ON drop_in_matches(notification_sent) WHERE notification_sent = FALSE;

-- =============================================
-- DROP-IN NOTIFICATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS drop_in_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drop_in_photo_id UUID NOT NULL REFERENCES drop_in_photos(id) ON DELETE CASCADE,
    drop_in_match_id UUID REFERENCES drop_in_matches(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    
    -- Notification status
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'viewed', 'dismissed', 'expired'
    sent_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    
    -- Access control
    requires_premium BOOLEAN DEFAULT TRUE, -- False if gifted
    is_gifted BOOLEAN DEFAULT FALSE,
    gift_message_available BOOLEAN DEFAULT FALSE,
    gift_message_viewed BOOLEAN DEFAULT FALSE,
    
    -- User actions
    user_action VARCHAR(20), -- 'thanked', 'saved', 'blocked', 'reported'
    user_action_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days') -- Notification expires after 30 days
);

CREATE INDEX idx_drop_in_notifications_recipient ON drop_in_notifications(recipient_id);
CREATE INDEX idx_drop_in_notifications_status ON drop_in_notifications(status);
CREATE INDEX idx_drop_in_notifications_photo ON drop_in_notifications(drop_in_photo_id);
CREATE INDEX idx_drop_in_notifications_pending ON drop_in_notifications(recipient_id, status) WHERE status = 'pending';
CREATE INDEX idx_drop_in_notifications_expires ON drop_in_notifications(expires_at) WHERE status = 'pending';

-- =============================================
-- ATTENDEE SUBSCRIPTIONS TABLE (for premium features)
-- =============================================
CREATE TABLE IF NOT EXISTS attendee_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    
    -- Subscription details
    plan_code VARCHAR(20) NOT NULL DEFAULT 'free', -- 'free', 'premium', 'premium_plus'
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'canceled', 'expired', 'past_due'
    
    -- Payment provider
    stripe_subscription_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    
    -- Billing period
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    
    -- Features enabled
    can_discover_non_contacts BOOLEAN DEFAULT FALSE,
    can_upload_drop_ins BOOLEAN DEFAULT FALSE,
    can_receive_all_drop_ins BOOLEAN DEFAULT FALSE,
    can_search_social_media BOOLEAN DEFAULT FALSE,
    can_search_web BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(attendee_id)
);

CREATE INDEX idx_attendee_subscriptions_attendee ON attendee_subscriptions(attendee_id);
CREATE INDEX idx_attendee_subscriptions_status ON attendee_subscriptions(status) WHERE status = 'active';
CREATE INDEX idx_attendee_subscriptions_stripe ON attendee_subscriptions(stripe_subscription_id);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Check if two users are contacts
CREATE OR REPLACE FUNCTION are_contacts(user1_id UUID, user2_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM contacts
        WHERE (user_id = user1_id AND contact_id = user2_id)
           OR (user_id = user2_id AND contact_id = user1_id)
        AND contact_type != 'blocked'
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if user has premium access
CREATE OR REPLACE FUNCTION has_premium_access(attendee_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM attendee_subscriptions
        WHERE attendee_id = has_premium_access.attendee_id
        AND status = 'active'
        AND plan_code IN ('premium', 'premium_plus')
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Note: This function is used in RLS policies, so it must be accessible
-- Make sure to grant execute permission if needed

-- Update drop-in photo match count
CREATE OR REPLACE FUNCTION update_drop_in_match_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE drop_in_photos
        SET matches_found = (
            SELECT COUNT(*) FROM drop_in_matches
            WHERE drop_in_photo_id = NEW.drop_in_photo_id
        )
        WHERE id = NEW.drop_in_photo_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE drop_in_photos
        SET matches_found = (
            SELECT COUNT(*) FROM drop_in_matches
            WHERE drop_in_photo_id = OLD.drop_in_photo_id
        )
        WHERE id = OLD.drop_in_photo_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_drop_in_match_count
    AFTER INSERT OR DELETE ON drop_in_matches
    FOR EACH ROW
    EXECUTE FUNCTION update_drop_in_match_count();

-- Auto-delete expired drop-in photos
CREATE OR REPLACE FUNCTION cleanup_expired_drop_ins()
RETURNS void AS $$
BEGIN
    UPDATE drop_in_photos
    SET deleted_at = NOW()
    WHERE expires_at < NOW()
    AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Queue face matching job (called after payment confirmation)
CREATE OR REPLACE FUNCTION queue_drop_in_face_matching(drop_in_photo_id UUID)
RETURNS void AS $$
BEGIN
    -- This function will be called by the processing API
    -- In production, this would queue a background job
    -- For now, it's a placeholder
    NULL;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE drop_in_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE drop_in_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE drop_in_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendee_subscriptions ENABLE ROW LEVEL SECURITY;

-- Contacts policies
CREATE POLICY "Users can view their contacts"
    ON contacts FOR SELECT
    USING (user_id = auth.uid() OR contact_id = auth.uid());

CREATE POLICY "Users can manage their contacts"
    ON contacts FOR ALL
    USING (user_id = auth.uid());

-- Drop-in photos policies
CREATE POLICY "Users can view their own drop-in photos"
    ON drop_in_photos FOR SELECT
    USING (uploader_id = auth.uid());

CREATE POLICY "Users can view discoverable drop-in photos (if premium or registered)"
    ON drop_in_photos FOR SELECT
    USING (
        is_discoverable = TRUE
        AND deleted_at IS NULL
        AND (
            has_premium_access(auth.uid()) 
            OR is_gifted = TRUE
            OR EXISTS (
                -- Check if user has any event access (free tier includes registered events)
                -- Note: event_access_tokens doesn't have attendee_id directly
                -- This checks if user has used any tokens (via entitlements or other means)
                -- For now, we'll check if user has any entitlements which indicates event registration
                SELECT 1 FROM entitlements
                WHERE attendee_id = auth.uid()
                LIMIT 1
            )
        )
    );

CREATE POLICY "Users can create drop-in photos"
    ON drop_in_photos FOR INSERT
    WITH CHECK (uploader_id = auth.uid());

CREATE POLICY "Users can update their own drop-in photos"
    ON drop_in_photos FOR UPDATE
    USING (uploader_id = auth.uid());

CREATE POLICY "Users can delete their own drop-in photos"
    ON drop_in_photos FOR UPDATE
    USING (uploader_id = auth.uid())
    WITH CHECK (uploader_id = auth.uid());

-- Drop-in matches policies
CREATE POLICY "Users can view matches for their drop-in photos"
    ON drop_in_matches FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM drop_in_photos
            WHERE id = drop_in_matches.drop_in_photo_id
            AND uploader_id = auth.uid()
        )
    );

CREATE POLICY "Users can view matches where they are the recipient"
    ON drop_in_matches FOR SELECT
    USING (matched_attendee_id = auth.uid());

-- Drop-in notifications policies
CREATE POLICY "Users can view their notifications"
    ON drop_in_notifications FOR SELECT
    USING (recipient_id = auth.uid());

CREATE POLICY "Users can update their notifications"
    ON drop_in_notifications FOR UPDATE
    USING (recipient_id = auth.uid());

-- Attendee subscriptions policies
CREATE POLICY "Users can view their own subscription"
    ON attendee_subscriptions FOR SELECT
    USING (attendee_id = auth.uid());

CREATE POLICY "Users can manage their own subscription"
    ON attendee_subscriptions FOR ALL
    USING (attendee_id = auth.uid());

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE contacts IS 'User contacts/connections for determining free vs paid discovery';
COMMENT ON TABLE drop_in_photos IS 'Photos uploaded of people outside uploader contacts';
COMMENT ON TABLE drop_in_matches IS 'Face recognition matches for drop-in photos';
COMMENT ON TABLE drop_in_notifications IS 'Notifications sent to recipients of drop-in photos';
COMMENT ON TABLE attendee_subscriptions IS 'Premium subscriptions for attendees (separate from photographer subscriptions)';
