-- FaceFindr Database Migration
-- Migration: 002_payment_providers
-- Description: Extend payment system for multiple providers

-- ============================================
-- UPDATE WALLET PROVIDER ENUM
-- ============================================

-- Add new providers to the enum
ALTER TYPE wallet_provider ADD VALUE IF NOT EXISTS 'flutterwave';
ALTER TYPE wallet_provider ADD VALUE IF NOT EXISTS 'paypal';
ALTER TYPE wallet_provider ADD VALUE IF NOT EXISTS 'momo';

-- ============================================
-- UPDATE WALLETS TABLE
-- ============================================

-- Make stripe_account_id nullable (for non-Stripe providers)
ALTER TABLE wallets ALTER COLUMN stripe_account_id DROP NOT NULL;

-- Add columns for other providers
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS flutterwave_subaccount_id VARCHAR(255);
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS paypal_merchant_id VARCHAR(255);
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS momo_account_number VARCHAR(50);
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS momo_provider VARCHAR(50);
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) DEFAULT 'US';
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS preferred_currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS default_payout_method VARCHAR(50);

-- Create indexes for new provider IDs
CREATE INDEX IF NOT EXISTS idx_wallets_flutterwave ON wallets(flutterwave_subaccount_id) WHERE flutterwave_subaccount_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallets_paypal ON wallets(paypal_merchant_id) WHERE paypal_merchant_id IS NOT NULL;

-- ============================================
-- UPDATE TRANSACTIONS TABLE
-- ============================================

-- Add columns for other payment providers
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_provider wallet_provider DEFAULT 'stripe';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS flutterwave_tx_ref VARCHAR(255);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS flutterwave_tx_id VARCHAR(255);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paypal_order_id VARCHAR(255);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paypal_capture_id VARCHAR(255);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_fee INTEGER DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Make stripe columns nullable
ALTER TABLE transactions ALTER COLUMN stripe_payment_intent_id DROP NOT NULL;

-- Add check constraint for at least one provider ID
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_has_provider_id;
ALTER TABLE transactions ADD CONSTRAINT chk_has_provider_id CHECK (
    stripe_payment_intent_id IS NOT NULL OR 
    flutterwave_tx_ref IS NOT NULL OR 
    paypal_order_id IS NOT NULL
);

-- Create indexes for new provider IDs
CREATE INDEX IF NOT EXISTS idx_transactions_flutterwave ON transactions(flutterwave_tx_ref) WHERE flutterwave_tx_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_paypal ON transactions(paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_provider ON transactions(payment_provider);

-- ============================================
-- PAYOUTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    payment_provider wallet_provider NOT NULL,
    provider_payout_id VARCHAR(255),
    amount INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'pending',
    failure_reason TEXT,
    payout_method VARCHAR(50),
    destination_last4 VARCHAR(4),
    initiated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_wallet ON payouts(wallet_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_provider ON payouts(payment_provider);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_payouts_updated_at ON payouts;
CREATE TRIGGER update_payouts_updated_at BEFORE UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- WALLET BALANCE VIEW
-- ============================================

CREATE OR REPLACE VIEW wallet_balances AS
SELECT 
    w.id AS wallet_id,
    w.photographer_id,
    w.provider,
    w.status,
    w.preferred_currency AS currency,
    COALESCE(SUM(CASE WHEN t.status = 'succeeded' THEN t.net_amount ELSE 0 END), 0) AS total_earnings,
    COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount ELSE 0 END), 0) AS total_paid_out,
    COALESCE(SUM(CASE WHEN t.status = 'succeeded' THEN t.net_amount ELSE 0 END), 0) - 
    COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount ELSE 0 END), 0) AS available_balance,
    COALESCE(SUM(CASE WHEN p.status = 'pending' THEN p.amount ELSE 0 END), 0) AS pending_payout
FROM wallets w
LEFT JOIN transactions t ON t.wallet_id = w.id
LEFT JOIN payouts p ON p.wallet_id = w.id
GROUP BY w.id, w.photographer_id, w.provider, w.status, w.preferred_currency;

-- ============================================
-- RLS FOR NEW TABLES
-- ============================================

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photographers can view own payouts" ON payouts FOR SELECT USING (
    wallet_id IN (SELECT id FROM wallets WHERE photographer_id = auth.uid())
);
