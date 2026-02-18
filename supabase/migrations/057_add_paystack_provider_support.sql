-- Migration: 057_add_paystack_provider_support
-- Purpose: Add Paystack as a first-class wallet + transaction provider.

-- ============================================
-- WALLET PROVIDER ENUM
-- ============================================

ALTER TYPE wallet_provider ADD VALUE IF NOT EXISTS 'paystack';

-- ============================================
-- WALLETS TABLE
-- ============================================

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS paystack_subaccount_code VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_wallets_paystack_subaccount
  ON wallets(paystack_subaccount_code)
  WHERE paystack_subaccount_code IS NOT NULL;

-- ============================================
-- TRANSACTIONS TABLE
-- ============================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS paystack_reference VARCHAR(255),
  ADD COLUMN IF NOT EXISTS paystack_access_code VARCHAR(255),
  ADD COLUMN IF NOT EXISTS paystack_transaction_id VARCHAR(255);

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_has_provider_id;
ALTER TABLE transactions ADD CONSTRAINT chk_has_provider_id CHECK (
  stripe_payment_intent_id IS NOT NULL OR
  flutterwave_tx_ref IS NOT NULL OR
  paypal_order_id IS NOT NULL OR
  paystack_reference IS NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_paystack_reference
  ON transactions(paystack_reference)
  WHERE paystack_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_paystack_reference
  ON transactions(paystack_reference)
  WHERE paystack_reference IS NOT NULL;
