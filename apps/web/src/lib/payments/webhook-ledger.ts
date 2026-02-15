export type WebhookProvider = 'stripe' | 'flutterwave' | 'paypal' | 'drop_in';

type ProcessingStatus = 'processing' | 'processed' | 'failed';

export interface WebhookClaimResult {
  shouldProcess: boolean;
  duplicate: boolean;
  rowId: string | null;
  status: ProcessingStatus | null;
}

interface ClaimParams {
  supabase: any;
  provider: WebhookProvider;
  eventId: string;
  eventType?: string | null;
  signatureVerified: boolean;
  payload?: unknown;
}

function normalizeStatus(value: unknown): ProcessingStatus | null {
  if (value === 'processing' || value === 'processed' || value === 'failed') {
    return value;
  }
  return null;
}

export async function claimWebhookEvent(params: ClaimParams): Promise<WebhookClaimResult> {
  const { supabase, provider, eventId, eventType, signatureVerified, payload } = params;

  const { data, error } = await supabase
    .from('webhook_event_ledger')
    .insert({
      provider,
      provider_event_id: eventId,
      event_type: eventType || null,
      signature_verified: signatureVerified,
      processing_status: 'processing',
      payload: payload ?? {},
    })
    .select('id, processing_status')
    .single();

  if (!error && data) {
    return {
      shouldProcess: true,
      duplicate: false,
      rowId: data.id,
      status: normalizeStatus(data.processing_status),
    };
  }

  if (error?.code === '23505') {
    const { data: existing } = await supabase
      .from('webhook_event_ledger')
      .select('id, processing_status')
      .eq('provider', provider)
      .eq('provider_event_id', eventId)
      .maybeSingle();

    return {
      shouldProcess: false,
      duplicate: true,
      rowId: existing?.id || null,
      status: normalizeStatus(existing?.processing_status),
    };
  }

  throw error;
}

export async function markWebhookProcessed(supabase: any, rowId: string): Promise<void> {
  await supabase
    .from('webhook_event_ledger')
    .update({
      processing_status: 'processed',
      processed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', rowId);
}

export async function markWebhookFailed(
  supabase: any,
  rowId: string,
  errorMessage: string
): Promise<void> {
  const { data: existing } = await supabase
    .from('webhook_event_ledger')
    .select('retry_count')
    .eq('id', rowId)
    .maybeSingle();

  const nextRetryCount = (existing?.retry_count || 0) + 1;

  await supabase
    .from('webhook_event_ledger')
    .update({
      processing_status: 'failed',
      retry_count: nextRetryCount,
      last_error: errorMessage,
    })
    .eq('id', rowId);
}
