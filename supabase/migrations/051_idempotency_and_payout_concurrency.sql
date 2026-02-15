-- ============================================
-- API IDEMPOTENCY KEYS (MUTATING ENDPOINTS)
-- ============================================

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_scope TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  response_code INTEGER,
  response_payload JSONB,
  error_payload JSONB,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (operation_scope, actor_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_status
  ON api_idempotency_keys(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_transaction
  ON api_idempotency_keys(transaction_id)
  WHERE transaction_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_api_idempotency_keys_updated_at ON api_idempotency_keys;
CREATE TRIGGER update_api_idempotency_keys_updated_at
  BEFORE UPDATE ON api_idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PAYOUT CONCURRENCY CONTROLS
-- ============================================

ALTER TABLE payouts
  ADD COLUMN IF NOT EXISTS payout_identity_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_identity_unique
  ON payouts(payout_identity_key)
  WHERE payout_identity_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS payout_batch_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL,
  run_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_type, run_key)
);

CREATE INDEX IF NOT EXISTS idx_payout_batch_runs_status
  ON payout_batch_runs(status, lease_expires_at);

DROP TRIGGER IF EXISTS update_payout_batch_runs_updated_at ON payout_batch_runs;
CREATE TRIGGER update_payout_batch_runs_updated_at
  BEFORE UPDATE ON payout_batch_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
