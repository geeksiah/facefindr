-- =============================================
-- Privacy Settings & Data Export
-- =============================================

-- Privacy settings table
CREATE TABLE IF NOT EXISTS user_privacy_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_type VARCHAR(20) NOT NULL DEFAULT 'attendee',
    profile_visible BOOLEAN NOT NULL DEFAULT TRUE,
    allow_photo_tagging BOOLEAN NOT NULL DEFAULT TRUE,
    show_in_search BOOLEAN NOT NULL DEFAULT TRUE,
    allow_face_recognition BOOLEAN NOT NULL DEFAULT TRUE,
    share_activity_with_photographers BOOLEAN NOT NULL DEFAULT FALSE,
    email_marketing BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_privacy_settings_user ON user_privacy_settings(user_id);

-- Data export requests table
CREATE TABLE IF NOT EXISTS data_export_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_type VARCHAR(20) NOT NULL DEFAULT 'attendee',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    email VARCHAR(255) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    download_url TEXT,
    file_size_bytes BIGINT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_export_user ON data_export_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_data_export_status ON data_export_requests(status);

-- Enable RLS
ALTER TABLE user_privacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_export_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own privacy settings" ON user_privacy_settings;
CREATE POLICY "Users can view own privacy settings"
    ON user_privacy_settings FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own privacy settings" ON user_privacy_settings;
CREATE POLICY "Users can update own privacy settings"
    ON user_privacy_settings FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own privacy settings" ON user_privacy_settings;
CREATE POLICY "Users can insert own privacy settings"
    ON user_privacy_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own export requests" ON data_export_requests;
CREATE POLICY "Users can view own export requests"
    ON data_export_requests FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create export requests" ON data_export_requests;
CREATE POLICY "Users can create export requests"
    ON data_export_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
