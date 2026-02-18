-- FaceFindr GO Safe DB Bundle
-- Purpose: apply critical schema updates without Supabase CLI.
-- Safe to run in Supabase SQL Editor multiple times.
-- Covers: 058, 059, 060, 061 style updates.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 058: subscription provider parity
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
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
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attendee_subscriptions') THEN
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
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'storage_subscriptions') THEN
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
  END IF;
END $$;

-- ============================================================
-- 059: provider plan mappings
-- ============================================================

CREATE TABLE IF NOT EXISTS provider_plan_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_scope VARCHAR(30) NOT NULL,
  internal_plan_code VARCHAR(100) NOT NULL,
  internal_plan_id UUID,
  provider VARCHAR(50) NOT NULL,
  provider_plan_id VARCHAR(255) NOT NULL,
  provider_product_id VARCHAR(255),
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  region_code VARCHAR(10) NOT NULL DEFAULT 'GLOBAL',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_provider_plan_scope CHECK (
    product_scope IN ('creator_subscription', 'attendee_subscription', 'vault_subscription')
  ),
  CONSTRAINT chk_provider_plan_provider CHECK (
    provider IN ('stripe', 'paypal', 'flutterwave', 'paystack')
  ),
  CONSTRAINT chk_provider_plan_billing_cycle CHECK (
    billing_cycle IN ('monthly', 'annual', 'yearly')
  )
);

CREATE INDEX IF NOT EXISTS idx_provider_plan_mappings_lookup
  ON provider_plan_mappings(product_scope, internal_plan_code, provider, billing_cycle, currency, region_code, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_plan_mappings_unique
  ON provider_plan_mappings(product_scope, internal_plan_code, provider, billing_cycle, currency, region_code);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'update_updated_at_column' AND n.nspname = 'public'
  ) THEN
    DROP TRIGGER IF EXISTS update_provider_plan_mappings_updated_at ON provider_plan_mappings;
    CREATE TRIGGER update_provider_plan_mappings_updated_at
      BEFORE UPDATE ON provider_plan_mappings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

ALTER TABLE provider_plan_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider plan mappings readable by authenticated users" ON provider_plan_mappings;
CREATE POLICY "Provider plan mappings readable by authenticated users"
  ON provider_plan_mappings FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================
-- 060: drop-in sender lifecycle
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'drop_in_notifications') THEN
    ALTER TABLE drop_in_notifications
      ADD COLUMN IF NOT EXISTS recipient_decision VARCHAR(30),
      ADD COLUMN IF NOT EXISTS sender_status VARCHAR(40) NOT NULL DEFAULT 'pending_recipient_decision',
      ADD COLUMN IF NOT EXISTS sender_notified_at TIMESTAMPTZ;

    ALTER TABLE drop_in_notifications
      DROP CONSTRAINT IF EXISTS chk_drop_in_notifications_recipient_decision;

    ALTER TABLE drop_in_notifications
      ADD CONSTRAINT chk_drop_in_notifications_recipient_decision
      CHECK (
        recipient_decision IS NULL
        OR recipient_decision IN ('accepted_connection', 'declined_connection', 'dismissed')
      );

    ALTER TABLE drop_in_notifications
      DROP CONSTRAINT IF EXISTS chk_drop_in_notifications_sender_status;

    ALTER TABLE drop_in_notifications
      ADD CONSTRAINT chk_drop_in_notifications_sender_status
      CHECK (
        sender_status IN (
          'pending_recipient_decision',
          'recipient_viewed',
          'recipient_accepted',
          'recipient_declined',
          'sender_notified'
        )
      );

    UPDATE drop_in_notifications
    SET
      recipient_decision = CASE
        WHEN user_action = 'accepted_connection' THEN 'accepted_connection'
        WHEN user_action = 'declined_connection' THEN 'declined_connection'
        WHEN status = 'dismissed' THEN 'dismissed'
        ELSE recipient_decision
      END,
      sender_status = CASE
        WHEN user_action = 'accepted_connection' THEN 'recipient_accepted'
        WHEN user_action = 'declined_connection' THEN 'recipient_declined'
        WHEN status = 'viewed' THEN 'recipient_viewed'
        ELSE sender_status
      END,
      sender_notified_at = CASE
        WHEN user_action IN ('accepted_connection', 'declined_connection')
          THEN COALESCE(sender_notified_at, user_action_at, NOW())
        ELSE sender_notified_at
      END
    WHERE TRUE;

    CREATE INDEX IF NOT EXISTS idx_drop_in_notifications_sender_status
      ON drop_in_notifications(sender_status);

    CREATE INDEX IF NOT EXISTS idx_drop_in_notifications_recipient_decision
      ON drop_in_notifications(recipient_decision)
      WHERE recipient_decision IS NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 061: social allow_follows alignment
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_privacy_settings') THEN
    ALTER TABLE user_privacy_settings
      ADD COLUMN IF NOT EXISTS allow_follows BOOLEAN NOT NULL DEFAULT TRUE;

    UPDATE user_privacy_settings
    SET allow_follows = COALESCE(allow_follows, TRUE);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attendees') THEN
    ALTER TABLE attendees
      ADD COLUMN IF NOT EXISTS allow_follows BOOLEAN NOT NULL DEFAULT TRUE;

    UPDATE attendees
    SET allow_follows = COALESCE(allow_follows, TRUE);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'photographers') THEN
    ALTER TABLE photographers
      ADD COLUMN IF NOT EXISTS allow_follows BOOLEAN NOT NULL DEFAULT TRUE;

    UPDATE photographers
    SET allow_follows = COALESCE(allow_follows, TRUE);
  END IF;
END $$;

COMMIT;
