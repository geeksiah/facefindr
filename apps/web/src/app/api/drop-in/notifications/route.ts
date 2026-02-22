export const dynamic = 'force-dynamic';

/**
 * Drop-In Notifications API
 * 
 * Manages notifications for drop-in photos
 */

import { NextRequest, NextResponse } from 'next/server';

import { consumeDropInCredits } from '@/lib/drop-in/consume-credits';
import { resolveDropInCreditRules } from '@/lib/drop-in/credit-rules';
import { getAttendeeIdCandidates } from '@/lib/profiles/ids';
import { createStorageSignedUrl } from '@/lib/storage/provider';
import { createClient, createClientWithAccessToken, createServiceClient } from '@/lib/supabase/server';

// GET - List notifications
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const supabase = accessToken
      ? createClientWithAccessToken(accessToken)
      : await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const attendeeIdCandidates = await getAttendeeIdCandidates(supabase, user.id, user.email);
    if (!attendeeIdCandidates.length) {
      return NextResponse.json({ error: 'Attendee profile not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';

    // Get notifications
    const { data: notifications, error } = await supabase
      .from('drop_in_notifications')
      .select(`
        id,
        status,
        sent_at,
        viewed_at,
        is_gifted,
        gift_message_viewed,
        requires_premium,
        drop_in_photo_id,
        drop_in_match_id,
        drop_in_photos (
          id,
          storage_path,
          thumbnail_path,
          original_filename,
          uploaded_at,
          location_name,
          uploader_id,
          gift_message,
          uploader:uploader_id (
            id,
            display_name,
            face_tag
          )
        ),
        drop_in_matches (
          id,
          confidence,
          verification_status
        )
      `)
      .in('recipient_id', attendeeIdCandidates)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    // Get signed URLs for thumbnails
    const notificationsWithUrls = await Promise.all(
      (notifications || []).map(async (notif) => {
        const photo = notif.drop_in_photos as any;
        if (!photo) return notif;
        
        const path = photo.thumbnail_path || photo.storage_path;

        const signedUrl = await createStorageSignedUrl('media', path, 3600, {
          supabaseClient: supabase,
        });

        return {
          ...notif,
          photo: {
            ...photo,
            thumbnailUrl: signedUrl || null,
          },
        };
      })
    );

    return NextResponse.json({
      success: true,
      notifications: notificationsWithUrls,
    });

  } catch (error) {
    console.error('Drop-in notifications error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

// POST - Mark notification as viewed/unlock gift message
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const supabase = accessToken
      ? createClientWithAccessToken(accessToken)
      : await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const attendeeIdCandidates = await getAttendeeIdCandidates(supabase, user.id, user.email);
    if (!attendeeIdCandidates.length) {
      return NextResponse.json({ error: 'Attendee profile not found' }, { status: 404 });
    }
    const rules = await resolveDropInCreditRules();
    const serviceClient = createServiceClient();

    const { notificationId, action } = await request.json();

    if (!notificationId) {
      return NextResponse.json({ error: 'notificationId is required' }, { status: 400 });
    }

    // Get notification
    let { data: notification, error: notifError } = await supabase
      .from('drop_in_notifications')
      .select('*')
      .eq('id', notificationId)
      .single();

    if (notifError || !notification) {
      const fallback = await supabase
        .from('drop_in_notifications')
        .select('*')
        .eq('drop_in_match_id', notificationId)
        .in('recipient_id', attendeeIdCandidates)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      notification = fallback.data;
      notifError = fallback.error;
    }

    if (notifError || !notification || !attendeeIdCandidates.includes(notification.recipient_id)) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
    const targetNotificationId = notification.id as string;
    const recipientAttendeeId = notification.recipient_id as string;

    const { data: dropInPhoto } = await supabase
      .from('drop_in_photos')
      .select('id, uploader_id, gift_message, is_gifted')
      .eq('id', notification.drop_in_photo_id)
      .maybeSingle();

    const uploaderId = dropInPhoto?.uploader_id || null;

    // Update notification based on action
    const updates: any = {};

    if (action === 'view') {
      if (notification.requires_premium && !notification.is_gifted && !notification.viewed_at) {
        const creditsNeeded = rules.recipientUnlock;
        const creditConsumption = await consumeDropInCredits(serviceClient, {
          attendeeId: recipientAttendeeId,
          action: 'drop_in_recipient_unlock',
          creditsNeeded,
          metadata: {
            notification_id: notification.id,
            drop_in_photo_id: notification.drop_in_photo_id,
          },
        });

        if (!creditConsumption.consumed) {
          return NextResponse.json(
            {
              error: `Drop-In credit required to open this photo (${creditsNeeded} credits)`,
              requiredCredits: creditsNeeded,
              availableCredits: creditConsumption.availableCredits,
            },
            { status: 402 }
          );
        }
      }

      updates.status = 'viewed';
      updates.viewed_at = new Date().toISOString();

      // Unlock gift message if available
      if (dropInPhoto?.is_gifted && dropInPhoto?.gift_message && !notification.gift_message_viewed) {
        updates.gift_message_viewed = true;

        // Update drop-in photo to mark message as unlocked
        await supabase
          .from('drop_in_photos')
          .update({ gift_message_unlocked_at: new Date().toISOString() })
          .eq('id', notification.drop_in_photo_id);
      }
    } else if (action === 'dismiss') {
      updates.status = 'dismissed';
      updates.dismissed_at = new Date().toISOString();
      updates.recipient_decision = 'dismissed';
      updates.sender_status = 'recipient_declined';
      updates.sender_notified_at = notification.sender_notified_at || new Date().toISOString();
    } else if (action === 'thank') {
      updates.status = notification.status === 'pending' ? 'viewed' : notification.status;
      updates.viewed_at = notification.viewed_at || new Date().toISOString();
      updates.sender_status = notification.sender_status || 'recipient_viewed';
    } else if (action === 'save') {
      updates.status = notification.status === 'pending' ? 'viewed' : notification.status;
      updates.viewed_at = notification.viewed_at || new Date().toISOString();
      updates.sender_status = notification.sender_status || 'recipient_viewed';
    } else if (action === 'block') {
      updates.status = 'dismissed';
      updates.dismissed_at = new Date().toISOString();
      updates.recipient_decision = 'declined_connection';
      updates.sender_status = 'recipient_declined';
      updates.sender_notified_at = notification.sender_notified_at || new Date().toISOString();

      // Block the uploader
      if (uploaderId) {
        await supabase
          .from('contacts')
          .upsert(
            {
              user_id: recipientAttendeeId,
              contact_id: uploaderId,
              contact_type: 'blocked',
            },
            { onConflict: 'user_id,contact_id' }
          );
      }
    } else if (action === 'accept_connection') {
      if (!uploaderId) {
        return NextResponse.json({ error: 'Uploader not found' }, { status: 404 });
      }

      updates.status = 'viewed';
      updates.viewed_at = notification.viewed_at || new Date().toISOString();
      updates.recipient_decision = 'accepted_connection';
      updates.sender_status = 'recipient_accepted';
      updates.sender_notified_at = notification.sender_notified_at || new Date().toISOString();

      await supabase
        .from('contacts')
        .upsert(
          [
            {
              user_id: recipientAttendeeId,
              contact_id: uploaderId,
              contact_type: 'mutual',
            },
            {
              user_id: uploaderId,
              contact_id: recipientAttendeeId,
              contact_type: 'mutual',
            },
          ],
          { onConflict: 'user_id,contact_id' }
        );

      await supabase.from('notifications').insert({
        user_id: uploaderId,
        channel: 'in_app',
        template_code: 'drop_in_connection_accepted',
        subject: 'Drop-In recipient accepted your connection',
        body: 'A recipient accepted your Drop-In connection request.',
        status: 'delivered',
        sent_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
        metadata: {
          dropInNotificationId: notification.id,
          dropInPhotoId: notification.drop_in_photo_id,
          recipientAccepted: true,
        },
      });
    } else if (action === 'decline_connection') {
      if (!uploaderId) {
        return NextResponse.json({ error: 'Uploader not found' }, { status: 404 });
      }

      updates.status = 'dismissed';
      updates.dismissed_at = new Date().toISOString();
      updates.recipient_decision = 'declined_connection';
      updates.sender_status = 'recipient_declined';
      updates.sender_notified_at = notification.sender_notified_at || new Date().toISOString();

      await supabase.from('notifications').insert({
        user_id: uploaderId,
        channel: 'in_app',
        template_code: 'drop_in_connection_declined',
        subject: 'Drop-In recipient declined connection',
        body: 'A recipient declined your Drop-In connection request.',
        status: 'delivered',
        sent_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
        metadata: {
          dropInNotificationId: notification.id,
          dropInPhotoId: notification.drop_in_photo_id,
          recipientAccepted: false,
        },
      });
    } else {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('drop_in_notifications')
      .update(updates)
      .eq('id', targetNotificationId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Drop-in notification update error:', error);
    return NextResponse.json(
      { error: 'Failed to update notification' },
      { status: 500 }
    );
  }
}

