-- Migration: 049_add_payg_plan_type
-- Adds PAYG as a first-class plan type for runtime/admin pricing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'plan_type'
      AND e.enumlabel = 'payg'
  ) THEN
    ALTER TYPE plan_type ADD VALUE 'payg';
  END IF;
END $$;
