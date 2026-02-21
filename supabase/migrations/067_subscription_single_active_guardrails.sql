-- Subscription single-active guardrails
-- Goals:
-- 1) Ensure one active/trialing creator subscription per photographer.
-- 2) Ensure one active/trialing attendee subscription per attendee.
-- 3) Backfill creator subscriptions.plan_id from metadata when possible.

DO $$
DECLARE
  has_plan_id boolean := false;
  subscriptions_plan_code_udt text;
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    SELECT c.udt_name
    INTO subscriptions_plan_code_udt
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'subscriptions'
      AND c.column_name = 'plan_code';

    -- Allow admin-defined dynamic plan codes (not only legacy enum values).
    IF subscriptions_plan_code_udt = 'subscription_plan' THEN
      ALTER TABLE public.subscriptions
        ALTER COLUMN plan_code TYPE VARCHAR(100) USING plan_code::text;
      ALTER TABLE public.subscriptions
        ALTER COLUMN plan_code SET DEFAULT 'free';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'subscriptions'
        AND column_name = 'plan_id'
    ) INTO has_plan_id;

    IF has_plan_id THEN
      UPDATE public.subscriptions s
      SET plan_id = (s.metadata->>'plan_id')::uuid
      WHERE s.plan_id IS NULL
        AND s.metadata ? 'plan_id'
        AND (s.metadata->>'plan_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
    END IF;

    WITH ranked AS (
      SELECT
        s.id,
        s.photographer_id,
        ROW_NUMBER() OVER (
          PARTITION BY s.photographer_id
          ORDER BY
            CASE WHEN s.status::text = 'active' THEN 0 WHEN s.status::text = 'trialing' THEN 1 ELSE 2 END,
            CASE WHEN COALESCE(s.plan_code::text, 'free') = 'free' THEN 1 ELSE 0 END,
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

  IF to_regclass('public.attendee_subscriptions') IS NOT NULL THEN
    WITH ranked AS (
      SELECT
        s.id,
        s.attendee_id,
        ROW_NUMBER() OVER (
          PARTITION BY s.attendee_id
          ORDER BY
            CASE WHEN LOWER(COALESCE(s.status, '')) = 'active' THEN 0 WHEN LOWER(COALESCE(s.status, '')) = 'trialing' THEN 1 ELSE 2 END,
            CASE WHEN LOWER(COALESCE(s.plan_code, 'free')) = 'free' THEN 1 ELSE 0 END,
            s.updated_at DESC NULLS LAST,
            s.created_at DESC,
            s.id DESC
        ) AS rn
      FROM public.attendee_subscriptions s
      WHERE LOWER(COALESCE(s.status, '')) IN ('active', 'trialing')
    )
    UPDATE public.attendee_subscriptions s
    SET
      status = 'canceled',
      canceled_at = COALESCE(s.canceled_at, NOW()),
      updated_at = NOW()
    FROM ranked r
    WHERE s.id = r.id
      AND r.rn > 1;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_attendee_subscriptions_one_active_per_attendee
      ON public.attendee_subscriptions (attendee_id)
      WHERE status IN ('active', 'trialing');
  END IF;
END $$;
