import { supabaseAdmin } from './supabase';

export type AnnouncementDeliveryStatus =
  | 'draft'
  | 'scheduled'
  | 'queued'
  | 'sending'
  | 'delivered'
  | 'partially_delivered'
  | 'failed'
  | 'sent'
  | 'cancelled';

const SUCCESS_STATUSES = new Set(['sent', 'delivered', 'read']);
const FAILED_STATUSES = new Set(['failed']);
const PENDING_STATUSES = new Set(['pending']);

function deriveAnnouncementStatus(
  total: number,
  pending: number,
  successful: number,
  failed: number,
  currentStatus: AnnouncementDeliveryStatus
): AnnouncementDeliveryStatus {
  if (currentStatus === 'cancelled') return 'cancelled';

  if (total === 0) {
    return currentStatus === 'scheduled' ? 'scheduled' : 'draft';
  }

  if (pending > 0 && successful === 0 && failed === 0) {
    return 'queued';
  }

  if (pending > 0) {
    return 'sending';
  }

  if (successful > 0 && failed === 0) {
    return 'delivered';
  }

  if (successful === 0 && failed > 0) {
    return 'failed';
  }

  if (successful > 0 && failed > 0) {
    return 'partially_delivered';
  }

  return 'sending';
}

export async function syncAnnouncementDeliveryState(announcementId: string): Promise<void> {
  const { data: announcement, error: announcementError } = await supabaseAdmin
    .from('platform_announcements')
    .select('id, status, sent_at')
    .eq('id', announcementId)
    .single();

  if (announcementError || !announcement) {
    throw announcementError || new Error('Announcement not found');
  }

  const currentStatus = String(announcement.status) as AnnouncementDeliveryStatus;
  if (currentStatus === 'draft' || currentStatus === 'cancelled') {
    return;
  }

  const { data: notifications, error: notificationsError } = await supabaseAdmin
    .from('notifications')
    .select('status, channel')
    .contains('metadata', { announcement_id: announcementId });

  if (notificationsError) {
    throw notificationsError;
  }

  let total = 0;
  let pending = 0;
  let successful = 0;
  let failed = 0;

  for (const notification of notifications || []) {
    total++;
    const status = String(notification.status || 'pending');

    if (PENDING_STATUSES.has(status)) {
      pending++;
    } else if (SUCCESS_STATUSES.has(status)) {
      successful++;
    } else if (FAILED_STATUSES.has(status)) {
      failed++;
    } else {
      pending++;
    }
  }

  const nextStatus = deriveAnnouncementStatus(total, pending, successful, failed, currentStatus);
  const nowIso = new Date().toISOString();
  const isTerminal = nextStatus === 'delivered' || nextStatus === 'partially_delivered' || nextStatus === 'failed';

  const { error: updateError } = await supabaseAdmin
    .from('platform_announcements')
    .update({
      status: nextStatus,
      sent_count: successful,
      sent_at: isTerminal ? (announcement.sent_at || nowIso) : null,
      updated_at: nowIso,
    })
    .eq('id', announcementId);

  if (updateError) {
    throw updateError;
  }
}
