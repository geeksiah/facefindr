-- Harden Drop-In credit consumption:
-- 1) Consume across multiple active purchases (not only a single row).
-- 2) Keep attendee credit balance in sync.
-- 3) Avoid false "insufficient credits" when credits are fragmented.

CREATE OR REPLACE FUNCTION public.use_drop_in_credits(
    p_attendee_id UUID,
    p_action VARCHAR(100),
    p_credits_needed INTEGER DEFAULT 1,
    p_metadata JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_remaining_needed INTEGER := GREATEST(COALESCE(p_credits_needed, 1), 1);
    v_total_available INTEGER := 0;
    v_purchase RECORD;
    v_take INTEGER;
    v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
    -- Serialize consumption per attendee to avoid race conditions.
    PERFORM pg_advisory_xact_lock(hashtext(COALESCE(p_attendee_id::text, '')));

    SELECT COALESCE(SUM(credits_remaining), 0)::INTEGER
    INTO v_total_available
    FROM public.drop_in_credit_purchases
    WHERE attendee_id = p_attendee_id
      AND status = 'active'
      AND credits_remaining > 0
      AND (expires_at IS NULL OR expires_at > NOW());

    IF v_total_available < v_remaining_needed THEN
        RETURN FALSE;
    END IF;

    FOR v_purchase IN
        SELECT id, credits_remaining
        FROM public.drop_in_credit_purchases
        WHERE attendee_id = p_attendee_id
          AND status = 'active'
          AND credits_remaining > 0
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY expires_at ASC NULLS LAST, created_at ASC, id ASC
        FOR UPDATE
    LOOP
        EXIT WHEN v_remaining_needed <= 0;

        v_take := LEAST(v_purchase.credits_remaining, v_remaining_needed);
        IF v_take <= 0 THEN
            CONTINUE;
        END IF;

        UPDATE public.drop_in_credit_purchases
        SET
            credits_remaining = credits_remaining - v_take,
            status = CASE
                WHEN (credits_remaining - v_take) <= 0 THEN 'exhausted'
                ELSE status
            END,
            updated_at = NOW()
        WHERE id = v_purchase.id;

        INSERT INTO public.drop_in_credit_usage (
            attendee_id,
            purchase_id,
            action,
            credits_used,
            metadata
        ) VALUES (
            p_attendee_id,
            v_purchase.id,
            p_action,
            v_take,
            v_metadata || jsonb_build_object(
                'requested_credits', GREATEST(COALESCE(p_credits_needed, 1), 1),
                'consumed_from_purchase_id', v_purchase.id
            )
        );

        v_remaining_needed := v_remaining_needed - v_take;
    END LOOP;

    IF v_remaining_needed > 0 THEN
        -- Defensive guard (should not happen due pre-check + lock)
        RETURN FALSE;
    END IF;

    UPDATE public.attendees
    SET drop_in_credits = GREATEST(COALESCE(drop_in_credits, 0) - GREATEST(COALESCE(p_credits_needed, 1), 1), 0)
    WHERE id = p_attendee_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- One-time reconciliation so attendee.drop_in_credits matches active purchase balances.
DO $$
BEGIN
  IF to_regclass('public.attendees') IS NULL OR to_regclass('public.drop_in_credit_purchases') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.attendees a
  SET drop_in_credits = COALESCE(
    (
      SELECT SUM(p.credits_remaining)::INTEGER
      FROM public.drop_in_credit_purchases p
      WHERE p.attendee_id = a.id
        AND p.status = 'active'
        AND p.credits_remaining > 0
        AND (p.expires_at IS NULL OR p.expires_at > NOW())
    ),
    0
  );
END $$;
