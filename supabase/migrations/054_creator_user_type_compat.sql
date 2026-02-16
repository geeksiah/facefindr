-- Migration: 054_creator_user_type_compat
-- Canonicalize user-type values to `creator` while preserving legacy compatibility.

-- ============================================
-- NORMALIZATION FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.normalize_user_type(p_user_type TEXT)
RETURNS TEXT AS $$
DECLARE
  v_user_type TEXT;
BEGIN
  IF p_user_type IS NULL THEN
    RETURN NULL;
  END IF;

  v_user_type := LOWER(TRIM(p_user_type));

  IF v_user_type IN ('photographer', 'creator') THEN
    RETURN 'creator';
  ELSIF v_user_type = 'attendee' THEN
    RETURN 'attendee';
  END IF;

  RETURN v_user_type;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- DATA BACKFILL
-- ============================================

UPDATE public.username_registry
SET user_type = public.normalize_user_type(user_type)
WHERE user_type = 'photographer';

UPDATE public.user_face_embeddings
SET user_type = public.normalize_user_type(user_type)
WHERE user_type = 'photographer';

UPDATE public.notification_queue
SET user_type = public.normalize_user_type(user_type)
WHERE user_type = 'photographer';

UPDATE public.follows
SET follower_type = public.normalize_user_type(follower_type)
WHERE follower_type = 'photographer';

UPDATE public.follows
SET following_type = public.normalize_user_type(following_type)
WHERE following_type = 'photographer';

UPDATE public.profile_views
SET profile_type = public.normalize_user_type(profile_type)
WHERE profile_type = 'photographer';

UPDATE public.ad_campaigns
SET target_user_types = ARRAY(
  SELECT public.normalize_user_type(value)
  FROM unnest(target_user_types) AS value
)
WHERE target_user_types IS NOT NULL
  AND target_user_types @> ARRAY['photographer']::TEXT[];

UPDATE auth.users
SET
  raw_user_meta_data = CASE
    WHEN raw_user_meta_data ? 'user_type'
      AND raw_user_meta_data ->> 'user_type' = 'photographer'
    THEN jsonb_set(raw_user_meta_data, '{user_type}', '"creator"'::jsonb, FALSE)
    ELSE raw_user_meta_data
  END,
  raw_app_meta_data = CASE
    WHEN raw_app_meta_data ? 'user_type'
      AND raw_app_meta_data ->> 'user_type' = 'photographer'
    THEN jsonb_set(raw_app_meta_data, '{user_type}', '"creator"'::jsonb, FALSE)
    ELSE raw_app_meta_data
  END
WHERE
  (raw_user_meta_data ? 'user_type' AND raw_user_meta_data ->> 'user_type' = 'photographer')
  OR
  (raw_app_meta_data ? 'user_type' AND raw_app_meta_data ->> 'user_type' = 'photographer');

-- ============================================
-- CHECK CONSTRAINT UPDATES (TRANSITION ACCEPTS BOTH)
-- ============================================

DO $$
DECLARE
  c RECORD;
BEGIN
  IF to_regclass('public.user_face_embeddings') IS NOT NULL THEN
    FOR c IN
      SELECT conname, oid
      FROM pg_constraint
      WHERE conrelid = 'public.user_face_embeddings'::regclass
        AND contype = 'c'
    LOOP
      IF pg_get_constraintdef(c.oid) ILIKE '%user_type%' THEN
        EXECUTE format('ALTER TABLE public.user_face_embeddings DROP CONSTRAINT %I', c.conname);
      END IF;
    END LOOP;

    ALTER TABLE public.user_face_embeddings
      ADD CONSTRAINT user_face_embeddings_user_type_check
      CHECK (user_type IN ('attendee', 'creator', 'photographer'));
  END IF;
END;
$$;

DO $$
DECLARE
  c RECORD;
BEGIN
  IF to_regclass('public.notification_queue') IS NOT NULL THEN
    FOR c IN
      SELECT conname, oid
      FROM pg_constraint
      WHERE conrelid = 'public.notification_queue'::regclass
        AND contype = 'c'
    LOOP
      IF pg_get_constraintdef(c.oid) ILIKE '%user_type%' THEN
        EXECUTE format('ALTER TABLE public.notification_queue DROP CONSTRAINT %I', c.conname);
      END IF;
    END LOOP;

    ALTER TABLE public.notification_queue
      ADD CONSTRAINT notification_queue_user_type_check
      CHECK (user_type IN ('attendee', 'creator', 'photographer'));
  END IF;
END;
$$;

-- ============================================
-- NORMALIZATION TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION public.trg_normalize_username_registry_user_type()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_type := public.normalize_user_type(NEW.user_type);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_normalize_user_face_embeddings_user_type()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_type := public.normalize_user_type(NEW.user_type);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_normalize_notification_queue_user_type()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_type := public.normalize_user_type(NEW.user_type);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_normalize_follows_user_types()
RETURNS TRIGGER AS $$
BEGIN
  NEW.follower_type := public.normalize_user_type(NEW.follower_type);
  NEW.following_type := public.normalize_user_type(NEW.following_type);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_normalize_profile_views_profile_type()
RETURNS TRIGGER AS $$
BEGIN
  NEW.profile_type := public.normalize_user_type(NEW.profile_type);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_normalize_ad_campaigns_target_user_types()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.target_user_types IS NOT NULL THEN
    NEW.target_user_types := ARRAY(
      SELECT public.normalize_user_type(value)
      FROM unnest(NEW.target_user_types) AS value
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.username_registry') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS normalize_username_registry_user_type ON public.username_registry;
    CREATE TRIGGER normalize_username_registry_user_type
      BEFORE INSERT OR UPDATE ON public.username_registry
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_normalize_username_registry_user_type();
  END IF;

  IF to_regclass('public.user_face_embeddings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS normalize_user_face_embeddings_user_type ON public.user_face_embeddings;
    CREATE TRIGGER normalize_user_face_embeddings_user_type
      BEFORE INSERT OR UPDATE ON public.user_face_embeddings
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_normalize_user_face_embeddings_user_type();
  END IF;

  IF to_regclass('public.notification_queue') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS normalize_notification_queue_user_type ON public.notification_queue;
    CREATE TRIGGER normalize_notification_queue_user_type
      BEFORE INSERT OR UPDATE ON public.notification_queue
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_normalize_notification_queue_user_type();
  END IF;

  IF to_regclass('public.follows') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS normalize_follows_user_types ON public.follows;
    CREATE TRIGGER normalize_follows_user_types
      BEFORE INSERT OR UPDATE ON public.follows
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_normalize_follows_user_types();
  END IF;

  IF to_regclass('public.profile_views') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS normalize_profile_views_profile_type ON public.profile_views;
    CREATE TRIGGER normalize_profile_views_profile_type
      BEFORE INSERT OR UPDATE ON public.profile_views
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_normalize_profile_views_profile_type();
  END IF;

  IF to_regclass('public.ad_campaigns') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS normalize_ad_campaigns_target_user_types ON public.ad_campaigns;
    CREATE TRIGGER normalize_ad_campaigns_target_user_types
      BEFORE INSERT OR UPDATE ON public.ad_campaigns
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_normalize_ad_campaigns_target_user_types();
  END IF;
END;
$$;
