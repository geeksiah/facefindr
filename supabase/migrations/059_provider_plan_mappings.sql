-- Provider plan mappings for recurring products.
-- This enables fail-closed checkout for provider/country/currency-specific recurring IDs.

CREATE TABLE IF NOT EXISTS provider_plan_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_scope VARCHAR(30) NOT NULL, -- creator_subscription | attendee_subscription | vault_subscription
  internal_plan_code VARCHAR(100) NOT NULL, -- e.g. starter | premium | pro_vault
  internal_plan_id UUID, -- optional FK to subscription_plans/storage_plans
  provider VARCHAR(50) NOT NULL, -- stripe | paypal | flutterwave | paystack
  provider_plan_id VARCHAR(255) NOT NULL, -- provider recurring plan/price identifier
  provider_product_id VARCHAR(255),
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly', -- monthly | annual | yearly
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  region_code VARCHAR(10) NOT NULL DEFAULT 'GLOBAL', -- ISO-2 or GLOBAL fallback
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_provider_plan_scope CHECK (
    product_scope IN ('creator_subscription', 'attendee_subscription', 'vault_subscription')
  ),
  CONSTRAINT chk_provider_plan_provider CHECK (
    provider IN ('stripe', 'paypal', 'flutterwave', 'paystack')
  ),
  CONSTRAINT chk_provider_plan_billing_cycle CHECK (
    billing_cycle IN ('monthly', 'annual', 'yearly')
  )
);

CREATE INDEX IF NOT EXISTS idx_provider_plan_mappings_lookup
  ON provider_plan_mappings(product_scope, internal_plan_code, provider, billing_cycle, currency, region_code, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_plan_mappings_unique
  ON provider_plan_mappings(product_scope, internal_plan_code, provider, billing_cycle, currency, region_code);

DROP TRIGGER IF EXISTS update_provider_plan_mappings_updated_at ON provider_plan_mappings;
CREATE TRIGGER update_provider_plan_mappings_updated_at
  BEFORE UPDATE ON provider_plan_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE provider_plan_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider plan mappings readable by authenticated users" ON provider_plan_mappings;
CREATE POLICY "Provider plan mappings readable by authenticated users"
  ON provider_plan_mappings FOR SELECT
  USING (auth.role() = 'authenticated');
