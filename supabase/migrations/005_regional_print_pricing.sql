-- Ferchr Database Migration
-- Migration: 005_regional_print_pricing
-- Description: Region-specific pricing for print products

-- ============================================
-- PRINT REGIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS print_regions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Region info
    region_code VARCHAR(10) NOT NULL UNIQUE, -- e.g., 'US', 'GH', 'NG', 'EU'
    region_name VARCHAR(100) NOT NULL,
    
    -- Countries in this region
    countries TEXT[] NOT NULL, -- ['US'], ['GH'], ['NG', 'GH'], ['DE', 'FR', 'IT']
    
    -- Currency
    currency VARCHAR(3) NOT NULL,
    
    -- Default fulfillment partner
    default_fulfillment_partner VARCHAR(100),
    
    -- Shipping estimates
    default_production_days INTEGER DEFAULT 3,
    default_shipping_days INTEGER DEFAULT 5,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default regions
INSERT INTO print_regions (region_code, region_name, countries, currency, default_fulfillment_partner, default_production_days, default_shipping_days)
VALUES
    ('US', 'United States', ARRAY['US'], 'USD', 'PrintifyUS', 2, 5),
    ('GB', 'United Kingdom', ARRAY['GB'], 'GBP', 'PrintifyUK', 3, 5),
    ('EU', 'Europe', ARRAY['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE'], 'EUR', 'PrintifyEU', 3, 7),
    ('GH', 'Ghana', ARRAY['GH'], 'GHS', 'GhanaPrint', 3, 3),
    ('NG', 'Nigeria', ARRAY['NG'], 'NGN', 'NigeriaPrint', 3, 4),
    ('KE', 'Kenya', ARRAY['KE'], 'KES', 'KenyaPrint', 3, 4),
    ('ZA', 'South Africa', ARRAY['ZA'], 'ZAR', 'SAPrint', 3, 5)
ON CONFLICT (region_code) DO UPDATE SET
    region_name = EXCLUDED.region_name,
    countries = EXCLUDED.countries,
    currency = EXCLUDED.currency,
    default_fulfillment_partner = EXCLUDED.default_fulfillment_partner,
    updated_at = NOW();

-- ============================================
-- REGIONAL PRODUCT PRICING TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS print_product_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- References
    product_id UUID NOT NULL REFERENCES print_products(id) ON DELETE CASCADE,
    region_id UUID NOT NULL REFERENCES print_regions(id) ON DELETE CASCADE,
    
    -- Pricing in region's currency (in cents/smallest unit)
    base_cost INTEGER NOT NULL,        -- Our cost (production + domestic shipping)
    base_price INTEGER NOT NULL,       -- Minimum selling price (cost + our margin)
    suggested_price INTEGER NOT NULL,  -- Suggested retail
    max_price INTEGER,                 -- Maximum allowed
    
    -- Shipping
    shipping_cost INTEGER DEFAULT 0,   -- Additional shipping cost
    express_shipping_cost INTEGER,     -- Express option
    
    -- Fulfillment override
    fulfillment_partner VARCHAR(100),
    production_days INTEGER,
    shipping_days INTEGER,
    
    -- Status
    is_available BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(product_id, region_id)
);

CREATE INDEX IF NOT EXISTS idx_product_pricing_product ON print_product_pricing(product_id);
CREATE INDEX IF NOT EXISTS idx_product_pricing_region ON print_product_pricing(region_id);
CREATE INDEX IF NOT EXISTS idx_product_pricing_available ON print_product_pricing(is_available) WHERE is_available = TRUE;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_print_product_pricing_updated_at ON print_product_pricing;
CREATE TRIGGER update_print_product_pricing_updated_at 
    BEFORE UPDATE ON print_product_pricing 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INSERT REGIONAL PRICING DATA
-- ============================================

-- Helper function to get region ID
CREATE OR REPLACE FUNCTION get_region_id(p_region_code VARCHAR)
RETURNS UUID AS $$
    SELECT id FROM print_regions WHERE region_code = p_region_code;
$$ LANGUAGE SQL;

-- Helper function to get product ID
CREATE OR REPLACE FUNCTION get_print_product_id(p_size_code VARCHAR)
RETURNS UUID AS $$
    SELECT id FROM print_products WHERE size_code = p_size_code LIMIT 1;
$$ LANGUAGE SQL;

-- Insert regional pricing for 4x6 Print
INSERT INTO print_product_pricing (product_id, region_id, base_cost, base_price, suggested_price, max_price, shipping_cost)
SELECT 
    get_print_product_id('4x6'),
    get_region_id(region_code),
    base_cost,
    base_price,
    suggested_price,
    max_price,
    shipping
FROM (VALUES
    -- (region, base_cost, base_price, suggested, max, shipping)
    ('US', 150, 299, 499, 999, 0),      -- USA: $1.50 cost, $2.99-$9.99
    ('GB', 150, 299, 499, 999, 0),      -- UK: £1.50 cost, £2.99-£9.99
    ('EU', 180, 349, 549, 1099, 0),     -- EU: €1.80 cost, €3.49-€10.99
    ('GH', 800, 1500, 2500, 5000, 500), -- Ghana: GHS 8 cost, GHS 15-50
    ('NG', 15000, 30000, 50000, 100000, 10000), -- Nigeria: ₦150 cost, ₦300-₦1,000
    ('KE', 10000, 20000, 35000, 70000, 5000),   -- Kenya: KES 100 cost, KES 200-700
    ('ZA', 2500, 4500, 7500, 15000, 2000)       -- SA: R25 cost, R45-R150
) AS data(region_code, base_cost, base_price, suggested_price, max_price, shipping)
WHERE get_print_product_id('4x6') IS NOT NULL
ON CONFLICT (product_id, region_id) DO UPDATE SET
    base_cost = EXCLUDED.base_cost,
    base_price = EXCLUDED.base_price,
    suggested_price = EXCLUDED.suggested_price,
    max_price = EXCLUDED.max_price,
    shipping_cost = EXCLUDED.shipping_cost;

-- Insert regional pricing for 8x10 Print
INSERT INTO print_product_pricing (product_id, region_id, base_cost, base_price, suggested_price, max_price, shipping_cost)
SELECT 
    get_print_product_id('8x10'),
    get_region_id(region_code),
    base_cost,
    base_price,
    suggested_price,
    max_price,
    shipping
FROM (VALUES
    ('US', 450, 699, 1299, 2499, 0),
    ('GB', 400, 650, 1199, 2299, 0),
    ('EU', 500, 799, 1399, 2699, 0),
    ('GH', 2500, 4500, 8000, 15000, 1000),
    ('NG', 50000, 90000, 150000, 300000, 20000),
    ('KE', 35000, 60000, 100000, 200000, 10000),
    ('ZA', 7500, 12000, 20000, 40000, 4000)
) AS data(region_code, base_cost, base_price, suggested_price, max_price, shipping)
WHERE get_print_product_id('8x10') IS NOT NULL
ON CONFLICT (product_id, region_id) DO UPDATE SET
    base_cost = EXCLUDED.base_cost,
    base_price = EXCLUDED.base_price,
    suggested_price = EXCLUDED.suggested_price,
    max_price = EXCLUDED.max_price,
    shipping_cost = EXCLUDED.shipping_cost;

-- Insert regional pricing for 8x10 Framed
INSERT INTO print_product_pricing (product_id, region_id, base_cost, base_price, suggested_price, max_price, shipping_cost)
SELECT 
    get_print_product_id('8x10-frame'),
    get_region_id(region_code),
    base_cost,
    base_price,
    suggested_price,
    max_price,
    shipping
FROM (VALUES
    ('US', 1500, 2499, 3999, 7999, 0),
    ('GB', 1400, 2299, 3699, 7499, 0),
    ('EU', 1600, 2699, 4299, 8499, 0),
    ('GH', 8000, 15000, 25000, 50000, 2000),
    ('NG', 150000, 280000, 450000, 900000, 50000),
    ('KE', 100000, 180000, 300000, 600000, 25000),
    ('ZA', 25000, 42000, 70000, 140000, 8000)
) AS data(region_code, base_cost, base_price, suggested_price, max_price, shipping)
WHERE get_print_product_id('8x10-frame') IS NOT NULL
ON CONFLICT (product_id, region_id) DO UPDATE SET
    base_cost = EXCLUDED.base_cost,
    base_price = EXCLUDED.base_price,
    suggested_price = EXCLUDED.suggested_price,
    max_price = EXCLUDED.max_price,
    shipping_cost = EXCLUDED.shipping_cost;

-- Insert regional pricing for 8x10 Canvas
INSERT INTO print_product_pricing (product_id, region_id, base_cost, base_price, suggested_price, max_price, shipping_cost)
SELECT 
    get_print_product_id('8x10-canvas'),
    get_region_id(region_code),
    base_cost,
    base_price,
    suggested_price,
    max_price,
    shipping
FROM (VALUES
    ('US', 2000, 3499, 4999, 8999, 0),
    ('GB', 1800, 3199, 4599, 8299, 0),
    ('EU', 2200, 3799, 5399, 9699, 0),
    ('GH', 12000, 22000, 35000, 70000, 3000),
    ('NG', 220000, 400000, 650000, 1300000, 75000),
    ('KE', 150000, 270000, 440000, 880000, 35000),
    ('ZA', 35000, 60000, 100000, 200000, 12000)
) AS data(region_code, base_cost, base_price, suggested_price, max_price, shipping)
WHERE get_print_product_id('8x10-canvas') IS NOT NULL
ON CONFLICT (product_id, region_id) DO UPDATE SET
    base_cost = EXCLUDED.base_cost,
    base_price = EXCLUDED.base_price,
    suggested_price = EXCLUDED.suggested_price,
    max_price = EXCLUDED.max_price,
    shipping_cost = EXCLUDED.shipping_cost;

-- ============================================
-- HELPER FUNCTION: Get product pricing for region
-- ============================================

CREATE OR REPLACE FUNCTION get_product_pricing(
    p_product_id UUID,
    p_country_code VARCHAR
)
RETURNS TABLE(
    product_id UUID,
    region_code VARCHAR,
    currency VARCHAR,
    base_cost INTEGER,
    base_price INTEGER,
    suggested_price INTEGER,
    max_price INTEGER,
    shipping_cost INTEGER,
    fulfillment_partner VARCHAR,
    production_days INTEGER,
    shipping_days INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pp.product_id,
        r.region_code,
        r.currency,
        pp.base_cost,
        pp.base_price,
        pp.suggested_price,
        pp.max_price,
        pp.shipping_cost,
        COALESCE(pp.fulfillment_partner, r.default_fulfillment_partner),
        COALESCE(pp.production_days, r.default_production_days),
        COALESCE(pp.shipping_days, r.default_shipping_days)
    FROM print_product_pricing pp
    JOIN print_regions r ON r.id = pp.region_id
    WHERE pp.product_id = p_product_id
    AND p_country_code = ANY(r.countries)
    AND pp.is_available = TRUE
    AND r.is_active = TRUE
    LIMIT 1;
    
    -- Fallback to US pricing if no regional pricing found
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT 
            pp.product_id,
            r.region_code,
            r.currency,
            pp.base_cost,
            pp.base_price,
            pp.suggested_price,
            pp.max_price,
            pp.shipping_cost,
            COALESCE(pp.fulfillment_partner, r.default_fulfillment_partner),
            COALESCE(pp.production_days, r.default_production_days),
            COALESCE(pp.shipping_days, r.default_shipping_days)
        FROM print_product_pricing pp
        JOIN print_regions r ON r.id = pp.region_id
        WHERE pp.product_id = p_product_id
        AND r.region_code = 'US'
        AND pp.is_available = TRUE
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- HELPER FUNCTION: Get all products for a region
-- ============================================

CREATE OR REPLACE FUNCTION get_products_for_country(p_country_code VARCHAR)
RETURNS TABLE(
    product_id UUID,
    product_name VARCHAR,
    product_category VARCHAR,
    size_code VARCHAR,
    region_code VARCHAR,
    currency VARCHAR,
    base_price INTEGER,
    suggested_price INTEGER,
    max_price INTEGER,
    shipping_cost INTEGER,
    production_days INTEGER,
    shipping_days INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.category,
        p.size_code,
        r.region_code,
        r.currency,
        pp.base_price,
        pp.suggested_price,
        pp.max_price,
        pp.shipping_cost,
        COALESCE(pp.production_days, r.default_production_days),
        COALESCE(pp.shipping_days, r.default_shipping_days)
    FROM print_products p
    JOIN print_product_pricing pp ON pp.product_id = p.id
    JOIN print_regions r ON r.id = pp.region_id
    WHERE p_country_code = ANY(r.countries)
    AND p.is_active = TRUE
    AND pp.is_available = TRUE
    AND r.is_active = TRUE
    ORDER BY p.category, p.size_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE print_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_product_pricing ENABLE ROW LEVEL SECURITY;

-- Everyone can view active regions
CREATE POLICY "Anyone can view active regions" 
    ON print_regions FOR SELECT 
    USING (is_active = TRUE);

-- Everyone can view available pricing
CREATE POLICY "Anyone can view available pricing" 
    ON print_product_pricing FOR SELECT 
    USING (is_available = TRUE);

-- ============================================
-- UPDATE PRINT_ORDERS TO INCLUDE REGION
-- ============================================

ALTER TABLE print_orders 
    ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES print_regions(id),
    ADD COLUMN IF NOT EXISTS region_currency VARCHAR(3);
