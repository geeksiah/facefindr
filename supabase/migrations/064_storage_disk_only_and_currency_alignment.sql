-- Storage limits: disk-only enforcement (remove photo-count limits).
-- Currency alignment support: keep plans/storage runtime schema compatible.

DO $$
BEGIN
  IF to_regclass('public.storage_plans') IS NOT NULL THEN
    ALTER TABLE public.storage_plans
      ALTER COLUMN photo_limit SET DEFAULT -1;

    UPDATE public.storage_plans
    SET photo_limit = -1
    WHERE photo_limit IS DISTINCT FROM -1;
  END IF;

  IF to_regclass('public.storage_usage') IS NOT NULL THEN
    ALTER TABLE public.storage_usage
      ALTER COLUMN photo_limit SET DEFAULT -1;

    UPDATE public.storage_usage
    SET photo_limit = -1
    WHERE photo_limit IS DISTINCT FROM -1;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.storage_usage') IS NOT NULL
    AND to_regclass('public.photo_vault') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.can_add_to_vault(
        p_user_id UUID,
        p_file_size_bytes BIGINT DEFAULT 0
      )
      RETURNS BOOLEAN AS $body$
      DECLARE
          v_usage RECORD;
      BEGIN
          SELECT * INTO v_usage
          FROM public.storage_usage
          WHERE user_id = p_user_id;

          IF v_usage IS NULL THEN
              INSERT INTO public.storage_usage (user_id, photo_limit)
              VALUES (p_user_id, -1)
              RETURNING * INTO v_usage;
          END IF;

          IF v_usage.storage_limit_bytes != -1
             AND (v_usage.total_size_bytes + p_file_size_bytes) > v_usage.storage_limit_bytes THEN
              RETURN FALSE;
          END IF;

          RETURN TRUE;
      END;
      $body$ LANGUAGE plpgsql SECURITY DEFINER
    $fn$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.storage_subscriptions') IS NOT NULL
    AND to_regclass('public.storage_plans') IS NOT NULL
    AND to_regclass('public.storage_usage') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.sync_subscription_limits(p_user_id UUID)
      RETURNS VOID AS $body$
      DECLARE
          v_plan RECORD;
      BEGIN
          SELECT sp.* INTO v_plan
          FROM public.storage_subscriptions ss
          JOIN public.storage_plans sp ON ss.plan_id = sp.id
          WHERE ss.user_id = p_user_id
            AND ss.status = 'active'
          ORDER BY ss.updated_at DESC NULLS LAST, ss.created_at DESC
          LIMIT 1;

          IF v_plan IS NULL THEN
              SELECT * INTO v_plan
              FROM public.storage_plans
              WHERE slug = 'free'
              LIMIT 1;
          END IF;

          INSERT INTO public.storage_usage (
              user_id,
              storage_limit_bytes,
              photo_limit
          ) VALUES (
              p_user_id,
              CASE
                  WHEN v_plan.storage_limit_mb = -1 THEN -1
                  ELSE v_plan.storage_limit_mb * 1024 * 1024
              END,
              -1
          )
          ON CONFLICT (user_id) DO UPDATE SET
              storage_limit_bytes = CASE
                  WHEN v_plan.storage_limit_mb = -1 THEN -1
                  ELSE v_plan.storage_limit_mb * 1024 * 1024
              END,
              photo_limit = -1,
              updated_at = NOW();
      END;
      $body$ LANGUAGE plpgsql SECURITY DEFINER
    $fn$;
  END IF;
END $$;
