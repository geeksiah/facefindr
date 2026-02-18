export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createClientWithAccessToken } from '@/lib/supabase/server';
import { normalizeUserType } from '@/lib/user-type';

type ProfileRecord = {
  id: string;
  is_public_profile: boolean | null;
  allow_follows?: boolean | null;
};

export interface PrivacySettings {
  profileVisible: boolean;
  allowPhotoTagging: boolean;
  showInSearch: boolean;
  allowFaceRecognition: boolean;
  shareActivityWithCreators: boolean;
  emailMarketing: boolean;
  allowFollows: boolean;
}

function getProfileTable(userType: 'creator' | 'attendee') {
  return userType === 'creator' ? 'photographers' : 'attendees';
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function isMissingColumnError(error: any, column: string) {
  return error?.code === '42703' && String(error?.message || '').includes(column);
}

async function getAuthClient(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  return accessToken ? createClientWithAccessToken(accessToken) : await createClient();
}

async function fetchProfileBy(
  supabase: any,
  profileTable: string,
  column: 'id' | 'user_id',
  value: string
): Promise<ProfileRecord | null> {
  const full = await supabase
    .from(profileTable)
    .select('id, is_public_profile, allow_follows')
    .eq(column, value)
    .maybeSingle();

  if (!full.error) {
    return full.data || null;
  }

  if (!isMissingColumnError(full.error, 'allow_follows')) {
    if (column === 'user_id' && isMissingColumnError(full.error, 'user_id')) {
      return null;
    }
    return null;
  }

  const fallback = await supabase
    .from(profileTable)
    .select('id, is_public_profile')
    .eq(column, value)
    .maybeSingle();

  if (column === 'user_id' && fallback.error && isMissingColumnError(fallback.error, 'user_id')) {
    return null;
  }

  if (!fallback.data) {
    return null;
  }

  return {
    id: fallback.data.id,
    is_public_profile: fallback.data.is_public_profile,
    allow_follows: true,
  };
}

async function resolveProfileRecord(
  supabase: any,
  profileTable: string,
  userId: string
): Promise<ProfileRecord | null> {
  const byId = await fetchProfileBy(supabase, profileTable, 'id', userId);
  if (byId) return byId;
  return fetchProfileBy(supabase, profileTable, 'user_id', userId);
}

function normalizeSettings(
  row: any,
  defaults: PrivacySettings
): PrivacySettings {
  return {
    profileVisible: asBoolean(
      row?.profile_visible ?? row?.profileVisible,
      defaults.profileVisible
    ),
    allowPhotoTagging: asBoolean(
      row?.allow_photo_tagging ?? row?.allowPhotoTagging,
      defaults.allowPhotoTagging
    ),
    showInSearch: asBoolean(row?.show_in_search ?? row?.showInSearch, defaults.showInSearch),
    allowFaceRecognition: asBoolean(
      row?.allow_face_recognition ?? row?.allowFaceRecognition,
      defaults.allowFaceRecognition
    ),
    shareActivityWithCreators: asBoolean(
      row?.share_activity_with_photographers ?? row?.shareActivityWithCreators,
      defaults.shareActivityWithCreators
    ),
    emailMarketing: asBoolean(row?.email_marketing ?? row?.emailMarketing, defaults.emailMarketing),
    allowFollows: asBoolean(row?.allow_follows ?? row?.allowFollows, defaults.allowFollows),
  };
}

async function insertDefaultSettings(
  supabase: any,
  payload: Record<string, any>
) {
  const withAllowFollows = await supabase
    .from('user_privacy_settings')
    .insert(payload)
    .select()
    .single();

  if (!withAllowFollows.error) {
    return withAllowFollows;
  }

  if (!isMissingColumnError(withAllowFollows.error, 'allow_follows')) {
    return withAllowFollows;
  }

  const { allow_follows, ...legacyPayload } = payload;
  return supabase
    .from('user_privacy_settings')
    .insert(legacyPayload)
    .select()
    .single();
}

async function upsertSettings(
  supabase: any,
  payload: Record<string, any>
) {
  const withAllowFollows = await supabase
    .from('user_privacy_settings')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (!withAllowFollows.error) {
    return withAllowFollows;
  }

  if (!isMissingColumnError(withAllowFollows.error, 'allow_follows')) {
    return withAllowFollows;
  }

  const { allow_follows, ...legacyPayload } = payload;
  return supabase
    .from('user_privacy_settings')
    .upsert(legacyPayload, { onConflict: 'user_id' })
    .select()
    .single();
}

async function syncProfileFlags(
  supabase: any,
  profileTable: string,
  profileId: string,
  flags: { is_public_profile: boolean; allow_follows: boolean }
) {
  const withAllowFollows = await supabase
    .from(profileTable)
    .update(flags)
    .eq('id', profileId);

  if (!withAllowFollows.error) {
    return null;
  }

  if (!isMissingColumnError(withAllowFollows.error, 'allow_follows')) {
    return withAllowFollows.error;
  }

  const { allow_follows, ...legacyFlags } = flags;
  const fallback = await supabase
    .from(profileTable)
    .update(legacyFlags)
    .eq('id', profileId);

  return fallback.error || null;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userType = normalizeUserType(user.user_metadata?.user_type) || 'attendee';
    const profileTable = getProfileTable(userType);
    const profileRecord = await resolveProfileRecord(supabase, profileTable, user.id);

    let { data: settings } = await supabase
      .from('user_privacy_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!settings) {
      const defaultRow = {
        user_id: user.id,
        user_type: userType,
        profile_visible: profileRecord?.is_public_profile ?? true,
        allow_photo_tagging: true,
        show_in_search: true,
        allow_face_recognition: true,
        share_activity_with_photographers: false,
        email_marketing: false,
        allow_follows: profileRecord?.allow_follows ?? true,
      };

      const { data: inserted, error: insertError } = await insertDefaultSettings(supabase, defaultRow);
      if (insertError) {
        if (insertError.code === '23505') {
          const { data: existing } = await supabase
            .from('user_privacy_settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
          settings = existing;
        } else {
          console.error('Error creating privacy settings:', insertError);
          return NextResponse.json(
            { error: 'Failed to create privacy settings' },
            { status: 500 }
          );
        }
      } else {
        settings = inserted;
      }
    }

    const defaults: PrivacySettings = {
      profileVisible: profileRecord?.is_public_profile ?? true,
      allowPhotoTagging: true,
      showInSearch: true,
      allowFaceRecognition: true,
      shareActivityWithCreators: false,
      emailMarketing: false,
      allowFollows: profileRecord?.allow_follows ?? true,
    };

    const normalized = normalizeSettings(settings, defaults);

    return NextResponse.json({
      settings: normalized,
    });
  } catch (error) {
    console.error('Privacy settings fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch privacy settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const userType = normalizeUserType(user.user_metadata?.user_type) || 'attendee';
    const profileTable = getProfileTable(userType);
    const profileRecord = await resolveProfileRecord(supabase, profileTable, user.id);

    const { data: existingSettings } = await supabase
      .from('user_privacy_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const defaults = normalizeSettings(existingSettings, {
      profileVisible: profileRecord?.is_public_profile ?? true,
      allowPhotoTagging: true,
      showInSearch: true,
      allowFaceRecognition: true,
      shareActivityWithCreators: false,
      emailMarketing: false,
      allowFollows: profileRecord?.allow_follows ?? true,
    });

    const nextSettings: PrivacySettings = {
      profileVisible: asBoolean(
        body.profileVisible ?? body.publicProfile ?? body.profile_visible,
        defaults.profileVisible
      ),
      allowPhotoTagging: asBoolean(
        body.allowPhotoTagging ?? body.allowTagging ?? body.allow_photo_tagging,
        defaults.allowPhotoTagging
      ),
      showInSearch: asBoolean(body.showInSearch ?? body.show_in_search, defaults.showInSearch),
      allowFaceRecognition: asBoolean(
        body.allowFaceRecognition ?? body.allow_face_recognition,
        defaults.allowFaceRecognition
      ),
      shareActivityWithCreators: asBoolean(
        body.shareActivityWithCreators ?? body.share_activity_with_photographers,
        defaults.shareActivityWithCreators
      ),
      emailMarketing: asBoolean(body.emailMarketing ?? body.email_marketing, defaults.emailMarketing),
      allowFollows: asBoolean(body.allowFollows ?? body.allow_follows, defaults.allowFollows),
    };

    const payload = {
      user_id: user.id,
      user_type: userType,
      profile_visible: nextSettings.profileVisible,
      allow_photo_tagging: nextSettings.allowPhotoTagging,
      show_in_search: nextSettings.showInSearch,
      allow_face_recognition: nextSettings.allowFaceRecognition,
      share_activity_with_photographers: nextSettings.shareActivityWithCreators,
      email_marketing: nextSettings.emailMarketing,
      allow_follows: nextSettings.allowFollows,
      updated_at: new Date().toISOString(),
    };

    const { data: savedSettings, error: upsertError } = await upsertSettings(supabase, payload);

    if (upsertError) {
      console.error('Error updating privacy settings:', upsertError);
      return NextResponse.json(
        { error: 'Failed to update privacy settings' },
        { status: 500 }
      );
    }

    if (profileRecord?.id) {
      const syncError = await syncProfileFlags(supabase, profileTable, profileRecord.id, {
        is_public_profile: nextSettings.profileVisible,
        allow_follows: nextSettings.allowFollows,
      });

      if (syncError) {
        console.error('Error syncing profile privacy flags:', syncError);
        return NextResponse.json(
          { error: 'Failed to sync profile settings' },
          { status: 500 }
        );
      }
    }

    const normalizedSaved = normalizeSettings(savedSettings, nextSettings);

    return NextResponse.json({
      success: true,
      settings: normalizedSaved,
    });
  } catch (error) {
    console.error('Privacy settings update error:', error);
    return NextResponse.json(
      { error: 'Failed to update privacy settings' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  return PUT(request);
}
