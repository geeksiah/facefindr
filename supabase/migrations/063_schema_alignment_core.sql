-- Core schema alignment for runtime stability.
-- Adds compatibility columns that current APIs and SQL functions depend on.

DO $$
BEGIN
  IF to_regclass('public.events') IS NOT NULL THEN
    ALTER TABLE public.events
      ADD COLUMN IF NOT EXISTS event_timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
      ADD COLUMN IF NOT EXISTS event_start_at_utc TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS event_end_at_utc TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS end_date DATE;

    UPDATE public.events
    SET event_timezone = COALESCE(NULLIF(event_timezone, ''), 'UTC')
    WHERE event_timezone IS NULL OR event_timezone = '';

    UPDATE public.events
    SET event_start_at_utc = (event_date::timestamp + INTERVAL '12 hours') AT TIME ZONE 'UTC'
    WHERE event_start_at_utc IS NULL
      AND event_date IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_events_event_start_at_utc
      ON public.events(event_start_at_utc)
      WHERE event_start_at_utc IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_events_event_timezone
      ON public.events(event_timezone);
  END IF;

  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    ALTER TABLE public.subscriptions
      ADD COLUMN IF NOT EXISTS plan_id UUID;

    CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id
      ON public.subscriptions(plan_id)
      WHERE plan_id IS NOT NULL;

    IF to_regclass('public.subscription_plans') IS NOT NULL THEN
      UPDATE public.subscriptions s
      SET plan_id = sp.id
      FROM public.subscription_plans sp
      WHERE s.plan_id IS NULL
        AND LOWER(sp.code) = LOWER(s.plan_code::text);
    END IF;
  END IF;

  IF to_regclass('public.photographers') IS NOT NULL THEN
    ALTER TABLE public.photographers
      ADD COLUMN IF NOT EXISTS user_id UUID;

    CREATE INDEX IF NOT EXISTS idx_photographers_user_id
      ON public.photographers(user_id)
      WHERE user_id IS NOT NULL;

    UPDATE public.photographers p
    SET user_id = p.id
    WHERE p.user_id IS NULL
      AND EXISTS (
        SELECT 1 FROM auth.users u WHERE u.id = p.id
      );
  END IF;

  IF to_regclass('public.attendees') IS NOT NULL THEN
    ALTER TABLE public.attendees
      ADD COLUMN IF NOT EXISTS user_id UUID;

    CREATE INDEX IF NOT EXISTS idx_attendees_user_id
      ON public.attendees(user_id)
      WHERE user_id IS NOT NULL;

    UPDATE public.attendees a
    SET user_id = a.id
    WHERE a.user_id IS NULL
      AND EXISTS (
        SELECT 1 FROM auth.users u WHERE u.id = a.id
      );
  END IF;
END $$;
