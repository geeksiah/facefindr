-- Creator subscription governance: single source of truth
-- Goals:
-- 1) Canonicalize creator plan types/features to "creator" (not "photographer").
-- 2) Ensure core creator features exist and apply to creator plans.
-- 3) Backfill missing plan_feature_assignments for active creator plans.
-- 4) Make get_photographer_limits resolve only creator plans.

DO $$
DECLARE
  has_creator_plan_type boolean := false;
  creator_existed_before boolean := false;
  creator_usable_this_run boolean := false;
BEGIN
  IF to_regclass('public.subscription_plans') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'plan_type'
      AND e.enumlabel = 'creator'
  ) INTO has_creator_plan_type;
  creator_existed_before := has_creator_plan_type;

  -- Ensure canonical creator enum value exists.
  IF NOT has_creator_plan_type THEN
    BEGIN
      ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'creator';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
    END;

    SELECT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'plan_type'
        AND e.enumlabel = 'creator'
    ) INTO has_creator_plan_type;

    IF NOT has_creator_plan_type THEN
      RAISE NOTICE 'plan_type enum value "creator" not found; skipping canonical creator alignment';
      RETURN;
    END IF;
  END IF;

  -- PostgreSQL enum safety: a value added in this transaction cannot be used until commit.
  -- So canonical creator writes are only executed when creator enum existed before this run.
  creator_usable_this_run := creator_existed_before;

  IF creator_usable_this_run THEN
    -- Normalize legacy plan_type rows to creator.
    UPDATE public.subscription_plans
    SET plan_type = 'creator'::plan_type
    WHERE plan_type::text = 'photographer';
  END IF;

  IF to_regclass('public.plan_features') IS NOT NULL THEN
    -- Normalize applicable_to arrays from photographer -> creator only when safe.
    IF creator_usable_this_run THEN
      UPDATE public.plan_features pf
      SET applicable_to = (
        SELECT ARRAY(
          SELECT DISTINCT
            CASE
              WHEN v::text = 'photographer' THEN 'creator'::plan_type
              ELSE v
            END
          FROM unnest(pf.applicable_to) AS v
        )
      )
      WHERE EXISTS (
        SELECT 1
        FROM unnest(pf.applicable_to) AS v
        WHERE v::text = 'photographer'
      );
    END IF;

    -- Ensure core creator features exist.
    IF creator_usable_this_run THEN
      INSERT INTO public.plan_features (
        code,
        name,
        description,
        feature_type,
        default_value,
        applicable_to,
        category,
        display_order,
        is_active
      ) VALUES
        ('max_active_events', 'Max Active Events', 'Maximum number of active events allowed', 'limit', '1'::jsonb, ARRAY['creator']::plan_type[], 'events', 10, TRUE),
        ('max_photos_per_event', 'Max Photos Per Event', 'Maximum number of photos allowed per event', 'limit', '50'::jsonb, ARRAY['creator']::plan_type[], 'photos', 20, TRUE),
        ('max_face_ops_per_event', 'Max Face Ops Per Event', 'Maximum face operations allowed per event', 'limit', '0'::jsonb, ARRAY['creator']::plan_type[], 'face_recognition', 30, TRUE),
        ('storage_gb', 'Storage (GB)', 'Maximum storage allocation in GB', 'limit', '1'::jsonb, ARRAY['creator']::plan_type[], 'storage', 40, TRUE),
        ('team_members', 'Team Members', 'Maximum active collaborators including owner', 'limit', '1'::jsonb, ARRAY['creator']::plan_type[], 'collaboration', 50, TRUE),
        ('face_recognition_enabled', 'Face Recognition', 'Enable face recognition features', 'boolean', 'false'::jsonb, ARRAY['creator']::plan_type[], 'face_recognition', 60, TRUE),
        ('custom_watermark', 'Custom Watermark', 'Allow custom watermark uploads', 'boolean', 'false'::jsonb, ARRAY['creator']::plan_type[], 'branding', 70, TRUE),
        ('live_event_mode', 'Live Event Mode', 'Allow live mode for events', 'boolean', 'false'::jsonb, ARRAY['creator']::plan_type[], 'events', 80, TRUE),
        ('api_access', 'API Access', 'Allow API access', 'boolean', 'false'::jsonb, ARRAY['creator']::plan_type[], 'integrations', 90, TRUE)
      ON CONFLICT (code) DO NOTHING;
    ELSE
      -- Transitional insert for same-transaction enum-add safety.
      INSERT INTO public.plan_features (
        code,
        name,
        description,
        feature_type,
        default_value,
        applicable_to,
        category,
        display_order,
        is_active
      ) VALUES
        ('max_active_events', 'Max Active Events', 'Maximum number of active events allowed', 'limit', '1'::jsonb, ARRAY['photographer']::plan_type[], 'events', 10, TRUE),
        ('max_photos_per_event', 'Max Photos Per Event', 'Maximum number of photos allowed per event', 'limit', '50'::jsonb, ARRAY['photographer']::plan_type[], 'photos', 20, TRUE),
        ('max_face_ops_per_event', 'Max Face Ops Per Event', 'Maximum face operations allowed per event', 'limit', '0'::jsonb, ARRAY['photographer']::plan_type[], 'face_recognition', 30, TRUE),
        ('storage_gb', 'Storage (GB)', 'Maximum storage allocation in GB', 'limit', '1'::jsonb, ARRAY['photographer']::plan_type[], 'storage', 40, TRUE),
        ('team_members', 'Team Members', 'Maximum active collaborators including owner', 'limit', '1'::jsonb, ARRAY['photographer']::plan_type[], 'collaboration', 50, TRUE),
        ('face_recognition_enabled', 'Face Recognition', 'Enable face recognition features', 'boolean', 'false'::jsonb, ARRAY['photographer']::plan_type[], 'face_recognition', 60, TRUE),
        ('custom_watermark', 'Custom Watermark', 'Allow custom watermark uploads', 'boolean', 'false'::jsonb, ARRAY['photographer']::plan_type[], 'branding', 70, TRUE),
        ('live_event_mode', 'Live Event Mode', 'Allow live mode for events', 'boolean', 'false'::jsonb, ARRAY['photographer']::plan_type[], 'events', 80, TRUE),
        ('api_access', 'API Access', 'Allow API access', 'boolean', 'false'::jsonb, ARRAY['photographer']::plan_type[], 'integrations', 90, TRUE)
      ON CONFLICT (code) DO NOTHING;
    END IF;

    -- Ensure creator applicability exists on core creator features.
    IF creator_usable_this_run THEN
      UPDATE public.plan_features pf
      SET
        is_active = TRUE,
        applicable_to = (
          SELECT ARRAY(
            SELECT DISTINCT x
            FROM unnest(COALESCE(pf.applicable_to, ARRAY[]::plan_type[]) || ARRAY['creator'::plan_type]) AS x
          )
        )
      WHERE pf.code IN (
        'max_active_events',
        'max_photos_per_event',
        'max_face_ops_per_event',
        'storage_gb',
        'team_members',
        'face_recognition_enabled',
        'custom_watermark',
        'live_event_mode',
        'api_access'
      );
    ELSE
      UPDATE public.plan_features pf
      SET
        is_active = TRUE,
        applicable_to = (
          SELECT ARRAY(
            SELECT DISTINCT x
            FROM unnest(COALESCE(pf.applicable_to, ARRAY[]::plan_type[]) || ARRAY['photographer'::plan_type]) AS x
          )
        )
      WHERE pf.code IN (
        'max_active_events',
        'max_photos_per_event',
        'max_face_ops_per_event',
        'storage_gb',
        'team_members',
        'face_recognition_enabled',
        'custom_watermark',
        'live_event_mode',
        'api_access'
      );
    END IF;
  END IF;

  -- Backfill missing creator plan feature assignments.
  IF to_regclass('public.plan_feature_assignments') IS NOT NULL
    AND to_regclass('public.plan_features') IS NOT NULL THEN
    INSERT INTO public.plan_feature_assignments (plan_id, feature_id, feature_value)
    SELECT
      sp.id,
      pf.id,
      COALESCE(
        pf.default_value,
        CASE
          WHEN pf.feature_type = 'boolean' THEN 'false'::jsonb
          ELSE '0'::jsonb
        END
      ) AS feature_value
    FROM public.subscription_plans sp
    JOIN public.plan_features pf
      ON pf.code IN (
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
      AND sp.plan_type::text = CASE WHEN creator_usable_this_run THEN 'creator' ELSE 'photographer' END
      AND pfa.id IS NULL
    ON CONFLICT (plan_id, feature_id) DO NOTHING;
  END IF;

  IF NOT creator_usable_this_run THEN
    RAISE NOTICE 'creator enum was added in this run; run this migration once more to finalize photographer -> creator canonicalization';
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
    -- Resolve active creator subscription, treating expired periods as inactive.
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

    -- Guard against wrong plan_id references (drop-in/payg/etc).
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

    -- Resolve by plan_code inside creator plans only.
    IF v_plan_id IS NULL AND v_plan_code IS NOT NULL THEN
      SELECT sp.id
      INTO v_plan_id
      FROM public.subscription_plans sp
      WHERE sp.is_active = TRUE
        AND LOWER(sp.code) = LOWER(v_plan_code)
        AND sp.plan_type::text IN ('creator', 'photographer')
      ORDER BY sp.updated_at DESC NULLS LAST, sp.created_at DESC
      LIMIT 1;
    END IF;

    -- Fallback to active free creator plan.
    IF v_plan_id IS NULL THEN
      SELECT sp.id, sp.code
      INTO v_plan_id, v_plan_code
      FROM public.subscription_plans sp
      WHERE sp.is_active = TRUE
        AND sp.code = 'free'
        AND sp.plan_type::text IN ('creator', 'photographer')
      ORDER BY
        CASE WHEN sp.plan_type::text = 'creator' THEN 0 ELSE 1 END,
        sp.updated_at DESC NULLS LAST,
        sp.created_at DESC
      LIMIT 1;
    END IF;

    IF v_plan_id IS NOT NULL THEN
      RETURN QUERY
      SELECT
        COALESCE(sp.code::TEXT, COALESCE(v_plan_code, 'free')) AS plan_code,
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
        ), 1) AS max_active_events,
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
        ), 50) AS max_photos_per_event,
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
        ), 0) AS max_face_ops_per_event,
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
        ), 1) AS storage_gb,
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
        ), 1) AS team_members,
        COALESCE(sp.platform_fee_percent, 20.00) AS platform_fee_percent,
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
        ), FALSE) AS face_recognition_enabled,
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
        ), FALSE) AS custom_watermark,
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
        ), FALSE) AS live_event_mode,
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
        ), FALSE) AS api_access
      FROM public.subscription_plans sp
      WHERE sp.id = v_plan_id
        AND sp.is_active = TRUE
        AND sp.plan_type::text IN ('creator', 'photographer');

      IF FOUND THEN
        RETURN;
      END IF;
    END IF;

    -- Fail-safe conservative creator limits.
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
