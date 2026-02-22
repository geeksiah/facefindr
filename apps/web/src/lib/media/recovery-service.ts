import { copyStorageObjectBetweenBuckets } from '@/lib/storage/provider';
import { createServiceClient } from '@/lib/supabase/server';

type RecoveryStatus =
  | 'pending_payment'
  | 'paid'
  | 'restoring'
  | 'restored'
  | 'failed'
  | 'expired'
  | 'refunded';

interface RecoveryRequestRow {
  id: string;
  status: RecoveryStatus;
  quoted_fee_cents: number;
  currency: string;
  expires_at: string | null;
  payment_provider: string | null;
  payment_reference: string | null;
  media_id: string;
  requester_user_id: string;
  retention_record_id: string;
  media_retention_records: {
    id: string;
    media_id: string;
    original_bucket: string;
    original_path: string;
    archive_bucket: string;
    archive_path: string | null;
    status: 'soft_deleted' | 'archived' | 'recovered' | 'purged' | 'failed';
    purge_after: string | null;
    event_id: string | null;
  } | null;
}

interface RestoreInput {
  requestId: string;
  requesterUserId?: string | null;
  confirmPayment?: boolean;
  paymentProvider?: string | null;
  paymentReference?: string | null;
  supabase?: ReturnType<typeof createServiceClient>;
}

export interface RestoreMediaRecoveryResult {
  success: boolean;
  status:
    | 'not_found'
    | 'payment_required'
    | 'expired'
    | 'purged'
    | 'invalid_state'
    | 'in_progress'
    | 'restored'
    | 'failed';
  requestId?: string;
  recoveryRequestStatus?: RecoveryStatus;
  message?: string;
}

export interface TransactionRecoveryResult {
  scanned: number;
  restored: number;
  paymentRequired: number;
  skipped: number;
  failed: number;
}

interface TransactionLike {
  id: string;
  payment_provider?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_checkout_session_id?: string | null;
  flutterwave_tx_ref?: string | null;
  paypal_order_id?: string | null;
  paystack_reference?: string | null;
  metadata?: Record<string, unknown> | null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeReference(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBucket(value: string | null | undefined, fallback: string) {
  const normalized = normalizeReference(value);
  return normalized || fallback;
}

function normalizePath(value: string | null | undefined) {
  const normalized = normalizeReference(value);
  return normalized ? normalized.replace(/^\/+/, '') : null;
}

async function fetchRecoveryRequest(
  supabase: ReturnType<typeof createServiceClient>,
  requestId: string,
  requesterUserId?: string | null
): Promise<RecoveryRequestRow | null> {
  let query = supabase
    .from('media_recovery_requests')
    .select(`
      id,
      status,
      quoted_fee_cents,
      currency,
      expires_at,
      payment_provider,
      payment_reference,
      media_id,
      requester_user_id,
      retention_record_id,
      media_retention_records!inner(
        id,
        media_id,
        original_bucket,
        original_path,
        archive_bucket,
        archive_path,
        status,
        purge_after,
        event_id
      )
    `)
    .eq('id', requestId);

  if (requesterUserId) {
    query = query.eq('requester_user_id', requesterUserId);
  }

  const { data } = await query.maybeSingle();
  if (!data) return null;

  const retention = Array.isArray((data as any).media_retention_records)
    ? (data as any).media_retention_records[0] || null
    : (data as any).media_retention_records || null;

  return {
    ...(data as any),
    media_retention_records: retention,
  } as RecoveryRequestRow;
}

async function setRequestStatus(
  supabase: ReturnType<typeof createServiceClient>,
  requestId: string,
  fromStatus: RecoveryStatus,
  toStatus: RecoveryStatus,
  extra: Record<string, unknown> = {}
) {
  const { data, error } = await supabase
    .from('media_recovery_requests')
    .update({
      status: toStatus,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq('id', requestId)
    .eq('status', fromStatus)
    .select('id, status')
    .maybeSingle();

  return { data, error };
}

export async function restoreMediaRecoveryRequest(
  input: RestoreInput
): Promise<RestoreMediaRecoveryResult> {
  const supabase = input.supabase || createServiceClient();
  const requestId = normalizeReference(input.requestId);
  if (!requestId || !isUuid(requestId)) {
    return { success: false, status: 'not_found', message: 'Invalid recovery request id' };
  }

  let request = await fetchRecoveryRequest(supabase, requestId, input.requesterUserId);
  if (!request) {
    return { success: false, status: 'not_found', message: 'Recovery request not found' };
  }

  const expiresAt = toIso(request.expires_at);
  if (
    request.status === 'pending_payment' &&
    expiresAt &&
    new Date(expiresAt) <= new Date()
  ) {
    await supabase
      .from('media_recovery_requests')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.id)
      .eq('status', 'pending_payment');
    return {
      success: false,
      status: 'expired',
      requestId: request.id,
      recoveryRequestStatus: 'expired',
      message: 'Recovery request has expired',
    };
  }

  const retention = request.media_retention_records;
  if (!retention) {
    return {
      success: false,
      status: 'not_found',
      requestId: request.id,
      recoveryRequestStatus: request.status,
      message: 'Retention record not found',
    };
  }

  const purgeAfter = toIso(retention.purge_after);
  if (
    retention.status === 'purged' ||
    (purgeAfter && new Date(purgeAfter) <= new Date() && retention.status !== 'recovered')
  ) {
    return {
      success: false,
      status: 'purged',
      requestId: request.id,
      recoveryRequestStatus: request.status,
      message: 'Recovery window has expired',
    };
  }

  if (request.status === 'restored') {
    return {
      success: true,
      status: 'restored',
      requestId: request.id,
      recoveryRequestStatus: 'restored',
      message: 'Media already restored',
    };
  }

  if (request.status === 'expired' || request.status === 'refunded') {
    return {
      success: false,
      status: 'invalid_state',
      requestId: request.id,
      recoveryRequestStatus: request.status,
      message: `Recovery request is ${request.status}`,
    };
  }

  if (request.status === 'pending_payment') {
    const requiresPayment = Number(request.quoted_fee_cents || 0) > 0;
    if (requiresPayment && !input.confirmPayment) {
      return {
        success: false,
        status: 'payment_required',
        requestId: request.id,
        recoveryRequestStatus: request.status,
        message: 'Payment confirmation required before restore',
      };
    }

    const paymentReference = normalizeReference(input.paymentReference);
    const paymentProvider = normalizeReference(input.paymentProvider);

    const { data: paidRow, error: paidError } = await supabase
      .from('media_recovery_requests')
      .update({
        status: 'paid',
        payment_provider: paymentProvider || request.payment_provider,
        payment_reference: paymentReference || request.payment_reference,
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.id)
      .eq('status', 'pending_payment')
      .select('id')
      .maybeSingle();

    if (paidError) {
      return {
        success: false,
        status: 'failed',
        requestId: request.id,
        recoveryRequestStatus: request.status,
        message: paidError.message || 'Failed to mark recovery request paid',
      };
    }

    if (!paidRow?.id) {
      request = (await fetchRecoveryRequest(supabase, request.id, input.requesterUserId)) || request;
    } else {
      request.status = 'paid';
    }
  }

  if (request.status === 'restoring') {
    return {
      success: false,
      status: 'in_progress',
      requestId: request.id,
      recoveryRequestStatus: 'restoring',
      message: 'Recovery is already in progress',
    };
  }

  if (request.status !== 'paid' && request.status !== 'failed') {
    return {
      success: false,
      status: 'invalid_state',
      requestId: request.id,
      recoveryRequestStatus: request.status,
      message: `Cannot restore from status: ${request.status}`,
    };
  }

  if (request.status === 'paid') {
    const { data: restoringRow } = await setRequestStatus(
      supabase,
      request.id,
      'paid',
      'restoring'
    );
    if (!restoringRow?.id) {
      request = (await fetchRecoveryRequest(supabase, request.id, input.requesterUserId)) || request;
      if (request.status === 'restored') {
        return {
          success: true,
          status: 'restored',
          requestId: request.id,
          recoveryRequestStatus: 'restored',
          message: 'Media already restored',
        };
      }
      if (request.status === 'restoring') {
        return {
          success: false,
          status: 'in_progress',
          requestId: request.id,
          recoveryRequestStatus: 'restoring',
          message: 'Recovery is already in progress',
        };
      }
    } else {
      request.status = 'restoring';
    }
  } else if (request.status === 'failed') {
    const { data: retryRow } = await setRequestStatus(
      supabase,
      request.id,
      'failed',
      'restoring',
      { failure_reason: null }
    );
    if (!retryRow?.id) {
      return {
        success: false,
        status: 'invalid_state',
        requestId: request.id,
        recoveryRequestStatus: request.status,
        message: 'Could not retry failed recovery request',
      };
    }
    request.status = 'restoring';
  }

  const restoredAt = new Date().toISOString();
  try {
    const sourceBucket = normalizeBucket(retention.archive_bucket, 'media-archive');
    const sourcePath = normalizePath(retention.archive_path);
    const destinationBucket = normalizeBucket(retention.original_bucket, 'media');
    const destinationPath = normalizePath(retention.original_path);

    if (!sourcePath || !destinationPath) {
      throw new Error('Missing archive or destination storage path');
    }

    await copyStorageObjectBetweenBuckets(
      sourceBucket,
      sourcePath,
      destinationBucket,
      destinationPath
    );

    const { error: mediaUpdateError } = await supabase
      .from('media')
      .update({
        storage_path: destinationPath,
        deleted_at: null,
        updated_at: restoredAt,
      })
      .eq('id', request.media_id);
    if (mediaUpdateError) {
      throw mediaUpdateError;
    }

    const { error: retentionLogError } = await supabase.rpc('log_media_retention_state', {
      p_media_id: request.media_id,
      p_status: 'recovered',
      p_archive_path: sourcePath,
      p_grace_expires_at: null,
      p_purge_after: null,
      p_last_error: null,
    });
    if (retentionLogError) {
      throw retentionLogError;
    }

    const paymentReference = normalizeReference(input.paymentReference);
    const paymentProvider = normalizeReference(input.paymentProvider);
    const { error: requestUpdateError } = await supabase
      .from('media_recovery_requests')
      .update({
        status: 'restored',
        restored_at: restoredAt,
        failure_reason: null,
        payment_provider: paymentProvider || request.payment_provider,
        payment_reference: paymentReference || request.payment_reference,
        updated_at: restoredAt,
      })
      .eq('id', request.id);
    if (requestUpdateError) {
      throw requestUpdateError;
    }

    return {
      success: true,
      status: 'restored',
      requestId: request.id,
      recoveryRequestStatus: 'restored',
      message: 'Media restored successfully',
    };
  } catch (error: any) {
    const reason = String(error?.message || 'Restore failed');
    await supabase
      .from('media_recovery_requests')
      .update({
        status: 'failed',
        failure_reason: reason.slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.id);

    await supabase.rpc('log_media_retention_state', {
      p_media_id: request.media_id,
      p_status: 'failed',
      p_archive_path: retention.archive_path || null,
      p_grace_expires_at: null,
      p_purge_after: null,
      p_last_error: reason.slice(0, 1000),
    });

    return {
      success: false,
      status: 'failed',
      requestId: request.id,
      recoveryRequestStatus: 'failed',
      message: reason,
    };
  }
}

function extractRecoveryRequestIds(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!metadata) return [];
  const ids = new Set<string>();

  const singleCandidates = [
    metadata.media_recovery_request_id,
    metadata.mediaRecoveryRequestId,
  ];
  for (const candidate of singleCandidates) {
    if (typeof candidate === 'string' && isUuid(candidate)) {
      ids.add(candidate);
    }
  }

  const listCandidates = [
    metadata.media_recovery_request_ids,
    metadata.mediaRecoveryRequestIds,
  ];
  for (const candidate of listCandidates) {
    if (Array.isArray(candidate)) {
      for (const value of candidate) {
        if (typeof value === 'string' && isUuid(value)) {
          ids.add(value);
        }
      }
    }
  }

  return Array.from(ids);
}

function resolveTransactionReference(transaction: TransactionLike): string {
  return (
    normalizeReference(transaction.paystack_reference) ||
    normalizeReference(transaction.stripe_payment_intent_id) ||
    normalizeReference(transaction.stripe_checkout_session_id) ||
    normalizeReference(transaction.flutterwave_tx_ref) ||
    normalizeReference(transaction.paypal_order_id) ||
    normalizeReference(transaction.id) ||
    'tx'
  );
}

export async function restoreMediaRecoveryRequestsFromTransaction(
  transaction: TransactionLike,
  options?: {
    provider?: string | null;
    supabase?: ReturnType<typeof createServiceClient>;
  }
): Promise<TransactionRecoveryResult> {
  const supabase = options?.supabase || createServiceClient();
  const requestIds = extractRecoveryRequestIds(transaction.metadata || {});
  const result: TransactionRecoveryResult = {
    scanned: requestIds.length,
    restored: 0,
    paymentRequired: 0,
    skipped: 0,
    failed: 0,
  };

  if (requestIds.length === 0) {
    return result;
  }

  const baseRef = resolveTransactionReference(transaction);
  const provider = normalizeReference(options?.provider) || normalizeReference(transaction.payment_provider);

  for (const requestId of requestIds) {
    const restore = await restoreMediaRecoveryRequest({
      requestId,
      confirmPayment: true,
      paymentProvider: provider,
      paymentReference: `${provider || 'provider'}:${baseRef}:${requestId}`,
      supabase,
    });

    if (restore.success && restore.status === 'restored') {
      result.restored += 1;
    } else if (restore.status === 'payment_required') {
      result.paymentRequired += 1;
    } else if (
      restore.status === 'not_found' ||
      restore.status === 'expired' ||
      restore.status === 'purged' ||
      restore.status === 'invalid_state' ||
      restore.status === 'in_progress'
    ) {
      result.skipped += 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}
