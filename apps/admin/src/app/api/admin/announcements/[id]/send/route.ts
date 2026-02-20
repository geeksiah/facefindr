import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { syncAnnouncementDeliveryState } from '@/lib/announcement-delivery';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('announcements.send'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { id } = params;

    // Get announcement
    const { data: announcement, error } = await supabaseAdmin
      .from('platform_announcements')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !announcement) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }

    if (!['draft', 'scheduled'].includes(String(announcement.status))) {
      return NextResponse.json(
        { error: 'Only draft or scheduled announcements can be sent' },
        { status: 409 }
      );
    }

    const targetCountry = announcement.country_code ? String(announcement.country_code).toUpperCase() : null;

    const fetchTargets = async (table: 'photographers' | 'attendees') => {
      let query = supabaseAdmin
        .from(table)
        .select('id, email, country_code')
        .eq('status', 'active');

      if (targetCountry) {
        query = query.eq('country_code', targetCountry);
      }

      const { data } = await query;
      return data || [];
    };

    const [photographers, attendees] = await Promise.all([
      announcement.target === 'all' || announcement.target === 'photographers'
        ? fetchTargets('photographers')
        : Promise.resolve([]),
      announcement.target === 'all' || announcement.target === 'attendees'
        ? fetchTargets('attendees')
        : Promise.resolve([]),
    ]);

    const targets = [...photographers, ...attendees];
    const userCount = targets.length;

    if (userCount === 0) {
      return NextResponse.json({ error: 'No matching users found for this announcement' }, { status: 400 });
    }

    const uniqueCountries = Array.from(
      new Set(
        targets
          .map((user: any) => (user.country_code ? String(user.country_code).toUpperCase() : null))
          .filter(Boolean)
      )
    ) as string[];

    const { data: regionConfigs } = await supabaseAdmin
      .from('region_config')
      .select('region_code, is_active, email_provider, sms_provider, push_provider, email_enabled, sms_enabled, push_enabled')
      .in('region_code', targetCountry ? [targetCountry] : uniqueCountries);

    const regionMap = new Map(
      (regionConfigs || []).map((region: any) => [region.region_code, region])
    );

    const missingRegionConfig = uniqueCountries.filter((country) => !regionMap.has(country));
    if (missingRegionConfig.length > 0) {
      return NextResponse.json(
        {
          error: `Missing region configuration for: ${missingRegionConfig.join(', ')}`,
          failClosed: true,
        },
        { status: 503 }
      );
    }

    const configErrors: string[] = [];
    for (const country of uniqueCountries) {
      const region = regionMap.get(country);
      if (!region?.is_active) {
        configErrors.push(`${country}: region disabled`);
        continue;
      }
      if (announcement.send_email && region.email_enabled !== false && !region.email_provider) {
        configErrors.push(`${country}: email enabled but provider missing`);
      }
      if (announcement.send_sms && region.sms_enabled === true && !region.sms_provider) {
        configErrors.push(`${country}: sms enabled but provider missing`);
      }
      if (announcement.send_push && region.push_enabled === true && !region.push_provider) {
        configErrors.push(`${country}: push enabled but provider missing`);
      }
    }

    if (configErrors.length > 0) {
      return NextResponse.json(
        {
          error: 'Announcement channel configuration invalid',
          details: configErrors,
          failClosed: true,
        },
        { status: 503 }
      );
    }

    const { data: prefs } = await supabaseAdmin
      .from('user_notification_preferences')
      .select('user_id, email_enabled, sms_enabled, push_enabled, phone_number, phone_verified')
      .in('user_id', targets.map((user: any) => user.id));

    const prefsMap = new Map((prefs || []).map((pref: any) => [pref.user_id, pref]));

    const notifications: any[] = [];

    for (const user of targets) {
      const userPrefs = prefsMap.get(user.id) || {
        email_enabled: true,
        sms_enabled: false,
        push_enabled: true,
        phone_number: null,
        phone_verified: false,
      };

      const userCountry = targetCountry || (user.country_code ? String(user.country_code).toUpperCase() : null);
      const region = userCountry ? regionMap.get(userCountry) : null;
      if (!region || !region.is_active) {
        continue;
      }

      if (announcement.send_email && user.email && userPrefs.email_enabled && region.email_enabled !== false && region.email_provider) {
        notifications.push({
          user_id: user.id,
          template_code: 'platform_announcement',
          channel: 'email',
          subject: announcement.title,
          body: announcement.content,
          variables: { title: announcement.title, content: announcement.content },
          status: 'pending',
          provider_used: region?.email_provider || null,
          metadata: {
            announcement_id: announcement.id,
            country_code: userCountry,
          },
        });
      }

      if (
        announcement.send_sms &&
        userPrefs.sms_enabled &&
        userPrefs.phone_verified &&
        userPrefs.phone_number &&
        region.sms_enabled === true &&
        region.sms_provider
      ) {
        notifications.push({
          user_id: user.id,
          template_code: 'platform_announcement',
          channel: 'sms',
          body: announcement.content,
          variables: { title: announcement.title, content: announcement.content },
          status: 'pending',
          provider_used: region?.sms_provider || null,
          metadata: {
            announcement_id: announcement.id,
            country_code: userCountry,
            phone_number: userPrefs.phone_number,
          },
        });
      }

      if (announcement.send_push && userPrefs.push_enabled && region.push_enabled === true && region.push_provider) {
        notifications.push({
          user_id: user.id,
          template_code: 'platform_announcement',
          channel: 'push',
          subject: announcement.title,
          body: announcement.content,
          variables: { title: announcement.title, content: announcement.content },
          status: 'pending',
          provider_used: region.push_provider,
          metadata: {
            announcement_id: announcement.id,
            country_code: userCountry,
          },
        });
      }
    }

    const queuedCount = notifications.length;
    if (queuedCount === 0) {
      return NextResponse.json(
        { error: 'No eligible notification recipients based on channel preferences and region availability' },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabaseAdmin
      .from('notifications')
      .insert(notifications);

    if (insertError) {
      console.error('Announcement notification insert error:', insertError);
      return NextResponse.json({ error: 'Failed to queue notifications' }, { status: 500 });
    }

    // Queue announcement (delivery truth is synced from notification statuses)
    await supabaseAdmin
      .from('platform_announcements')
      .update({
        status: 'queued',
        sent_at: null,
        sent_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    await syncAnnouncementDeliveryState(id);

    await logAction('announcement_send', 'announcement', id, {
      target: announcement.target,
      matched_users: userCount,
      queued_count: queuedCount,
      country_code: targetCountry,
      channels: {
        send_email: announcement.send_email,
        send_push: announcement.send_push,
        send_sms: announcement.send_sms,
      },
    });

    return NextResponse.json({
      success: true,
      matched_users: userCount,
      queued_count: queuedCount,
    });
  } catch (error) {
    console.error('Send announcement error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
