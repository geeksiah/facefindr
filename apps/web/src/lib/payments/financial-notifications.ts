import { createServiceClient } from '@/lib/supabase/server';

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

  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', input.userId)
    .eq('channel', 'in_app')
    .contains('metadata', { dedupe_key: input.dedupeKey })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { sent: false, notificationId: existing.id };
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: input.userId,
      template_code: input.templateCode,
      channel: 'in_app',
      subject: input.subject,
      body: input.body,
      status: 'delivered',
      sent_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
      metadata: {
        ...(input.metadata || {}),
        dedupe_key: input.dedupeKey,
      },
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    return { sent: false };
  }

  return { sent: true, notificationId: data.id };
}
