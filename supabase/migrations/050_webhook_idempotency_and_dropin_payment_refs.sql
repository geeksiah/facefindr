-- Migration: 050_webhook_idempotency_and_dropin_payment_refs
-- Purpose:
-- 1) Add durable webhook ledger for one-time event processing
-- 2) Add provider reference uniqueness for transactions
-- 3) Add dedupe constraints for entitlements and drop-in matches
-- 4) Align drop-in payment reference columns with external provider IDs (TEXT)

-- ============================================
-- WEBHOOK EVENT LEDGER
-- ============================================

CREATE TABLE IF NOT EXISTS webhook_event_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL,
    provider_event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100),
    signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
    processing_status VARCHAR(20) NOT NULL DEFAULT 'processing', -- processing | processed | failed
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_ledger_status
    ON webhook_event_ledger(processing_status);

CREATE INDEX IF NOT EXISTS idx_webhook_ledger_provider
    ON webhook_event_ledger(provider, first_seen_at DESC);

DROP TRIGGER IF EXISTS update_webhook_event_ledger_updated_at ON webhook_event_ledger;
CREATE TRIGGER update_webhook_event_ledger_updated_at
    BEFORE UPDATE ON webhook_event_ledger
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TRANSACTION PROVIDER REFERENCE UNIQUENESS
-- ============================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_stripe_checkout_session_id
    ON transactions(stripe_checkout_session_id)
    WHERE stripe_checkout_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_flutterwave_tx_ref
    ON transactions(flutterwave_tx_ref)
    WHERE flutterwave_tx_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_paypal_order_id
    ON transactions(paypal_order_id)
    WHERE paypal_order_id IS NOT NULL;

-- ============================================
-- ENTITLEMENT DEDUPLICATION
-- ============================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlements_single_per_tx_media
    ON entitlements(transaction_id, media_id)
    WHERE media_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlements_bulk_per_tx
    ON entitlements(transaction_id)
    WHERE entitlement_type = 'bulk' AND media_id IS NULL;

-- ============================================
-- DROP-IN MATCH DEDUPLICATION
-- ============================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_drop_in_match_face_tuple
    ON drop_in_matches(drop_in_photo_id, matched_attendee_id, rekognition_face_id);

-- ============================================
-- DROP-IN PAYMENT REFERENCE TYPE ALIGNMENT
-- ============================================

ALTER TABLE drop_in_photos
    DROP CONSTRAINT IF EXISTS drop_in_photos_upload_payment_transaction_id_fkey;

ALTER TABLE drop_in_photos
    DROP CONSTRAINT IF EXISTS drop_in_photos_gift_payment_transaction_id_fkey;

ALTER TABLE drop_in_photos
    ALTER COLUMN upload_payment_transaction_id TYPE TEXT
    USING upload_payment_transaction_id::TEXT;

ALTER TABLE drop_in_photos
    ALTER COLUMN gift_payment_transaction_id TYPE TEXT
    USING gift_payment_transaction_id::TEXT;
