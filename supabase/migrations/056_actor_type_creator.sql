-- Migration: 056_actor_type_creator
-- Extend actor_type enum with `creator` and canonicalize audit writes.

-- ============================================
-- ENUM EXTENSION
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'actor_type'
      AND e.enumlabel = 'creator'
  ) THEN
    ALTER TYPE actor_type ADD VALUE 'creator';
  END IF;
END;
$$;

-- ============================================
-- DATA BACKFILL
-- ============================================

UPDATE public.audit_logs
SET actor_type = 'creator'::actor_type
WHERE actor_type = 'photographer'::actor_type;

-- ============================================
-- NORMALIZATION HELPERS
-- ============================================

CREATE OR REPLACE FUNCTION public.normalize_actor_type(p_actor_type actor_type)
RETURNS actor_type AS $$
BEGIN
  IF p_actor_type = 'photographer'::actor_type THEN
    RETURN 'creator'::actor_type;
  END IF;

  RETURN p_actor_type;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.trg_normalize_audit_actor_type()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actor_type := public.normalize_actor_type(NEW.actor_type);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS normalize_audit_actor_type ON public.audit_logs;
    CREATE TRIGGER normalize_audit_actor_type
      BEFORE INSERT OR UPDATE ON public.audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_normalize_audit_actor_type();
  END IF;
END;
$$;
