export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createClientWithAccessToken } from '@/lib/supabase/server';

interface AttendeeNotificationSettings {
  photoMatches: boolean;
  newEvents: boolean;
  eventUpdates: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

function defaultSettings(): AttendeeNotificationSettings {
  return {
    photoMatches: true,
    newEvents: true,
    eventUpdates: true,
    emailNotifications: true,
    pushNotifications: false,
  };
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

async function getAuthClient(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  return accessToken
    ? createClientWithAccessToken(accessToken)
    : await createClient();
}

function mapFromPreferences(row: any): AttendeeNotificationSettings {
  const defaults = defaultSettings();
  return {
    photoMatches: asBoolean(row?.photo_match_enabled, defaults.photoMatches),
    newEvents: asBoolean(row?.new_event_view_enabled, defaults.newEvents),
    eventUpdates: asBoolean(row?.event_reminder_enabled, defaults.eventUpdates),
    emailNotifications: asBoolean(row?.email_enabled, defaults.emailNotifications),
    pushNotifications: asBoolean(row?.push_enabled, defaults.pushNotifications),
  };
}

// ============================================
// GET NOTIFICATION SETTINGS
// ============================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_notification_preferences')
      .select(`
        email_enabled,
        push_enabled,
        photo_match_enabled,
        new_event_view_enabled,
        event_reminder_enabled
      `)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Failed to get notification settings:', error);
      return NextResponse.json(
        { error: 'Failed to load settings' },
        { status: 500 }
      );
    }

    if (!data) {
      const defaults = defaultSettings();
      await supabase
        .from('user_notification_preferences')
        .upsert({
          user_id: user.id,
          email_enabled: defaults.emailNotifications,
          push_enabled: defaults.pushNotifications,
          photo_match_enabled: defaults.photoMatches,
          new_event_view_enabled: defaults.newEvents,
          event_reminder_enabled: defaults.eventUpdates,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      return NextResponse.json(defaults);
    }

    return NextResponse.json(mapFromPreferences(data));

  } catch (error) {
    console.error('Failed to get notification settings:', error);
    return NextResponse.json(
      { error: 'Failed to load settings' },
      { status: 500 }
    );
  }
}

// ============================================
// UPDATE NOTIFICATION SETTINGS
// ============================================

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const { data: existing } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const current = mapFromPreferences(existing);
    const next: AttendeeNotificationSettings = {
      photoMatches: asBoolean(body.photoMatches, current.photoMatches),
      newEvents: asBoolean(body.newEvents, current.newEvents),
      eventUpdates: asBoolean(body.eventUpdates, current.eventUpdates),
      emailNotifications: asBoolean(body.emailNotifications, current.emailNotifications),
      pushNotifications: asBoolean(body.pushNotifications, current.pushNotifications),
    };

    const { error: upsertError } = await supabase
      .from('user_notification_preferences')
      .upsert({
        user_id: user.id,
        email_enabled: next.emailNotifications,
        push_enabled: next.pushNotifications,
        photo_match_enabled: next.photoMatches,
        new_event_view_enabled: next.newEvents,
        event_reminder_enabled: next.eventUpdates,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (upsertError) {
      console.error('Failed to update notification settings:', upsertError);
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, ...next });

  } catch (error) {
    console.error('Failed to update notification settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  return PATCH(request);
}

