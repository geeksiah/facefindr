-- Region-level communication provider configuration
-- Enables per-country WhatsApp/Push routing under admin control.

ALTER TABLE region_config
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS push_provider VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_region_config_communication
  ON region_config (region_code, is_active, whatsapp_enabled, push_enabled);
