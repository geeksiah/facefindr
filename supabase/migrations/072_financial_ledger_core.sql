-- ============================================
-- Financial Ledger Core (append-only, idempotent)
-- ============================================

CREATE TABLE IF NOT EXISTS public.financial_accounts (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.financial_accounts (code, name, is_active)
VALUES
  ('platform_cash_clearing', 'Platform Cash Clearing', TRUE),
  ('platform_revenue', 'Platform Revenue', TRUE),
  ('provider_fee_expense', 'Provider Fee Expense', TRUE),
  ('creator_payable', 'Creator Payable', TRUE),
  ('attendee_credit_liability', 'Attendee Credit Liability', TRUE),
  ('creator_payouts', 'Creator Payouts', TRUE),
  ('refunds_contra_revenue', 'Refunds Contra Revenue', TRUE)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    is_active = EXCLUDED.is_active;

CREATE TABLE IF NOT EXISTS public.financial_journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  flow_type TEXT NOT NULL,
  provider TEXT,
  currency TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_journals_source
  ON public.financial_journals (source_kind, source_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_journals_flow
  ON public.financial_journals (flow_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.financial_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id UUID NOT NULL REFERENCES public.financial_journals(id) ON DELETE RESTRICT,
  account_code TEXT NOT NULL REFERENCES public.financial_accounts(code) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL,
  counterparty_type TEXT,
  counterparty_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_postings_journal
  ON public.financial_postings (journal_id);

CREATE INDEX IF NOT EXISTS idx_financial_postings_account
  ON public.financial_postings (account_code, currency);

CREATE INDEX IF NOT EXISTS idx_financial_postings_counterparty
  ON public.financial_postings (counterparty_type, counterparty_id, currency);

CREATE OR REPLACE FUNCTION public.prevent_financial_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'financial ledger is append-only';
END;
$$;

DROP TRIGGER IF EXISTS tr_prevent_financial_journal_update ON public.financial_journals;
CREATE TRIGGER tr_prevent_financial_journal_update
  BEFORE UPDATE ON public.financial_journals
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_financial_ledger_mutation();

DROP TRIGGER IF EXISTS tr_prevent_financial_journal_delete ON public.financial_journals;
CREATE TRIGGER tr_prevent_financial_journal_delete
  BEFORE DELETE ON public.financial_journals
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_financial_ledger_mutation();

DROP TRIGGER IF EXISTS tr_prevent_financial_posting_update ON public.financial_postings;
CREATE TRIGGER tr_prevent_financial_posting_update
  BEFORE UPDATE ON public.financial_postings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_financial_ledger_mutation();

DROP TRIGGER IF EXISTS tr_prevent_financial_posting_delete ON public.financial_postings;
CREATE TRIGGER tr_prevent_financial_posting_delete
  BEFORE DELETE ON public.financial_postings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_financial_ledger_mutation();

CREATE OR REPLACE FUNCTION public.record_financial_journal(
  p_idempotency_key TEXT,
  p_source_kind TEXT,
  p_source_id TEXT,
  p_flow_type TEXT,
  p_currency TEXT,
  p_postings JSONB,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_description TEXT DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_occurred_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (journal_id UUID, replayed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id UUID;
  v_journal_id UUID;
  v_posting JSONB;
  v_account_code TEXT;
  v_direction TEXT;
  v_amount_minor BIGINT;
  v_currency TEXT;
  v_counterparty_type TEXT;
  v_counterparty_id TEXT;
  v_posting_metadata JSONB;
  v_debit_total BIGINT := 0;
  v_credit_total BIGINT := 0;
BEGIN
  IF COALESCE(TRIM(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;

  IF COALESCE(TRIM(p_source_kind), '') = '' OR COALESCE(TRIM(p_source_id), '') = '' THEN
    RAISE EXCEPTION 'source_kind and source_id are required';
  END IF;

  IF COALESCE(TRIM(p_flow_type), '') = '' THEN
    RAISE EXCEPTION 'flow_type is required';
  END IF;

  IF COALESCE(TRIM(p_currency), '') = '' THEN
    RAISE EXCEPTION 'currency is required';
  END IF;

  SELECT fj.id
  INTO v_existing_id
  FROM public.financial_journals fj
  WHERE fj.idempotency_key = p_idempotency_key
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, TRUE;
    RETURN;
  END IF;

  IF jsonb_typeof(p_postings) <> 'array' OR jsonb_array_length(p_postings) < 2 THEN
    RAISE EXCEPTION 'postings must be a JSON array with at least 2 items';
  END IF;

  FOR v_posting IN
    SELECT value
    FROM jsonb_array_elements(p_postings)
  LOOP
    v_account_code := LOWER(TRIM(COALESCE(v_posting->>'account_code', '')));
    v_direction := LOWER(TRIM(COALESCE(v_posting->>'direction', '')));
    v_amount_minor := COALESCE((v_posting->>'amount_minor')::BIGINT, 0);
    v_currency := UPPER(TRIM(COALESCE(v_posting->>'currency', p_currency)));
    v_counterparty_type := NULLIF(TRIM(COALESCE(v_posting->>'counterparty_type', '')), '');
    v_counterparty_id := NULLIF(TRIM(COALESCE(v_posting->>'counterparty_id', '')), '');
    v_posting_metadata := COALESCE(v_posting->'metadata', '{}'::jsonb);

    IF v_account_code = '' THEN
      RAISE EXCEPTION 'posting account_code is required';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.financial_accounts fa
      WHERE fa.code = v_account_code
        AND fa.is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'unknown financial account: %', v_account_code;
    END IF;

    IF v_direction NOT IN ('debit', 'credit') THEN
      RAISE EXCEPTION 'posting direction must be debit or credit';
    END IF;

    IF v_amount_minor <= 0 THEN
      RAISE EXCEPTION 'posting amount_minor must be > 0';
    END IF;

    IF v_currency <> UPPER(TRIM(p_currency)) THEN
      RAISE EXCEPTION 'posting currency must match journal currency';
    END IF;

    IF v_direction = 'debit' THEN
      v_debit_total := v_debit_total + v_amount_minor;
    ELSE
      v_credit_total := v_credit_total + v_amount_minor;
    END IF;
  END LOOP;

  IF v_debit_total <> v_credit_total THEN
    RAISE EXCEPTION 'unbalanced journal: debits % != credits %', v_debit_total, v_credit_total;
  END IF;

  INSERT INTO public.financial_journals (
    idempotency_key,
    source_kind,
    source_id,
    flow_type,
    provider,
    currency,
    description,
    metadata,
    occurred_at
  )
  VALUES (
    p_idempotency_key,
    LOWER(TRIM(p_source_kind)),
    TRIM(p_source_id),
    LOWER(TRIM(p_flow_type)),
    NULLIF(LOWER(TRIM(COALESCE(p_provider, ''))), ''),
    UPPER(TRIM(p_currency)),
    NULLIF(TRIM(COALESCE(p_description, '')), ''),
    COALESCE(p_metadata, '{}'::jsonb),
    COALESCE(p_occurred_at, NOW())
  )
  RETURNING id INTO v_journal_id;

  FOR v_posting IN
    SELECT value
    FROM jsonb_array_elements(p_postings)
  LOOP
    INSERT INTO public.financial_postings (
      journal_id,
      account_code,
      direction,
      amount_minor,
      currency,
      counterparty_type,
      counterparty_id,
      metadata
    )
    VALUES (
      v_journal_id,
      LOWER(TRIM(COALESCE(v_posting->>'account_code', ''))),
      LOWER(TRIM(COALESCE(v_posting->>'direction', ''))),
      COALESCE((v_posting->>'amount_minor')::BIGINT, 0),
      UPPER(TRIM(COALESCE(v_posting->>'currency', p_currency))),
      NULLIF(TRIM(COALESCE(v_posting->>'counterparty_type', '')), ''),
      NULLIF(TRIM(COALESCE(v_posting->>'counterparty_id', '')), ''),
      COALESCE(v_posting->'metadata', '{}'::jsonb)
    );
  END LOOP;

  RETURN QUERY SELECT v_journal_id, FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_financial_journal(
  TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, TIMESTAMPTZ
) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.financial_account_balances AS
SELECT
  fp.account_code,
  fp.currency,
  SUM(CASE WHEN fp.direction = 'debit' THEN fp.amount_minor ELSE 0 END)::BIGINT AS debit_minor,
  SUM(CASE WHEN fp.direction = 'credit' THEN fp.amount_minor ELSE 0 END)::BIGINT AS credit_minor,
  SUM(CASE WHEN fp.direction = 'debit' THEN fp.amount_minor ELSE -fp.amount_minor END)::BIGINT AS net_minor,
  COUNT(DISTINCT fp.journal_id)::BIGINT AS journal_count,
  MAX(fj.occurred_at) AS last_activity_at
FROM public.financial_postings fp
JOIN public.financial_journals fj ON fj.id = fp.journal_id
GROUP BY fp.account_code, fp.currency;

CREATE OR REPLACE VIEW public.financial_creator_settlement_view AS
SELECT
  fp.counterparty_id AS creator_id,
  fp.currency,
  SUM(CASE WHEN fp.account_code = 'creator_payable' AND fp.direction = 'credit' THEN fp.amount_minor ELSE 0 END)::BIGINT AS creator_payable_accrued_minor,
  SUM(CASE WHEN fp.account_code = 'creator_payable' AND fp.direction = 'debit' THEN fp.amount_minor ELSE 0 END)::BIGINT AS creator_payable_released_minor,
  SUM(CASE WHEN fp.account_code = 'creator_payouts' AND fp.direction = 'credit' THEN fp.amount_minor ELSE 0 END)::BIGINT AS creator_payout_completed_minor,
  SUM(CASE WHEN fp.account_code = 'creator_payouts' AND fp.direction = 'debit' THEN fp.amount_minor ELSE 0 END)::BIGINT AS creator_payout_reversed_minor,
  (
    SUM(CASE WHEN fp.account_code = 'creator_payable' AND fp.direction = 'credit' THEN fp.amount_minor ELSE 0 END)
    -
    SUM(CASE WHEN fp.account_code = 'creator_payable' AND fp.direction = 'debit' THEN fp.amount_minor ELSE 0 END)
  )::BIGINT AS creator_payable_outstanding_minor,
  MAX(fj.occurred_at) AS last_activity_at
FROM public.financial_postings fp
JOIN public.financial_journals fj ON fj.id = fp.journal_id
WHERE fp.counterparty_type = 'creator'
  AND fp.counterparty_id IS NOT NULL
GROUP BY fp.counterparty_id, fp.currency;

CREATE OR REPLACE VIEW public.financial_admin_activity_view AS
SELECT
  fj.id AS journal_id,
  fj.occurred_at,
  fj.flow_type AS financial_flow_type,
  fj.source_kind,
  fj.source_id,
  fj.currency,
  fj.provider,
  fj.description,
  SUM(CASE
    WHEN fp.account_code = 'platform_revenue' AND fp.direction = 'credit' THEN fp.amount_minor
    WHEN fp.account_code = 'platform_revenue' AND fp.direction = 'debit' THEN -fp.amount_minor
    ELSE 0
  END)::BIGINT AS platform_revenue_minor,
  SUM(CASE
    WHEN fp.account_code = 'provider_fee_expense' AND fp.direction = 'credit' THEN fp.amount_minor
    WHEN fp.account_code = 'provider_fee_expense' AND fp.direction = 'debit' THEN -fp.amount_minor
    ELSE 0
  END)::BIGINT AS provider_fee_minor,
  SUM(CASE
    WHEN fp.account_code = 'creator_payable' AND fp.direction = 'credit' THEN fp.amount_minor
    WHEN fp.account_code = 'creator_payable' AND fp.direction = 'debit' THEN -fp.amount_minor
    ELSE 0
  END)::BIGINT AS creator_payable_minor,
  SUM(CASE
    WHEN fp.account_code = 'attendee_credit_liability' AND fp.direction = 'credit' THEN fp.amount_minor
    WHEN fp.account_code = 'attendee_credit_liability' AND fp.direction = 'debit' THEN -fp.amount_minor
    ELSE 0
  END)::BIGINT AS attendee_credit_liability_minor,
  MAX(NULLIF(fp.counterparty_id, '')) FILTER (WHERE fp.counterparty_type = 'creator') AS creator_id,
  fj.metadata
FROM public.financial_journals fj
JOIN public.financial_postings fp ON fp.journal_id = fj.id
GROUP BY
  fj.id,
  fj.occurred_at,
  fj.flow_type,
  fj.source_kind,
  fj.source_id,
  fj.currency,
  fj.provider,
  fj.description,
  fj.metadata;
