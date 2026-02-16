-- Admin System
-- Separate admin authentication and platform management

-- ============================================
-- ADMIN ROLES ENUM
-- ============================================

DO $$ BEGIN
    CREATE TYPE admin_role AS ENUM (
        'super_admin',
        'finance_admin',
        'support_admin',
        'readonly_admin'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- ADMIN USERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role admin_role NOT NULL DEFAULT 'readonly_admin',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);

-- ============================================
-- ADMIN SESSIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

-- ============================================
-- ADMIN PERMISSIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS admin_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role admin_role NOT NULL,
    permission VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(role, permission)
);

-- Insert default permissions
INSERT INTO admin_permissions (role, permission) VALUES
-- Super Admin - all permissions
('super_admin', 'payouts.view'),
('super_admin', 'payouts.process'),
('super_admin', 'payouts.batch'),
('super_admin', 'payouts.retry'),
('super_admin', 'payouts.pause'),
('super_admin', 'settings.view'),
('super_admin', 'settings.update'),
('super_admin', 'users.view'),
('super_admin', 'users.suspend'),
('super_admin', 'users.delete'),
('super_admin', 'users.verify'),
('super_admin', 'transactions.view'),
('super_admin', 'transactions.refund'),
('super_admin', 'transactions.export'),
('super_admin', 'events.view'),
('super_admin', 'events.suspend'),
('super_admin', 'events.feature'),
('super_admin', 'events.transfer'),
('super_admin', 'analytics.view'),
('super_admin', 'analytics.export'),
('super_admin', 'audit.view'),
('super_admin', 'audit.export'),
('super_admin', 'announcements.create'),
('super_admin', 'announcements.send'),
('super_admin', 'disputes.view'),
('super_admin', 'disputes.manage'),
('super_admin', 'admin.manage'),
-- Finance Admin
('finance_admin', 'payouts.view'),
('finance_admin', 'payouts.process'),
('finance_admin', 'payouts.batch'),
('finance_admin', 'payouts.retry'),
('finance_admin', 'settings.view'),
('finance_admin', 'transactions.view'),
('finance_admin', 'transactions.refund'),
('finance_admin', 'transactions.export'),
('finance_admin', 'analytics.view'),
('finance_admin', 'analytics.export'),
('finance_admin', 'audit.view'),
-- Support Admin
('support_admin', 'users.view'),
('support_admin', 'users.suspend'),
('support_admin', 'users.verify'),
('support_admin', 'transactions.view'),
('support_admin', 'events.view'),
('support_admin', 'events.suspend'),
('support_admin', 'disputes.view'),
('support_admin', 'disputes.manage'),
('support_admin', 'announcements.create'),
-- Readonly Admin
('readonly_admin', 'payouts.view'),
('readonly_admin', 'settings.view'),
('readonly_admin', 'users.view'),
('readonly_admin', 'transactions.view'),
('readonly_admin', 'events.view'),
('readonly_admin', 'analytics.view'),
('readonly_admin', 'audit.view'),
('readonly_admin', 'disputes.view')
ON CONFLICT (role, permission) DO NOTHING;

-- ============================================
-- ADMIN AUDIT LOGS TABLE
-- ============================================

DO $$ BEGIN
    CREATE TYPE audit_action_type AS ENUM (
        'login',
        'logout',
        'user_suspend',
        'user_unsuspend',
        'user_delete',
        'user_verify',
        'payout_process',
        'payout_batch',
        'payout_retry',
        'payout_pause',
        'refund_issue',
        'event_suspend',
        'event_feature',
        'event_transfer',
        'settings_update',
        'announcement_create',
        'announcement_send',
        'dispute_update',
        'admin_create',
        'admin_update',
        'admin_delete'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    admin_email VARCHAR(255), -- Keep email even if admin deleted
    action audit_action_type NOT NULL,
    resource_type VARCHAR(50), -- 'user', 'event', 'transaction', etc.
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON admin_audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON admin_audit_logs(created_at DESC);

-- ============================================
-- PLATFORM SETTINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS platform_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rename column if it exists with old name 'key' (reserved word issue)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'platform_settings' AND column_name = 'key'
    ) THEN
        ALTER TABLE platform_settings RENAME COLUMN "key" TO setting_key;
    END IF;
EXCEPTION
    WHEN others THEN null;
END $$;

-- Rename column if it exists with old name 'setting_value' to 'value'
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'platform_settings' AND column_name = 'setting_value'
    ) THEN
        ALTER TABLE platform_settings RENAME COLUMN setting_value TO value;
    END IF;
EXCEPTION
    WHEN others THEN null;
END $$;

-- Ensure all columns exist (in case table was partially created)
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS setting_key VARCHAR(100) UNIQUE;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS value JSONB;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'general';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_platform_settings_key ON platform_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_platform_settings_category ON platform_settings(category);

-- Insert default platform settings
INSERT INTO platform_settings (setting_key, value, description, category) VALUES
-- Payout minimums by currency (in cents/smallest unit)
('payout_minimum_usd', '5000', 'Minimum payout amount in USD cents ($50.00)', 'payouts'),
('payout_minimum_gbp', '4000', 'Minimum payout amount in GBP pence (£40.00)', 'payouts'),
('payout_minimum_eur', '4500', 'Minimum payout amount in EUR cents (€45.00)', 'payouts'),
('payout_minimum_ghs', '10000', 'Minimum payout amount in GHS pesewas (GHS 100.00)', 'payouts'),
('payout_minimum_ngn', '500000', 'Minimum payout amount in NGN kobo (₦5,000.00)', 'payouts'),
('payout_minimum_kes', '100000', 'Minimum payout amount in KES cents (KES 1,000.00)', 'payouts'),
('payout_minimum_zar', '50000', 'Minimum payout amount in ZAR cents (R500.00)', 'payouts'),
('payout_minimum_ugx', '10000000', 'Minimum payout amount in UGX (UGX 100,000)', 'payouts'),

-- Platform fees by plan (percentage * 100)
('platform_fee_free', '2000', 'Platform fee for free plan (20%)', 'fees'),
('platform_fee_starter', '1500', 'Platform fee for starter plan (15%)', 'fees'),
('platform_fee_pro', '1000', 'Platform fee for pro plan (10%)', 'fees'),
('platform_fee_studio', '800', 'Platform fee for studio plan (8%)', 'fees'),

-- Instant payout fee
('instant_payout_fee', '100', 'Instant payout fee (1%)', 'fees'),

-- Print commissions by plan
('print_commission_free', '1500', 'Print commission for free plan (15%)', 'prints'),
('print_commission_starter', '2000', 'Print commission for starter plan (20%)', 'prints'),
('print_commission_pro', '2500', 'Print commission for pro plan (25%)', 'prints'),
('print_commission_studio', '3000', 'Print commission for studio plan (30%)', 'prints'),

-- Global toggles
('payouts_enabled', 'true', 'Global toggle for automatic payouts', 'payouts'),
('new_registrations_enabled', 'true', 'Allow new user registrations', 'general'),
('maintenance_mode', 'false', 'Put platform in maintenance mode', 'general')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================
-- PLATFORM ANNOUNCEMENTS TABLE
-- ============================================

DO $$ BEGIN
    CREATE TYPE announcement_target AS ENUM ('all', 'photographers', 'attendees');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE announcement_status AS ENUM ('draft', 'scheduled', 'sent', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS platform_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    target announcement_target NOT NULL DEFAULT 'all',
    status announcement_status NOT NULL DEFAULT 'draft',
    send_email BOOLEAN DEFAULT FALSE,
    send_push BOOLEAN DEFAULT TRUE,
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    sent_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_status ON platform_announcements(status);
CREATE INDEX IF NOT EXISTS idx_announcements_scheduled ON platform_announcements(scheduled_at) WHERE status = 'scheduled';

-- ============================================
-- DISPUTE STATUS ENUM AND TABLE
-- ============================================

DO $$ BEGIN
    CREATE TYPE dispute_status AS ENUM (
        'open',
        'under_review',
        'evidence_submitted',
        'won',
        'lost',
        'closed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    stripe_dispute_id VARCHAR(255) UNIQUE,
    reason VARCHAR(100),
    status dispute_status NOT NULL DEFAULT 'open',
    amount INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    evidence_due_by TIMESTAMPTZ,
    evidence_submitted_at TIMESTAMPTZ,
    evidence JSONB DEFAULT '{}',
    outcome VARCHAR(50),
    outcome_reason TEXT,
    assigned_to UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_transaction ON disputes(transaction_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_assigned ON disputes(assigned_to);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to log admin action
CREATE OR REPLACE FUNCTION log_admin_action(
    p_admin_id UUID,
    p_action audit_action_type,
    p_resource_type VARCHAR(50) DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}',
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_admin_email VARCHAR(255);
    v_log_id UUID;
BEGIN
    -- Get admin email
    SELECT email INTO v_admin_email FROM admin_users WHERE id = p_admin_id;
    
    -- Insert audit log
    INSERT INTO admin_audit_logs (
        admin_id, admin_email, action, resource_type, resource_id, 
        details, ip_address, user_agent
    )
    VALUES (
        p_admin_id, v_admin_email, p_action, p_resource_type, p_resource_id,
        p_details, p_ip_address, p_user_agent
    )
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check admin permission
CREATE OR REPLACE FUNCTION admin_has_permission(
    p_admin_id UUID,
    p_permission VARCHAR(100)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_role admin_role;
    v_has_permission BOOLEAN;
BEGIN
    -- Get admin role
    SELECT role INTO v_role FROM admin_users WHERE id = p_admin_id AND is_active = TRUE;
    
    IF v_role IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check if role has permission
    SELECT EXISTS(
        SELECT 1 FROM admin_permissions 
        WHERE role = v_role AND permission = p_permission
    ) INTO v_has_permission;
    
    RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql;

-- Function to get platform setting
CREATE OR REPLACE FUNCTION get_platform_setting(p_key VARCHAR(100))
RETURNS JSONB AS $$
DECLARE
    v_value JSONB;
BEGIN
    SELECT value INTO v_value FROM platform_settings WHERE setting_key = p_key;
    RETURN v_value;
END;
$$ LANGUAGE plpgsql;

-- Function to update platform setting
CREATE OR REPLACE FUNCTION update_platform_setting(
    p_key VARCHAR(100),
    p_value JSONB,
    p_admin_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE platform_settings 
    SET value = p_value, updated_by = p_admin_id, updated_at = NOW()
    WHERE setting_key = p_key;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

DROP TRIGGER IF EXISTS update_admin_users_updated_at ON admin_users;
CREATE TRIGGER update_admin_users_updated_at
    BEFORE UPDATE ON admin_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_announcements_updated_at ON platform_announcements;
CREATE TRIGGER update_platform_announcements_updated_at
    BEFORE UPDATE ON platform_announcements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_disputes_updated_at ON disputes;
CREATE TRIGGER update_disputes_updated_at
    BEFORE UPDATE ON disputes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS POLICIES (disabled for admin - uses service role)
-- ============================================

-- Admin tables are accessed via service role key only
-- No RLS needed as service role bypasses RLS

-- ============================================
-- REALTIME PUBLICATION
-- ============================================

-- Enable realtime for admin dashboard (wrapped in DO blocks to handle if already added)
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE photographers;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE attendees;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE events;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE payouts;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE disputes;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- CREATE DEFAULT SUPER ADMIN (password: changeme123!)
-- Hash generated with: SELECT crypt('changeme123!', gen_salt('bf', 10))
-- ============================================

INSERT INTO admin_users (email, password_hash, name, role)
VALUES (
    'admin@ferchr.com',
    '$2a$10$rQEY8dHKQSYBOVe3FJqMYOZxE8xxT1nB6CYZ8kRPvQiW9BHxLCyHm',
    'System Admin',
    'super_admin'
)
ON CONFLICT (email) DO NOTHING;
