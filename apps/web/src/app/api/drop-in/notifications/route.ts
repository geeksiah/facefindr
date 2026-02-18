export const dynamic = 'force-dynamic';

/**
 * Drop-In Notifications API
 * 
 * Manages notifications for drop-in photos
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createClientWithAccessToken } from '@/lib/supabase/server';

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
        gift_message_available,
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
      .eq('recipient_id', user.id)
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

        const { data: urlData } = await supabase.storage
          .from('media')
          .createSignedUrl(path, 3600);

        return {
          ...notif,
          photo: {
            ...photo,
            thumbnailUrl: urlData?.signedUrl || null,
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

    const { notificationId, action } = await request.json();

    if (!notificationId) {
      return NextResponse.json({ error: 'notificationId is required' }, { status: 400 });
    }

    // Get notification
    const { data: notification, error: notifError } = await supabase
      .from('drop_in_notifications')
      .select('*')
      .eq('id', notificationId)
      .eq('recipient_id', user.id)
      .single();

    if (notifError || !notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

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
        const { data: creditsConsumed, error: creditsError } = await supabase.rpc('use_drop_in_credits', {
          p_attendee_id: user.id,
          p_action: 'drop_in_recipient_unlock',
          p_credits_needed: 1,
          p_metadata: {
            notification_id: notification.id,
            drop_in_photo_id: notification.drop_in_photo_id,
          },
        });

        if (creditsError || !creditsConsumed) {
          return NextResponse.json(
            { error: 'Drop-In credit required to open this photo' },
            { status: 402 }
          );
        }
      }

      updates.status = 'viewed';
      updates.viewed_at = new Date().toISOString();

      // Unlock gift message if available
      if (notification.gift_message_available && !notification.gift_message_viewed) {
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
    } else if (action === 'thank') {
      updates.user_action = 'thanked';
      updates.user_action_at = new Date().toISOString();
    } else if (action === 'save') {
      updates.user_action = 'saved';
      updates.user_action_at = new Date().toISOString();
    } else if (action === 'block') {
      updates.user_action = 'blocked';
      updates.user_action_at = new Date().toISOString();

      // Block the uploader
      if (uploaderId) {
        await supabase
          .from('contacts')
          .upsert(
            {
              user_id: user.id,
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

      updates.user_action = 'accepted_connection';
      updates.user_action_at = new Date().toISOString();
      updates.status = 'viewed';
      updates.viewed_at = notification.viewed_at || new Date().toISOString();

      await supabase
        .from('contacts')
        .upsert(
          [
            {
              user_id: user.id,
              contact_id: uploaderId,
              contact_type: 'mutual',
            },
            {
              user_id: uploaderId,
              contact_id: user.id,
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

      updates.user_action = 'declined_connection';
      updates.user_action_at = new Date().toISOString();
      updates.status = 'dismissed';
      updates.dismissed_at = new Date().toISOString();

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
    }

    const { error: updateError } = await supabase
      .from('drop_in_notifications')
      .update(updates)
      .eq('id', notificationId);

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

