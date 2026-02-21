-- Creator plan governance hardening
-- Goals:
-- 1) Ensure every creator can resolve to admin-managed Free plan limits.
-- 2) Ensure enforcement function uses modular pricing tables as source of truth.
-- 3) Backfill missing free subscriptions and plan_id links.

DO $$
DECLARE
  v_free_plan_id UUID;
  has_plan_id boolean := false;
  has_payment_provider boolean := false;
  has_billing_cycle boolean := false;
  has_currency boolean := false;
  subscriptions_plan_code_udt text;
BEGIN
  IF to_regclass('public.subscription_plans') IS NULL THEN
    RETURN;
  END IF;

  -- Allow dynamic admin plan codes (legacy enum blocks new custom plan codes).
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    SELECT c.udt_name
    INTO subscriptions_plan_code_udt
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'subscriptions'
      AND c.column_name = 'plan_code';

    IF subscriptions_plan_code_udt = 'subscription_plan' THEN
      ALTER TABLE public.subscriptions
        ALTER COLUMN plan_code TYPE VARCHAR(100) USING plan_code::text;
      ALTER TABLE public.subscriptions
        ALTER COLUMN plan_code SET DEFAULT 'free';
    END IF;
  END IF;

  -- Resolve canonical free creator plan
  SELECT sp.id
  INTO v_free_plan_id
  FROM public.subscription_plans sp
  WHERE sp.is_active = TRUE
    AND sp.code = 'free'
    AND sp.plan_type::text IN ('creator', 'photographer')
  ORDER BY
    CASE WHEN sp.plan_type::text = 'creator' THEN 0 ELSE 1 END,
    sp.updated_at DESC NULLS LAST,
    sp.created_at DESC
  LIMIT 1;

  -- Backfill missing modular feature assignments for active creator plans
  IF to_regclass('public.plan_features') IS NOT NULL
    AND to_regclass('public.plan_feature_assignments') IS NOT NULL THEN
    INSERT INTO public.plan_feature_assignments (plan_id, feature_id, feature_value)
    SELECT
      sp.id,
      pf.id,
      pf.default_value
    FROM public.subscription_plans sp
    JOIN public.plan_features pf
      ON pf.is_active = TRUE
     AND pf.code IN (
       'max_active_events',
       'max_photos_per_event',
       'max_face_ops_per_event',
       'storage_gb',
       'team_members',
       'face_recognition_enabled',
       'custom_watermark',
       'live_event_mode',
       'api_access'
     )
    LEFT JOIN public.plan_feature_assignments pfa
      ON pfa.plan_id = sp.id
     AND pfa.feature_id = pf.id
    WHERE sp.is_active = TRUE
      AND sp.plan_type::text IN ('creator', 'photographer')
      AND pfa.id IS NULL
    ON CONFLICT (plan_id, feature_id) DO NOTHING;
  END IF;

  IF to_regclass('public.subscriptions') IS NOT NULL
    AND to_regclass('public.photographers') IS NOT NULL THEN
    -- Ensure every creator has a subscription row (defaults to free/active)
    INSERT INTO public.subscriptions (
      photographer_id,
      plan_code,
      status,
      current_period_start,
      current_period_end,
      created_at,
      updated_at
    )
    SELECT
      p.id,
      'free',
      'active',
      NOW(),
      NULL,
      NOW(),
      NOW()
    FROM public.photographers p
    LEFT JOIN public.subscriptions s ON s.photographer_id = p.id
    WHERE s.photographer_id IS NULL;

    -- Column checks for optional parity fields
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'plan_id'
    ) INTO has_plan_id;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'payment_provider'
    ) INTO has_payment_provider;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'billing_cycle'
    ) INTO has_billing_cycle;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'currency'
    ) INTO has_currency;

    -- Backfill plan_id by code for creator plans
    IF has_plan_id THEN
      UPDATE public.subscriptions s
      SET plan_id = sp.id
      FROM (
        SELECT DISTINCT ON (code)
          code,
          id
        FROM public.subscription_plans
        WHERE is_active = TRUE
          AND plan_type::text IN ('creator', 'photographer')
        ORDER BY
          code,
          CASE WHEN plan_type::text = 'creator' THEN 0 ELSE 1 END,
          updated_at DESC NULLS LAST,
          created_at DESC
      ) sp
      WHERE s.plan_id IS NULL
        AND LOWER(sp.code) = LOWER(s.plan_code::text);

      IF v_free_plan_id IS NOT NULL THEN
        UPDATE public.subscriptions
        SET plan_id = v_free_plan_id
        WHERE plan_code = 'free'
          AND plan_id IS NULL;
      END IF;
    END IF;

    IF has_payment_provider THEN
      UPDATE public.subscriptions
      SET payment_provider = COALESCE(payment_provider, 'system')
      WHERE payment_provider IS NULL;
    END IF;

    IF has_billing_cycle THEN
      UPDATE public.subscriptions
      SET billing_cycle = COALESCE(billing_cycle, 'monthly')
      WHERE billing_cycle IS NULL;
    END IF;

    IF has_currency THEN
      UPDATE public.subscriptions
      SET currency = COALESCE(currency, 'USD')
      WHERE currency IS NULL;
    END IF;

    -- Keep one active/trialing creator subscription row per photographer.
    WITH ranked AS (
      SELECT
        s.id,
        ROW_NUMBER() OVER (
          PARTITION BY s.photographer_id
          ORDER BY
            CASE WHEN s.status::text = 'active' THEN 0 WHEN s.status::text = 'trialing' THEN 1 ELSE 2 END,
            CASE WHEN LOWER(COALESCE(s.plan_code::text, 'free')) = 'free' THEN 1 ELSE 0 END,
            s.updated_at DESC NULLS LAST,
            s.created_at DESC,
            s.id DESC
        ) AS rn
      FROM public.subscriptions s
      WHERE s.status::text IN ('active', 'trialing')
    )
    UPDATE public.subscriptions s
    SET
      status = 'canceled',
      cancel_at_period_end = TRUE,
      canceled_at = COALESCE(s.canceled_at, NOW()),
      updated_at = NOW()
    FROM ranked r
    WHERE s.id = r.id
      AND r.rn > 1;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_one_active_per_photographer
      ON public.subscriptions (photographer_id)
      WHERE status IN ('active', 'trialing');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_photographer_limits(p_photographer_id UUID)
RETURNS TABLE (
    plan_code TEXT,
    max_active_events INTEGER,
    max_photos_per_event INTEGER,
    max_face_ops_per_event INTEGER,
    storage_gb INTEGER,
    team_members INTEGER,
    platform_fee_percent DECIMAL,
    face_recognition_enabled BOOLEAN,
    custom_watermark BOOLEAN,
    live_event_mode BOOLEAN,
    api_access BOOLEAN
) AS $$
DECLARE
    v_plan_code TEXT;
    v_plan_id UUID;
BEGIN
    -- Resolve active subscription, but treat expired periods as inactive.
    SELECT s.plan_code, s.plan_id INTO v_plan_code, v_plan_id
    FROM public.subscriptions s
    WHERE s.photographer_id = p_photographer_id
      AND s.status IN ('active', 'trialing')
      AND (s.current_period_end IS NULL OR s.current_period_end >= NOW())
    ORDER BY
      CASE WHEN LOWER(COALESCE(s.plan_code::text, 'free')) = 'free' THEN 1 ELSE 0 END,
      s.updated_at DESC NULLS LAST,
      s.created_at DESC
    LIMIT 1;

    -- Guard against wrong plan_id references (e.g. drop-in/vault plans).
    IF v_plan_id IS NOT NULL THEN
      PERFORM 1
      FROM public.subscription_plans sp
      WHERE sp.id = v_plan_id
        AND sp.is_active = TRUE
        AND sp.plan_type::text IN ('creator', 'photographer');

      IF NOT FOUND THEN
        v_plan_id := NULL;
      END IF;
    END IF;

    -- If plan_id missing, resolve by plan_code in creator plans.
    IF v_plan_id IS NULL AND v_plan_code IS NOT NULL THEN
      SELECT sp.id
      INTO v_plan_id
      FROM public.subscription_plans sp
      WHERE sp.is_active = TRUE
        AND LOWER(sp.code) = LOWER(v_plan_code)
        AND sp.plan_type::text IN ('creator', 'photographer')
      ORDER BY
        CASE WHEN sp.plan_type::TEXT = 'creator' THEN 0 ELSE 1 END,
        sp.updated_at DESC NULLS LAST,
        sp.created_at DESC
      LIMIT 1;
    END IF;

    -- Default to admin-managed free creator plan.
    IF v_plan_id IS NULL THEN
      SELECT sp.id, sp.code
      INTO v_plan_id, v_plan_code
      FROM public.subscription_plans sp
      WHERE sp.is_active = TRUE
        AND sp.code = 'free'
        AND sp.plan_type::text IN ('creator', 'photographer')
      ORDER BY
        CASE WHEN sp.plan_type::TEXT = 'creator' THEN 0 ELSE 1 END,
        sp.updated_at DESC NULLS LAST,
        sp.created_at DESC
      LIMIT 1;
    END IF;

    IF v_plan_id IS NOT NULL THEN
      RETURN QUERY
      SELECT
        COALESCE(sp.code::TEXT, COALESCE(v_plan_code, 'free')) as plan_code,
        COALESCE((
          SELECT (pfa.feature_value #>> '{}')::INTEGER
          FROM public.plan_feature_assignments pfa
          JOIN public.plan_features pf ON pf.id = pfa.feature_id
          WHERE pfa.plan_id = v_plan_id AND pf.code = 'max_active_events'
          LIMIT 1
        ), (
          SELECT (pf.default_value #>> '{}')::INTEGER
          FROM public.plan_features pf
          WHERE pf.code = 'max_active_events'
          LIMIT 1
        ), 1) as max_active_events,
        COALESCE((
          SELECT (pfa.feature_value #>> '{}')::INTEGER
          FROM public.plan_feature_assignments pfa
          JOIN public.plan_features pf ON pf.id = pfa.feature_id
          WHERE pfa.plan_id = v_plan_id AND pf.code = 'max_photos_per_event'
          LIMIT 1
        ), (
          SELECT (pf.default_value #>> '{}')::INTEGER
          FROM public.plan_features pf
          WHERE pf.code = 'max_photos_per_event'
          LIMIT 1
        ), 50) as max_photos_per_event,
        COALESCE((
          SELECT (pfa.feature_value #>> '{}')::INTEGER
          FROM public.plan_feature_assignments pfa
          JOIN public.plan_features pf ON pf.id = pfa.feature_id
          WHERE pfa.plan_id = v_plan_id AND pf.code = 'max_face_ops_per_event'
          LIMIT 1
        ), (
          SELECT (pf.default_value #>> '{}')::INTEGER
          FROM public.plan_features pf
          WHERE pf.code = 'max_face_ops_per_event'
          LIMIT 1
        ), 0) as max_face_ops_per_event,
        COALESCE((
          SELECT (pfa.feature_value #>> '{}')::INTEGER
          FROM public.plan_feature_assignments pfa
          JOIN public.plan_features pf ON pf.id = pfa.feature_id
          WHERE pfa.plan_id = v_plan_id AND pf.code = 'storage_gb'
          LIMIT 1
        ), (
          SELECT (pf.default_value #>> '{}')::INTEGER
          FROM public.plan_features pf
          WHERE pf.code = 'storage_gb'
          LIMIT 1
        ), 1) as storage_gb,
        COALESCE((
          SELECT (pfa.feature_value #>> '{}')::INTEGER
          FROM public.plan_feature_assignments pfa
          JOIN public.plan_features pf ON pf.id = pfa.feature_id
          WHERE pfa.plan_id = v_plan_id AND pf.code = 'team_members'
          LIMIT 1
        ), (
          SELECT (pf.default_value #>> '{}')::INTEGER
          FROM public.plan_features pf
          WHERE pf.code = 'team_members'
          LIMIT 1
        ), 1) as team_members,
        COALESCE(sp.platform_fee_percent, 20.00) as platform_fee_percent,
        COALESCE((
          SELECT (pfa.feature_value #>> '{}')::BOOLEAN
          FROM public.plan_feature_assignments pfa
          JOIN public.plan_features pf ON pf.id = pfa.feature_id
          WHERE pfa.plan_id = v_plan_id AND pf.code = 'face_recognition_enabled'
          LIMIT 1
        ), (
          SELECT (pf.default_value #>> '{}')::BOOLEAN
          FROM public.plan_features pf
          WHERE pf.code = 'face_recognition_enabled'
          LIMIT 1
        ), FALSE) as face_recognition_enabled,
        COALESCE((
          SELECT (pfa.feature_value #>> '{}')::BOOLEAN
          FROM public.plan_feature_assignments pfa
          JOIN public.plan_features pf ON pf.id = pfa.feature_id
          WHERE pfa.plan_id = v_plan_id AND pf.code = 'custom_watermark'
          LIMIT 1
        ), (
          SELECT (pf.default_value #>> '{}')::BOOLEAN
          FROM public.plan_features pf
          WHERE pf.code = 'custom_watermark'
          LIMIT 1
        ), FALSE) as custom_watermark,
        COALESCE((
          SELECT (pfa.feature_value #>> '{}')::BOOLEAN
          FROM public.plan_feature_assignments pfa
          JOIN public.plan_features pf ON pf.id = pfa.feature_id
          WHERE pfa.plan_id = v_plan_id AND pf.code = 'live_event_mode'
          LIMIT 1
        ), (
          SELECT (pf.default_value #>> '{}')::BOOLEAN
          FROM public.plan_features pf
          WHERE pf.code = 'live_event_mode'
          LIMIT 1
        ), FALSE) as live_event_mode,
        COALESCE((
          SELECT (pfa.feature_value #>> '{}')::BOOLEAN
          FROM public.plan_feature_assignments pfa
          JOIN public.plan_features pf ON pf.id = pfa.feature_id
          WHERE pfa.plan_id = v_plan_id AND pf.code = 'api_access'
          LIMIT 1
        ), (
          SELECT (pf.default_value #>> '{}')::BOOLEAN
          FROM public.plan_features pf
          WHERE pf.code = 'api_access'
          LIMIT 1
        ), FALSE) as api_access
      FROM public.subscription_plans sp
      WHERE sp.id = v_plan_id
        AND sp.is_active = TRUE
        AND sp.plan_type::text IN ('creator', 'photographer');

      IF FOUND THEN
        RETURN;
      END IF;
    END IF;

    -- Fail-safe conservative limits if no plan can be resolved.
    RETURN QUERY
    SELECT
      'free'::TEXT,
      1::INTEGER,
      50::INTEGER,
      0::INTEGER,
      1::INTEGER,
      1::INTEGER,
      20.00::DECIMAL,
      FALSE::BOOLEAN,
      FALSE::BOOLEAN,
      FALSE::BOOLEAN,
      FALSE::BOOLEAN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_photographer_platform_fee(p_photographer_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_limits RECORD;
BEGIN
  SELECT * INTO v_limits FROM public.get_photographer_limits(p_photographer_id);
  RETURN COALESCE(v_limits.platform_fee_percent, 20.00);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
