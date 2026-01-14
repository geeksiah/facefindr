-- ============================================
-- Mobile Money Providers
-- Real providers for Africa region
-- ============================================

CREATE TABLE IF NOT EXISTS mobile_money_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code TEXT NOT NULL UNIQUE,
  provider_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  supports_name_verification BOOLEAN DEFAULT false,
  number_prefix TEXT, -- comma separated prefixes
  number_length INTEGER DEFAULT 10,
  api_provider TEXT DEFAULT 'flutterwave', -- flutterwave, paystack, mtn
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_momo_country ON mobile_money_providers(country_code);
CREATE INDEX idx_momo_active ON mobile_money_providers(is_active);

-- ============================================
-- Insert Real Providers
-- ============================================

-- Ghana Providers
INSERT INTO mobile_money_providers (provider_code, provider_name, country_code, country_name, currency_code, number_prefix, number_length, supports_name_verification) VALUES
('mtn_gh', 'MTN Mobile Money', 'GH', 'Ghana', 'GHS', '024,054,055,059', 10, true),
('vodafone_gh', 'Vodafone Cash', 'GH', 'Ghana', 'GHS', '020,050', 10, true),
('airteltigo_gh', 'AirtelTigo Money', 'GH', 'Ghana', 'GHS', '027,026,057,056', 10, true);

-- Nigeria Providers
INSERT INTO mobile_money_providers (provider_code, provider_name, country_code, country_name, currency_code, number_prefix, number_length, supports_name_verification) VALUES
('opay_ng', 'OPay', 'NG', 'Nigeria', 'NGN', '090,080,070', 11, false),
('palmpay_ng', 'PalmPay', 'NG', 'Nigeria', 'NGN', '090,080,070', 11, false),
('paga_ng', 'Paga', 'NG', 'Nigeria', 'NGN', '090,080,070', 11, false);

-- Kenya Providers
INSERT INTO mobile_money_providers (provider_code, provider_name, country_code, country_name, currency_code, number_prefix, number_length, supports_name_verification) VALUES
('mpesa_ke', 'M-Pesa', 'KE', 'Kenya', 'KES', '07,01', 10, true),
('airtel_ke', 'Airtel Money', 'KE', 'Kenya', 'KES', '073,0733', 10, false);

-- Uganda Providers
INSERT INTO mobile_money_providers (provider_code, provider_name, country_code, country_name, currency_code, number_prefix, number_length, supports_name_verification) VALUES
('mtn_ug', 'MTN Mobile Money', 'UG', 'Uganda', 'UGX', '077,078', 10, true),
('airtel_ug', 'Airtel Money', 'UG', 'Uganda', 'UGX', '070,075', 10, false);

-- Tanzania Providers
INSERT INTO mobile_money_providers (provider_code, provider_name, country_code, country_name, currency_code, number_prefix, number_length, supports_name_verification) VALUES
('mpesa_tz', 'M-Pesa', 'TZ', 'Tanzania', 'TZS', '067,065', 10, true),
('tigopesa_tz', 'Tigo Pesa', 'TZ', 'Tanzania', 'TZS', '065,067', 10, false),
('airtel_tz', 'Airtel Money', 'TZ', 'Tanzania', 'TZS', '068,069', 10, false);

-- South Africa Providers
INSERT INTO mobile_money_providers (provider_code, provider_name, country_code, country_name, currency_code, number_prefix, number_length, supports_name_verification) VALUES
('vodapay_za', 'VodaPay', 'ZA', 'South Africa', 'ZAR', '06,07,08', 10, false),
('snapscan_za', 'SnapScan', 'ZA', 'South Africa', 'ZAR', '06,07,08', 10, false);

-- Rwanda Providers
INSERT INTO mobile_money_providers (provider_code, provider_name, country_code, country_name, currency_code, number_prefix, number_length, supports_name_verification) VALUES
('mtn_rw', 'MTN Mobile Money', 'RW', 'Rwanda', 'RWF', '078,079', 10, true),
('airtel_rw', 'Airtel Money', 'RW', 'Rwanda', 'RWF', '072,073', 10, false);

-- Zambia Providers
INSERT INTO mobile_money_providers (provider_code, provider_name, country_code, country_name, currency_code, number_prefix, number_length, supports_name_verification) VALUES
('mtn_zm', 'MTN Mobile Money', 'ZM', 'Zambia', 'ZMW', '096,076', 10, true),
('airtel_zm', 'Airtel Money', 'ZM', 'Zambia', 'ZMW', '097,077', 10, false);

-- Cameroon Providers
INSERT INTO mobile_money_providers (provider_code, provider_name, country_code, country_name, currency_code, number_prefix, number_length, supports_name_verification) VALUES
('mtn_cm', 'MTN Mobile Money', 'CM', 'Cameroon', 'XAF', '067,650,651,652,653,654,680', 9, true),
('orange_cm', 'Orange Money', 'CM', 'Cameroon', 'XAF', '069,655,656,657,658,659', 9, false);

-- Senegal Providers
INSERT INTO mobile_money_providers (provider_code, provider_name, country_code, country_name, currency_code, number_prefix, number_length, supports_name_verification) VALUES
('orange_sn', 'Orange Money', 'SN', 'Senegal', 'XOF', '77,78', 9, false),
('wave_sn', 'Wave', 'SN', 'Senegal', 'XOF', '77,78', 9, false);

-- Cote d'Ivoire Providers
INSERT INTO mobile_money_providers (provider_code, provider_name, country_code, country_name, currency_code, number_prefix, number_length, supports_name_verification) VALUES
('mtn_ci', 'MTN Mobile Money', 'CI', 'Côte d''Ivoire', 'XOF', '05,04', 10, true),
('orange_ci', 'Orange Money', 'CI', 'Côte d''Ivoire', 'XOF', '07,08', 10, false),
('moov_ci', 'Moov Money', 'CI', 'Côte d''Ivoire', 'XOF', '01,02', 10, false);
