-- Provider-agnostic recurring subscription parity across creator, attendee, and vault flows.

-- ============================================
-- CREATOR SUBSCRIPTIONS
-- ============================================

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50) DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS external_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_plan_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_webhook_event_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

UPDATE subscriptions
SET
  payment_provider = COALESCE(payment_provider, 'stripe'),
  external_subscription_id = COALESCE(external_subscription_id, stripe_subscription_id),
  external_customer_id = COALESCE(external_customer_id, stripe_customer_id),
  currency = COALESCE(currency, 'USD')
WHERE TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_external_subscription_id
  ON subscriptions(external_subscription_id)
  WHERE external_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_status
  ON subscriptions(payment_provider, status);

-- ============================================
-- ATTENDEE SUBSCRIPTIONS
-- ============================================

ALTER TABLE attendee_subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50) DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS external_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_plan_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_webhook_event_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

UPDATE attendee_subscriptions
SET
  payment_provider = COALESCE(payment_provider, 'stripe'),
  external_subscription_id = COALESCE(external_subscription_id, stripe_subscription_id),
  external_customer_id = COALESCE(external_customer_id, stripe_customer_id),
  currency = COALESCE(currency, 'USD')
WHERE TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendee_subscriptions_external_subscription_id
  ON attendee_subscriptions(external_subscription_id)
  WHERE external_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendee_subscriptions_provider_status
  ON attendee_subscriptions(payment_provider, status);

-- ============================================
-- VAULT/STORAGE SUBSCRIPTIONS
-- ============================================

ALTER TABLE storage_subscriptions
  ADD COLUMN IF NOT EXISTS external_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_plan_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS last_webhook_event_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

UPDATE storage_subscriptions
SET
  payment_provider = COALESCE(payment_provider, 'stripe'),
  currency = COALESCE(currency, 'USD'),
  amount_cents = COALESCE(amount_cents, ROUND(price_paid * 100))
WHERE TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_storage_subscriptions_external_subscription_id
  ON storage_subscriptions(external_subscription_id)
  WHERE external_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_storage_subscriptions_provider_status
  ON storage_subscriptions(payment_provider, status);
