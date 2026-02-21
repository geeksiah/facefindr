import { getApiBaseUrl } from '@/lib/api-base';

export interface JoinEventResult {
  eventId: string;
  eventName?: string | null;
}

interface JoinEventByCodeInput {
  accessCode: string;
  accessToken?: string | null;
}

export async function joinEventByCode({
  accessCode,
  accessToken,
}: JoinEventByCodeInput): Promise<JoinEventResult> {
  const normalizedCode = accessCode.trim();
  if (!normalizedCode) {
    throw new Error('Access code is required');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${getApiBaseUrl()}/api/events/join`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ accessCode: normalizedCode }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage =
      payload?.error ||
      (response.status === 401
        ? 'Please sign in to join this event.'
        : 'Failed to join event');
    throw new Error(errorMessage);
  }

  const eventId = payload?.event?.id;
  if (!eventId || typeof eventId !== 'string') {
    throw new Error('Invalid event response');
  }

  return {
    eventId,
    eventName: payload?.event?.name || null,
  };
}
