import { createServiceClient } from '@/lib/supabase/server';

export async function getStoredDropInCredits(
  serviceClient: ReturnType<typeof createServiceClient>,
  attendeeId: string
): Promise<number> {
  const { data } = await serviceClient
    .from('attendees')
    .select('drop_in_credits')
    .eq('id', attendeeId)
    .maybeSingle();

  return Number((data as any)?.drop_in_credits || 0);
}

function isMissingRpcFunctionError(error: unknown, fnName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as any).code || '');
  const message = String((error as any).message || '').toLowerCase();
  const details = String((error as any).details || '').toLowerCase();
  const fn = fnName.toLowerCase();
  return (
    code === '42883' ||
    message.includes(`function ${fn}`) ||
    details.includes(`function ${fn}`) ||
    (code.startsWith('PGRST') && message.includes(fn))
  );
}

export async function incrementDropInCredits(
  serviceClient: ReturnType<typeof createServiceClient>,
  attendeeId: string,
  deltaCredits: number
): Promise<number> {
  const normalizedAttendeeId = String(attendeeId || '').trim();
  const normalizedDelta = Number.isFinite(Number(deltaCredits))
    ? Math.trunc(Number(deltaCredits))
    : 0;

  if (!normalizedAttendeeId) return 0;
  if (normalizedDelta === 0) {
    return getStoredDropInCredits(serviceClient, normalizedAttendeeId);
  }

  const { data, error } = await (serviceClient.rpc('increment_attendee_drop_in_credits', {
    p_attendee_id: normalizedAttendeeId,
    p_credits_delta: normalizedDelta,
  }) as any);

  if (!error) {
    const balance = Number(data || 0);
    return Number.isFinite(balance) ? Math.max(0, Math.round(balance)) : 0;
  }

  if (!isMissingRpcFunctionError(error, 'increment_attendee_drop_in_credits')) {
    throw error;
  }

  // Legacy fallback for deployments that have not applied migration 079 yet.
  const current = await getStoredDropInCredits(serviceClient, normalizedAttendeeId);
  const next = Math.max(0, current + normalizedDelta);
  await serviceClient
    .from('attendees')
    .update({ drop_in_credits: next })
    .eq('id', normalizedAttendeeId);

  return next;
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
}

function isNotExpired(expiresAt: string | null | undefined, nowMs: number) {
  if (!expiresAt) return true;
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) return true;
  return parsed > nowMs;
}

export async function getStoredDropInCreditsForIds(
  serviceClient: ReturnType<typeof createServiceClient>,
  attendeeIds: string[]
): Promise<number> {
  const ids = uniqueIds(attendeeIds);
  if (!ids.length) return 0;

  const { data } = await serviceClient
    .from('attendees')
    .select('id, drop_in_credits')
    .in('id', ids);

  return (data || []).reduce((total, row: any) => {
    return total + Math.max(0, Number(row?.drop_in_credits || 0));
  }, 0);
}

export async function getAvailableDropInCreditsForIds(
  serviceClient: ReturnType<typeof createServiceClient>,
  attendeeIds: string[]
): Promise<number> {
  const ids = uniqueIds(attendeeIds);
  if (!ids.length) return 0;

  const fallbackCredits = await getStoredDropInCreditsForIds(serviceClient, ids);
  const nowMs = Date.now();

  const { data, error } = await serviceClient
    .from('drop_in_credit_purchases')
    .select('attendee_id, credits_remaining, expires_at')
    .in('attendee_id', ids)
    .eq('status', 'active')
    .gt('credits_remaining', 0);

  if (error || !data) {
    return fallbackCredits;
  }

  const purchaseCredits = (data || []).reduce((total, row: any) => {
    if (!isNotExpired(row?.expires_at, nowMs)) return total;
    return total + Math.max(0, Number(row?.credits_remaining || 0));
  }, 0);

  // Keep runtime resilient for legacy data where attendee counters were credited
  // but purchase rows were not fully backfilled.
  return Math.max(purchaseCredits, fallbackCredits);
}

export async function normalizeDropInCreditOwnership(
  serviceClient: ReturnType<typeof createServiceClient>,
  canonicalAttendeeId: string,
  attendeeIds: string[]
): Promise<{ canonicalAttendeeId: string; attendeeIds: string[]; availableCredits: number }> {
  const canonicalId = String(canonicalAttendeeId || '').trim();
  const ids = uniqueIds(attendeeIds);
  const scopedIds = uniqueIds([canonicalId, ...ids]);
  const aliasIds = scopedIds.filter((id) => id !== canonicalId);

  if (!canonicalId) {
    return {
      canonicalAttendeeId: '',
      attendeeIds: scopedIds,
      availableCredits: 0,
    };
  }

  if (aliasIds.length > 0) {
    await serviceClient
      .from('drop_in_credit_purchases')
      .update({ attendee_id: canonicalId })
      .in('attendee_id', aliasIds);

    await serviceClient
      .from('drop_in_credit_usage')
      .update({ attendee_id: canonicalId })
      .in('attendee_id', aliasIds);
  }

  const availableCredits = await getAvailableDropInCreditsForIds(serviceClient, [canonicalId]);
  await serviceClient
    .from('attendees')
    .update({ drop_in_credits: availableCredits })
    .eq('id', canonicalId);

  if (aliasIds.length > 0) {
    await serviceClient
      .from('attendees')
      .update({ drop_in_credits: 0 })
      .in('id', aliasIds);
  }

  return {
    canonicalAttendeeId: canonicalId,
    attendeeIds: [canonicalId],
    availableCredits,
  };
}

export async function getAvailableDropInCredits(
  serviceClient: ReturnType<typeof createServiceClient>,
  attendeeId: string
): Promise<number> {
  return getAvailableDropInCreditsForIds(serviceClient, [attendeeId]);
}
