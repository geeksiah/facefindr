-- Ensure collaborator/team member plan feature exists for creator plans.
-- This enables Admin Pricing to configure collaborator limits per plan.

DO $$
BEGIN
  IF to_regclass('public.plan_features') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.plan_features
      WHERE code = 'team_members'
    ) THEN
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
      ) VALUES (
        'team_members',
        'Team Members / Collaborators',
        'Maximum active team members allowed across creator events (owner included). Use -1 for unlimited.',
        'limit',
        '1'::jsonb,
        ARRAY['photographer']::plan_type[],
        'collaboration',
        35,
        TRUE
      );
    END IF;
  END IF;
END $$;

