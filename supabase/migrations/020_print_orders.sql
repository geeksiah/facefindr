-- Print Product Orders System
-- SRS §7.4: Print fulfillment for photos

-- ============================================
-- PRINT ORDERS TABLE
-- ============================================

CREATE TYPE print_order_status AS ENUM (
    'pending',
    'processing', 
    'production',
    'shipped',
    'delivered',
    'cancelled',
    'refunded'
);

CREATE TABLE IF NOT EXISTS print_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(20) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255),
    
    -- Pricing
    subtotal INTEGER NOT NULL, -- In cents
    shipping_cost INTEGER NOT NULL DEFAULT 0,
    tax_amount INTEGER NOT NULL DEFAULT 0,
    total_amount INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    
    -- Payment
    stripe_payment_intent_id VARCHAR(255),
    stripe_checkout_session_id VARCHAR(255),
    paid_at TIMESTAMPTZ,
    
    -- Shipping
    shipping_name VARCHAR(255),
    shipping_address_line1 VARCHAR(255),
    shipping_address_line2 VARCHAR(255),
    shipping_city VARCHAR(100),
    shipping_state VARCHAR(100),
    shipping_postal_code VARCHAR(20),
    shipping_country VARCHAR(2),
    
    -- Fulfillment
    status print_order_status NOT NULL DEFAULT 'pending',
    fulfillment_partner VARCHAR(100),
    tracking_number VARCHAR(100),
    tracking_url TEXT,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    
    -- Metadata
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_print_orders_customer ON print_orders(customer_id);
CREATE INDEX idx_print_orders_status ON print_orders(status);
CREATE INDEX idx_print_orders_order_number ON print_orders(order_number);
CREATE INDEX idx_print_orders_stripe ON print_orders(stripe_payment_intent_id);

-- ============================================
-- PRINT ORDER ITEMS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS print_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES print_orders(id) ON DELETE CASCADE,
    
    -- Product info
    product_id UUID NOT NULL REFERENCES print_products(id) ON DELETE RESTRICT,
    product_name VARCHAR(255) NOT NULL,
    product_size VARCHAR(50) NOT NULL,
    
    -- Source photo
    media_id UUID REFERENCES media(id) ON DELETE SET NULL,
    photo_url TEXT NOT NULL,
    
    -- Pricing
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price INTEGER NOT NULL, -- In cents
    line_total INTEGER NOT NULL,
    
    -- Production
    production_status VARCHAR(50) DEFAULT 'pending',
    production_file_url TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_print_order_items_order ON print_order_items(order_id);
CREATE INDEX idx_print_order_items_product ON print_order_items(product_id);
CREATE INDEX idx_print_order_items_media ON print_order_items(media_id);

-- ============================================
-- SAVED SHIPPING ADDRESSES
-- ============================================

CREATE TABLE IF NOT EXISTS shipping_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_default BOOLEAN DEFAULT FALSE,
    
    name VARCHAR(255) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(2) NOT NULL,
    phone VARCHAR(20),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shipping_addresses_user ON shipping_addresses(user_id);
CREATE INDEX idx_shipping_addresses_default ON shipping_addresses(user_id) WHERE is_default = TRUE;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Generate unique order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    v_number VARCHAR(20);
    v_exists BOOLEAN;
BEGIN
    LOOP
        -- Format: FF-YYYYMMDD-XXXXX (e.g., FF-20260114-A7B3C)
        v_number := 'FF-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                    UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 5));
        
        SELECT EXISTS(SELECT 1 FROM print_orders WHERE order_number = v_number) INTO v_exists;
        
        IF NOT v_exists THEN
            RETURN v_number;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create print order with items
CREATE OR REPLACE FUNCTION create_print_order(
    p_customer_id UUID,
    p_customer_email VARCHAR(255),
    p_customer_name VARCHAR(255),
    p_shipping JSONB,
    p_items JSONB,
    p_currency VARCHAR(3) DEFAULT 'USD'
)
RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_order_number VARCHAR(20);
    v_subtotal INTEGER := 0;
    v_shipping_cost INTEGER := 0;
    v_item JSONB;
BEGIN
    -- Generate order number
    v_order_number := generate_order_number();
    
    -- Calculate subtotal
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_subtotal := v_subtotal + ((v_item->>'unit_price')::INTEGER * (v_item->>'quantity')::INTEGER);
    END LOOP;
    
    -- Get shipping cost from first item's region (simplified)
    v_shipping_cost := COALESCE((p_shipping->>'shipping_cost')::INTEGER, 0);
    
    -- Create order
    INSERT INTO print_orders (
        order_number,
        customer_id,
        customer_email,
        customer_name,
        subtotal,
        shipping_cost,
        total_amount,
        currency,
        shipping_name,
        shipping_address_line1,
        shipping_address_line2,
        shipping_city,
        shipping_state,
        shipping_postal_code,
        shipping_country
    )
    VALUES (
        v_order_number,
        p_customer_id,
        p_customer_email,
        p_customer_name,
        v_subtotal,
        v_shipping_cost,
        v_subtotal + v_shipping_cost,
        p_currency,
        p_shipping->>'name',
        p_shipping->>'address_line1',
        p_shipping->>'address_line2',
        p_shipping->>'city',
        p_shipping->>'state',
        p_shipping->>'postal_code',
        p_shipping->>'country'
    )
    RETURNING id INTO v_order_id;
    
    -- Create order items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO print_order_items (
            order_id,
            product_id,
            product_name,
            product_size,
            media_id,
            photo_url,
            quantity,
            unit_price,
            line_total
        )
        VALUES (
            v_order_id,
            (v_item->>'product_id')::UUID,
            v_item->>'product_name',
            v_item->>'product_size',
            (v_item->>'media_id')::UUID,
            v_item->>'photo_url',
            (v_item->>'quantity')::INTEGER,
            (v_item->>'unit_price')::INTEGER,
            (v_item->>'unit_price')::INTEGER * (v_item->>'quantity')::INTEGER
        );
    END LOOP;
    
    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE print_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_addresses ENABLE ROW LEVEL SECURITY;

-- Users can view their own orders
CREATE POLICY "Users can view own orders" ON print_orders
    FOR SELECT USING (auth.uid() = customer_id);

-- Users can view their own order items
CREATE POLICY "Users can view own order items" ON print_order_items
    FOR SELECT USING (
        order_id IN (SELECT id FROM print_orders WHERE customer_id = auth.uid())
    );

-- Users can manage their shipping addresses
CREATE POLICY "Users can manage own addresses" ON shipping_addresses
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER update_print_orders_updated_at
    BEFORE UPDATE ON print_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shipping_addresses_updated_at
    BEFORE UPDATE ON shipping_addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
