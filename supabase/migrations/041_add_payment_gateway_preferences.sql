-- ============================================
-- ADD PAYMENT GATEWAY PREFERENCES
-- ============================================
-- Adds support for user payment gateway preferences
-- and country codes for gateway selection

-- Add preferred_payment_gateway to subscription_settings
ALTER TABLE subscription_settings 
ADD COLUMN IF NOT EXISTS preferred_payment_gateway VARCHAR(20);

-- Add country_code to attendees if not exists
ALTER TABLE attendees 
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

-- Add country_code to photographers if not exists  
ALTER TABLE photographers 
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

-- Add index for country-based queries
CREATE INDEX IF NOT EXISTS idx_attendees_country ON attendees(country_code) WHERE country_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photographers_country ON photographers(country_code) WHERE country_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscription_settings_gateway ON subscription_settings(preferred_payment_gateway) WHERE preferred_payment_gateway IS NOT NULL;

-- Add comment
COMMENT ON COLUMN subscription_settings.preferred_payment_gateway IS 
'User preferred payment gateway: stripe, flutterwave, or paypal. Used for checkout gateway selection.';

COMMENT ON COLUMN attendees.country_code IS 
'ISO 3166-1 alpha-2 country code (e.g., US, GH, NG). Used for payment gateway selection.';

COMMENT ON COLUMN photographers.country_code IS 
'ISO 3166-1 alpha-2 country code (e.g., US, GH, NG). Used for payment gateway selection.';
