-- FaceFindr GO Safe DB Bundle (057-061)
-- Run this in Supabase SQL Editor if you cannot run Supabase CLI migrations.
-- This file is idempotent and guarded to avoid errors when rerun.
-- Scope:
--   057_add_paystack_provider_support.sql
--   058_subscription_provider_parity.sql
--   059_provider_plan_mappings.sql
--   060_dropin_sender_lifecycle.sql
--   061_social_allow_follows_alignment.sql
--   062_user_country_association.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 057: Paystack provider support
-- ============================================================

DO $$
DECLARE
  has_stripe_pi boolean;
  has_flutterwave_tx boolean;
  has_paypal_order boolean;
  has_paystack_ref boolean;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'wallet_provider'
  ) THEN
    BEGIN
      ALTER TYPE public.wallet_provider ADD VALUE IF NOT EXISTS 'paystack';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;

  IF to_regclass('public.wallets') IS NOT NULL THEN
    ALTER TABLE public.wallets
      ADD COLUMN IF NOT EXISTS paystack_subaccount_code VARCHAR(255);

    CREATE INDEX IF NOT EXISTS idx_wallets_paystack_subaccount
      ON public.wallets(paystack_subaccount_code)
      WHERE paystack_subaccount_code IS NOT NULL;
  END IF;

  IF to_regclass('public.transactions') IS NOT NULL THEN
    ALTER TABLE public.transactions
      ADD COLUMN IF NOT EXISTS paystack_reference VARCHAR(255),
      ADD COLUMN IF NOT EXISTS paystack_access_code VARCHAR(255),
      ADD COLUMN IF NOT EXISTS paystack_transaction_id VARCHAR(255);

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'transactions'
        AND column_name = 'stripe_payment_intent_id'
    ) INTO has_stripe_pi;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'transactions'
        AND column_name = 'flutterwave_tx_ref'
    ) INTO has_flutterwave_tx;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'transactions'
        AND column_name = 'paypal_order_id'
    ) INTO has_paypal_order;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'transactions'
        AND column_name = 'paystack_reference'
    ) INTO has_paystack_ref;

    IF has_stripe_pi AND has_flutterwave_tx AND has_paypal_order AND has_paystack_ref THEN
      ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS chk_has_provider_id;
      ALTER TABLE public.transactions ADD CONSTRAINT chk_has_provider_id CHECK (
        stripe_payment_intent_id IS NOT NULL OR
        flutterwave_tx_ref IS NOT NULL OR
        paypal_order_id IS NOT NULL OR
        paystack_reference IS NOT NULL
      );
    END IF;

    CREATE INDEX IF NOT EXISTS idx_transactions_paystack_reference
      ON public.transactions(paystack_reference)
      WHERE paystack_reference IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_paystack_reference
      ON public.transactions(paystack_reference)
      WHERE paystack_reference IS NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 058: Subscription provider parity
-- ============================================================

DO $$
DECLARE
  has_stripe_subscription_id boolean;
  has_stripe_customer_id boolean;
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    ALTER TABLE public.subscriptions
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

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'stripe_subscription_id'
    ) INTO has_stripe_subscription_id;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'stripe_customer_id'
    ) INTO has_stripe_customer_id;

    IF has_stripe_subscription_id AND has_stripe_customer_id THEN
      UPDATE public.subscriptions
      SET
        payment_provider = COALESCE(payment_provider, 'stripe'),
        external_subscription_id = COALESCE(external_subscription_id, stripe_subscription_id),
        external_customer_id = COALESCE(external_customer_id, stripe_customer_id),
        currency = COALESCE(currency, 'USD');
    ELSE
      UPDATE public.subscriptions
      SET
        payment_provider = COALESCE(payment_provider, 'stripe'),
        currency = COALESCE(currency, 'USD');
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_external_subscription_id
      ON public.subscriptions(external_subscription_id)
      WHERE external_subscription_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_status
      ON public.subscriptions(payment_provider, status);
  END IF;
END $$;

DO $$
DECLARE
  has_stripe_subscription_id boolean;
  has_stripe_customer_id boolean;
BEGIN
  IF to_regclass('public.attendee_subscriptions') IS NOT NULL THEN
    ALTER TABLE public.attendee_subscriptions
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

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'attendee_subscriptions' AND column_name = 'stripe_subscription_id'
    ) INTO has_stripe_subscription_id;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'attendee_subscriptions' AND column_name = 'stripe_customer_id'
    ) INTO has_stripe_customer_id;

    IF has_stripe_subscription_id AND has_stripe_customer_id THEN
      UPDATE public.attendee_subscriptions
      SET
        payment_provider = COALESCE(payment_provider, 'stripe'),
        external_subscription_id = COALESCE(external_subscription_id, stripe_subscription_id),
        external_customer_id = COALESCE(external_customer_id, stripe_customer_id),
        currency = COALESCE(currency, 'USD');
    ELSE
      UPDATE public.attendee_subscriptions
      SET
        payment_provider = COALESCE(payment_provider, 'stripe'),
        currency = COALESCE(currency, 'USD');
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_attendee_subscriptions_external_subscription_id
      ON public.attendee_subscriptions(external_subscription_id)
      WHERE external_subscription_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_attendee_subscriptions_provider_status
      ON public.attendee_subscriptions(payment_provider, status);
  END IF;
END $$;

DO $$
DECLARE
  has_price_paid boolean;
BEGIN
  IF to_regclass('public.storage_subscriptions') IS NOT NULL THEN
    ALTER TABLE public.storage_subscriptions
      ADD COLUMN IF NOT EXISTS external_customer_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS external_plan_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS amount_cents INTEGER,
      ADD COLUMN IF NOT EXISTS last_webhook_event_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'storage_subscriptions' AND column_name = 'price_paid'
    ) INTO has_price_paid;

    IF has_price_paid THEN
      UPDATE public.storage_subscriptions
      SET
        payment_provider = COALESCE(payment_provider, 'stripe'),
        currency = COALESCE(currency, 'USD'),
        amount_cents = COALESCE(amount_cents, ROUND(price_paid * 100));
    ELSE
      UPDATE public.storage_subscriptions
      SET
        payment_provider = COALESCE(payment_provider, 'stripe'),
        currency = COALESCE(currency, 'USD');
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_storage_subscriptions_external_subscription_id
      ON public.storage_subscriptions(external_subscription_id)
      WHERE external_subscription_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_storage_subscriptions_provider_status
      ON public.storage_subscriptions(payment_provider, status);
  END IF;
END $$;

-- ============================================================
-- 059: Provider plan mappings
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_plan_mappings (
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
  ON public.provider_plan_mappings(
    product_scope,
    internal_plan_code,
    provider,
    billing_cycle,
    currency,
    region_code,
    is_active
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_plan_mappings_unique
  ON public.provider_plan_mappings(
    product_scope,
    internal_plan_code,
    provider,
    billing_cycle,
    currency,
    region_code
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'update_updated_at_column'
      AND n.nspname = 'public'
  ) THEN
    DROP TRIGGER IF EXISTS update_provider_plan_mappings_updated_at ON public.provider_plan_mappings;
    CREATE TRIGGER update_provider_plan_mappings_updated_at
      BEFORE UPDATE ON public.provider_plan_mappings
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.provider_plan_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider plan mappings readable by authenticated users" ON public.provider_plan_mappings;
CREATE POLICY "Provider plan mappings readable by authenticated users"
  ON public.provider_plan_mappings
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================
-- 060: Drop-in sender lifecycle
-- ============================================================

DO $$
DECLARE
  has_user_action boolean;
  has_user_action_at boolean;
  has_status boolean;
  recipient_set text;
  sender_status_set text;
  sender_notified_set text;
BEGIN
  IF to_regclass('public.drop_in_notifications') IS NOT NULL THEN
    ALTER TABLE public.drop_in_notifications
      ADD COLUMN IF NOT EXISTS recipient_decision VARCHAR(30),
      ADD COLUMN IF NOT EXISTS sender_status VARCHAR(40) NOT NULL DEFAULT 'pending_recipient_decision',
      ADD COLUMN IF NOT EXISTS sender_notified_at TIMESTAMPTZ;

    ALTER TABLE public.drop_in_notifications
      DROP CONSTRAINT IF EXISTS chk_drop_in_notifications_recipient_decision;
    ALTER TABLE public.drop_in_notifications
      ADD CONSTRAINT chk_drop_in_notifications_recipient_decision
      CHECK (
        recipient_decision IS NULL
        OR recipient_decision IN ('accepted_connection', 'declined_connection', 'dismissed')
      );

    ALTER TABLE public.drop_in_notifications
      DROP CONSTRAINT IF EXISTS chk_drop_in_notifications_sender_status;
    ALTER TABLE public.drop_in_notifications
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

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'drop_in_notifications'
        AND column_name = 'user_action'
    ) INTO has_user_action;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'drop_in_notifications'
        AND column_name = 'user_action_at'
    ) INTO has_user_action_at;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'drop_in_notifications'
        AND column_name = 'status'
    ) INTO has_status;

    recipient_set := 'recipient_decision = CASE';
    IF has_user_action THEN
      recipient_set := recipient_set ||
        ' WHEN user_action = ''accepted_connection'' THEN ''accepted_connection''' ||
        ' WHEN user_action = ''declined_connection'' THEN ''declined_connection''';
    END IF;
    IF has_status THEN
      recipient_set := recipient_set ||
        ' WHEN status = ''dismissed'' THEN ''dismissed''';
    END IF;
    recipient_set := recipient_set || ' ELSE recipient_decision END';

    sender_status_set := 'sender_status = CASE';
    IF has_user_action THEN
      sender_status_set := sender_status_set ||
        ' WHEN user_action = ''accepted_connection'' THEN ''recipient_accepted''' ||
        ' WHEN user_action = ''declined_connection'' THEN ''recipient_declined''';
    END IF;
    IF has_status THEN
      sender_status_set := sender_status_set ||
        ' WHEN status = ''viewed'' THEN ''recipient_viewed''';
    END IF;
    sender_status_set := sender_status_set || ' ELSE sender_status END';

    IF has_user_action THEN
      sender_notified_set := 'sender_notified_at = CASE' ||
        ' WHEN user_action IN (''accepted_connection'', ''declined_connection'') THEN COALESCE(sender_notified_at';
      IF has_user_action_at THEN
        sender_notified_set := sender_notified_set || ', user_action_at';
      END IF;
      sender_notified_set := sender_notified_set || ', NOW()) ELSE sender_notified_at END';
    ELSE
      sender_notified_set := 'sender_notified_at = sender_notified_at';
    END IF;

    EXECUTE format(
      'UPDATE public.drop_in_notifications SET %s, %s, %s',
      recipient_set,
      sender_status_set,
      sender_notified_set
    );

    CREATE INDEX IF NOT EXISTS idx_drop_in_notifications_sender_status
      ON public.drop_in_notifications(sender_status);

    CREATE INDEX IF NOT EXISTS idx_drop_in_notifications_recipient_decision
      ON public.drop_in_notifications(recipient_decision)
      WHERE recipient_decision IS NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 061: Social allow_follows alignment
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.user_privacy_settings') IS NOT NULL THEN
    ALTER TABLE public.user_privacy_settings
      ADD COLUMN IF NOT EXISTS allow_follows BOOLEAN NOT NULL DEFAULT TRUE;
    UPDATE public.user_privacy_settings
    SET allow_follows = COALESCE(allow_follows, TRUE);
  END IF;

  IF to_regclass('public.attendees') IS NOT NULL THEN
    ALTER TABLE public.attendees
      ADD COLUMN IF NOT EXISTS allow_follows BOOLEAN NOT NULL DEFAULT TRUE;
    UPDATE public.attendees
    SET allow_follows = COALESCE(allow_follows, TRUE);
  END IF;

  IF to_regclass('public.photographers') IS NOT NULL THEN
    ALTER TABLE public.photographers
      ADD COLUMN IF NOT EXISTS allow_follows BOOLEAN NOT NULL DEFAULT TRUE;
    UPDATE public.photographers
    SET allow_follows = COALESCE(allow_follows, TRUE);
  END IF;
END $$;

-- ============================================================
-- 062: User country association
-- ============================================================

DO $$
DECLARE
  attendees_has_user_id boolean := false;
  photographers_has_user_id boolean := false;
BEGIN
  IF to_regclass('public.attendees') IS NOT NULL THEN
    ALTER TABLE public.attendees
      ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

    CREATE INDEX IF NOT EXISTS idx_attendees_country_code
      ON public.attendees(country_code)
      WHERE country_code IS NOT NULL;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'attendees'
        AND column_name = 'user_id'
    ) INTO attendees_has_user_id;

    UPDATE public.attendees a
    SET country_code = UPPER(TRIM(u.raw_user_meta_data->>'country_code'))
    FROM auth.users u
    WHERE a.country_code IS NULL
      AND a.id = u.id
      AND (u.raw_user_meta_data->>'country_code') ~ '^[A-Za-z]{2}$';

    IF attendees_has_user_id THEN
      UPDATE public.attendees a
      SET country_code = UPPER(TRIM(u.raw_user_meta_data->>'country_code'))
      FROM auth.users u
      WHERE a.country_code IS NULL
        AND a.user_id = u.id
        AND (u.raw_user_meta_data->>'country_code') ~ '^[A-Za-z]{2}$';
    END IF;

    IF to_regclass('public.user_currency_preferences') IS NOT NULL THEN
      UPDATE public.attendees a
      SET country_code = UPPER(TRIM(ucp.detected_country))
      FROM public.user_currency_preferences ucp
      WHERE a.country_code IS NULL
        AND ucp.detected_country ~ '^[A-Za-z]{2}$'
        AND (
          ucp.user_id = a.id
          OR (attendees_has_user_id AND ucp.user_id = a.user_id)
        );
    END IF;
  END IF;

  IF to_regclass('public.photographers') IS NOT NULL THEN
    ALTER TABLE public.photographers
      ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

    CREATE INDEX IF NOT EXISTS idx_photographers_country_code
      ON public.photographers(country_code)
      WHERE country_code IS NOT NULL;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'photographers'
        AND column_name = 'user_id'
    ) INTO photographers_has_user_id;

    UPDATE public.photographers p
    SET country_code = UPPER(TRIM(u.raw_user_meta_data->>'country_code'))
    FROM auth.users u
    WHERE p.country_code IS NULL
      AND p.id = u.id
      AND (u.raw_user_meta_data->>'country_code') ~ '^[A-Za-z]{2}$';

    IF photographers_has_user_id THEN
      UPDATE public.photographers p
      SET country_code = UPPER(TRIM(u.raw_user_meta_data->>'country_code'))
      FROM auth.users u
      WHERE p.country_code IS NULL
        AND p.user_id = u.id
        AND (u.raw_user_meta_data->>'country_code') ~ '^[A-Za-z]{2}$';
    END IF;

    IF to_regclass('public.user_currency_preferences') IS NOT NULL THEN
      UPDATE public.photographers p
      SET country_code = UPPER(TRIM(ucp.detected_country))
      FROM public.user_currency_preferences ucp
      WHERE p.country_code IS NULL
        AND ucp.detected_country ~ '^[A-Za-z]{2}$'
        AND (
          ucp.user_id = p.id
          OR (photographers_has_user_id AND ucp.user_id = p.user_id)
        );
    END IF;
  END IF;
END $$;
