-- Migration: 055_creator_plan_type_compat
-- Extend plan_type with `creator`, backfill canonical values, keep legacy enum accepted.

-- ============================================
-- ENUM EXTENSION
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'plan_type'
      AND e.enumlabel = 'creator'
  ) THEN
    ALTER TYPE plan_type ADD VALUE 'creator';
  END IF;
END;
$$;

-- ============================================
-- DATA BACKFILL
-- ============================================

UPDATE public.subscription_plans
SET plan_type = 'creator'::plan_type
WHERE plan_type = 'photographer'::plan_type;

UPDATE public.plan_features
SET applicable_to = ARRAY(
  SELECT CASE
    WHEN value = 'photographer'::plan_type THEN 'creator'::plan_type
    ELSE value
  END
  FROM unnest(applicable_to) AS value
)
WHERE applicable_to @> ARRAY['photographer'::plan_type];

-- ============================================
-- DEFAULTS TO CANONICAL VALUE
-- ============================================

ALTER TABLE IF EXISTS public.subscription_plans
  ALTER COLUMN plan_type SET DEFAULT 'creator'::plan_type;

ALTER TABLE IF EXISTS public.plan_features
  ALTER COLUMN applicable_to SET DEFAULT ARRAY['creator'::plan_type, 'drop_in'::plan_type];

-- ============================================
-- NORMALIZATION HELPERS
-- ============================================

CREATE OR REPLACE FUNCTION public.normalize_plan_type(p_plan_type plan_type)
RETURNS plan_type AS $$
BEGIN
  IF p_plan_type = 'photographer'::plan_type THEN
    RETURN 'creator'::plan_type;
  END IF;

  RETURN p_plan_type;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.trg_normalize_subscription_plans_plan_type()
RETURNS TRIGGER AS $$
BEGIN
  NEW.plan_type := public.normalize_plan_type(NEW.plan_type);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_normalize_plan_features_applicable_to()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.applicable_to IS NOT NULL THEN
    NEW.applicable_to := ARRAY(
      SELECT public.normalize_plan_type(value)
      FROM unnest(NEW.applicable_to) AS value
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.subscription_plans') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS normalize_subscription_plans_plan_type ON public.subscription_plans;
    CREATE TRIGGER normalize_subscription_plans_plan_type
      BEFORE INSERT OR UPDATE ON public.subscription_plans
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_normalize_subscription_plans_plan_type();
  END IF;

  IF to_regclass('public.plan_features') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS normalize_plan_features_applicable_to ON public.plan_features;
    CREATE TRIGGER normalize_plan_features_applicable_to
      BEFORE INSERT OR UPDATE ON public.plan_features
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_normalize_plan_features_applicable_to();
  END IF;
END;
$$;
