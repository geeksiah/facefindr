-- ============================================
-- Financial reconciliation runs/issues
-- ============================================

CREATE TABLE IF NOT EXISTS public.financial_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key TEXT NOT NULL UNIQUE,
  trigger_source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_reconciliation_runs_status
  ON public.financial_reconciliation_runs (status, started_at DESC);

DROP TRIGGER IF EXISTS update_financial_reconciliation_runs_updated_at ON public.financial_reconciliation_runs;
CREATE TRIGGER update_financial_reconciliation_runs_updated_at
  BEFORE UPDATE ON public.financial_reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.financial_reconciliation_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.financial_reconciliation_runs(id) ON DELETE SET NULL,
  issue_key TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  auto_healed BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_reconciliation_issue_key
  ON public.financial_reconciliation_issues (issue_key);

CREATE INDEX IF NOT EXISTS idx_financial_reconciliation_issues_status
  ON public.financial_reconciliation_issues (status, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_reconciliation_issues_source
  ON public.financial_reconciliation_issues (source_kind, source_id);

DROP TRIGGER IF EXISTS update_financial_reconciliation_issues_updated_at ON public.financial_reconciliation_issues;
CREATE TRIGGER update_financial_reconciliation_issues_updated_at
  BEFORE UPDATE ON public.financial_reconciliation_issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
