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

interface ChannelStats {
  total: number;
  pending: number;
  successful: number;
  failed: number;
}

const SUCCESS_STATUSES = new Set(['sent', 'delivered', 'read']);
const FAILED_STATUSES = new Set(['failed']);
const PENDING_STATUSES = new Set(['pending']);

function createChannelStats(): ChannelStats {
  return { total: 0, pending: 0, successful: 0, failed: 0 };
}

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

  const byChannel: Record<string, ChannelStats> = {};
  const byStatus: Record<string, number> = {};

  let total = 0;
  let pending = 0;
  let successful = 0;
  let failed = 0;

  for (const notification of notifications || []) {
    total++;
    const channel = String(notification.channel || 'unknown');
    const status = String(notification.status || 'pending');
    const stats = byChannel[channel] || createChannelStats();

    stats.total++;
    byStatus[status] = (byStatus[status] || 0) + 1;

    if (PENDING_STATUSES.has(status)) {
      stats.pending++;
      pending++;
    } else if (SUCCESS_STATUSES.has(status)) {
      stats.successful++;
      successful++;
    } else if (FAILED_STATUSES.has(status)) {
      stats.failed++;
      failed++;
    } else {
      stats.pending++;
      pending++;
    }

    byChannel[channel] = stats;
  }

  const nextStatus = deriveAnnouncementStatus(total, pending, successful, failed, currentStatus);
  const nowIso = new Date().toISOString();
  const isTerminal = nextStatus === 'delivered' || nextStatus === 'partially_delivered' || nextStatus === 'failed';

  const { error: updateError } = await supabaseAdmin
    .from('platform_announcements')
    .update({
      status: nextStatus,
      queued_count: pending,
      delivered_count: successful,
      failed_count: failed,
      sent_count: successful,
      sent_at: isTerminal ? (announcement.sent_at || nowIso) : null,
      delivery_synced_at: nowIso,
      delivery_completed_at: isTerminal ? nowIso : null,
      delivery_summary: {
        total,
        pending,
        successful,
        failed,
        by_channel: byChannel,
        by_status: byStatus,
        updated_at: nowIso,
      },
    })
    .eq('id', announcementId);

  if (updateError) {
    throw updateError;
  }
}
