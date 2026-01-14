-- Security Hardening
-- SRS §10: Authentication security, rate limiting, 2FA

-- ============================================
-- LOGIN ATTEMPTS TABLE (Rate Limiting)
-- ============================================

CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    failure_reason VARCHAR(100),
    attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_email ON login_attempts(email);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX idx_login_attempts_time ON login_attempts(attempted_at);

-- ============================================
-- TWO-FACTOR AUTHENTICATION
-- ============================================

CREATE TABLE IF NOT EXISTS totp_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    encrypted_secret TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_totp_secrets_user ON totp_secrets(user_id);

-- Backup codes for 2FA recovery
CREATE TABLE IF NOT EXISTS backup_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_backup_codes_user ON backup_codes(user_id);
CREATE INDEX idx_backup_codes_unused ON backup_codes(user_id) WHERE used_at IS NULL;

-- ============================================
-- SECURITY AUDIT LOG
-- ============================================

CREATE TABLE IF NOT EXISTS security_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    event_details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    risk_level VARCHAR(20) DEFAULT 'low',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_security_audit_user ON security_audit_log(user_id);
CREATE INDEX idx_security_audit_type ON security_audit_log(event_type);
CREATE INDEX idx_security_audit_time ON security_audit_log(created_at);
CREATE INDEX idx_security_audit_risk ON security_audit_log(risk_level);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Check if IP/email is rate limited
CREATE OR REPLACE FUNCTION is_login_rate_limited(
    p_email VARCHAR(255),
    p_ip_address INET
)
RETURNS BOOLEAN AS $$
DECLARE
    v_failed_count INTEGER;
BEGIN
    -- Count failed attempts in last 15 minutes
    SELECT COUNT(*) INTO v_failed_count
    FROM login_attempts
    WHERE (email = p_email OR ip_address = p_ip_address)
    AND success = FALSE
    AND attempted_at > NOW() - INTERVAL '15 minutes';
    
    -- Rate limit after 5 failed attempts
    RETURN v_failed_count >= 5;
END;
$$ LANGUAGE plpgsql;

-- Log login attempt
CREATE OR REPLACE FUNCTION log_login_attempt(
    p_email VARCHAR(255),
    p_ip_address INET,
    p_user_agent TEXT,
    p_success BOOLEAN,
    p_failure_reason VARCHAR(100) DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO login_attempts (email, ip_address, user_agent, success, failure_reason)
    VALUES (p_email, p_ip_address, p_user_agent, p_success, p_failure_reason);
    
    -- Also log to security audit
    INSERT INTO security_audit_log (
        event_type,
        event_details,
        ip_address,
        user_agent,
        risk_level
    )
    VALUES (
        CASE WHEN p_success THEN 'login_success' ELSE 'login_failed' END,
        jsonb_build_object('email', p_email, 'reason', p_failure_reason),
        p_ip_address,
        p_user_agent,
        CASE WHEN p_success THEN 'low' ELSE 'medium' END
    );
END;
$$ LANGUAGE plpgsql;

-- Verify TOTP code (placeholder - actual verification in application)
CREATE OR REPLACE FUNCTION has_2fa_enabled(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM totp_secrets 
        WHERE user_id = p_user_id 
        AND is_enabled = TRUE
    );
END;
$$ LANGUAGE plpgsql;

-- Clean up old login attempts (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_login_attempts()
RETURNS void AS $$
BEGIN
    DELETE FROM login_attempts
    WHERE attempted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE totp_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own 2FA settings
CREATE POLICY "Users can view own 2FA" ON totp_secrets
    FOR SELECT USING (auth.uid() = user_id);

-- Users can view their own backup codes (count only)
CREATE POLICY "Users can view own backup codes" ON backup_codes
    FOR SELECT USING (auth.uid() = user_id);
