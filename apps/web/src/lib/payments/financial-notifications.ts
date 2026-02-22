import { createServiceClient } from '@/lib/supabase/server';
import { dispatchInAppNotification } from '@/lib/notifications/dispatcher';

type ServiceClient = ReturnType<typeof createServiceClient>;

interface FinancialNotificationInput {
  userId: string;
  templateCode: string;
  subject: string;
  body: string;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
}

export async function emitFinancialInAppNotification(
  supabase: ServiceClient,
  input: FinancialNotificationInput
): Promise<{ sent: boolean; notificationId?: string }> {
  if (!input.userId || !input.dedupeKey) {
    return { sent: false };
  }

  const result = await dispatchInAppNotification({
    supabase,
    recipientUserId: input.userId,
    templateCode: input.templateCode,
    subject: input.subject,
    body: input.body,
    dedupeKey: input.dedupeKey,
    metadata: {
      ...(input.metadata || {}),
      dedupe_key: input.dedupeKey,
    },
  });

  if (!result.sent || !result.notificationId) {
    return { sent: false };
  }

  return { sent: true, notificationId: result.notificationId };
}
