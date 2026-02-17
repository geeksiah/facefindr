export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { normalizeUserType } from '@/lib/user-type';
import { createClient, createClientWithAccessToken } from '@/lib/supabase/server';

interface NormalizedSettings {
  profileVisible: boolean;
  allowPhotoTagging: boolean;
  showInSearch: boolean;
  allowFaceRecognition: boolean;
  shareActivityWithCreators: boolean;
  emailMarketing: boolean;
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

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeRow(
  row: any,
  fallbackProfileVisible: boolean
): NormalizedSettings {
  return {
    profileVisible: asBoolean(row?.profile_visible, fallbackProfileVisible),
    allowPhotoTagging: asBoolean(row?.allow_photo_tagging, true),
    showInSearch: asBoolean(row?.show_in_search, true),
    allowFaceRecognition: asBoolean(row?.allow_face_recognition, true),
    shareActivityWithCreators: asBoolean(row?.share_activity_with_photographers, false),
    emailMarketing: asBoolean(row?.email_marketing, false),
  };
}

function toLegacyResponse(settings: NormalizedSettings) {
  return {
    allowTagging: settings.allowPhotoTagging,
    publicProfile: settings.profileVisible,
    showInSearch: settings.showInSearch,
    settings,
  };
}

// ============================================
// GET PRIVACY SETTINGS
// ============================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userType = normalizeUserType(user.user_metadata?.user_type) || 'attendee';
    const profileTable = userType === 'creator' ? 'photographers' : 'attendees';
    const defaultProfileVisible = userType === 'creator';

    const { data: profileRecord } = await supabase
      .from(profileTable)
      .select('is_public_profile')
      .eq('id', user.id)
      .maybeSingle();

    const fallbackProfileVisible =
      profileRecord?.is_public_profile ?? defaultProfileVisible;

    let { data: settings } = await supabase
      .from('user_privacy_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!settings) {
      const { data: inserted, error: insertError } = await supabase
        .from('user_privacy_settings')
        .insert({
          user_id: user.id,
          user_type: userType,
          profile_visible: fallbackProfileVisible,
          allow_photo_tagging: true,
          show_in_search: true,
          allow_face_recognition: true,
          share_activity_with_photographers: false,
          email_marketing: false,
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          const { data: existingRow } = await supabase
            .from('user_privacy_settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
          settings = existingRow;
        } else {
          console.error('Failed to create privacy settings:', insertError);
          return NextResponse.json(
            { error: 'Failed to load settings' },
            { status: 500 }
          );
        }
      } else {
        settings = inserted;
      }
    }

    const normalized = normalizeRow(settings, fallbackProfileVisible);

    return NextResponse.json(toLegacyResponse(normalized));

  } catch (error) {
    console.error('Failed to get privacy settings:', error);
    return NextResponse.json(
      { error: 'Failed to load settings' },
      { status: 500 }
    );
  }
}

// ============================================
// UPDATE PRIVACY SETTINGS
// ============================================

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const userType = normalizeUserType(user.user_metadata?.user_type) || 'attendee';
    const profileTable = userType === 'creator' ? 'photographers' : 'attendees';
    const defaultProfileVisible = userType === 'creator';

    const { data: profileRecord } = await supabase
      .from(profileTable)
      .select('is_public_profile')
      .eq('id', user.id)
      .maybeSingle();
    const fallbackProfileVisible =
      profileRecord?.is_public_profile ?? defaultProfileVisible;

    const { data: existing } = await supabase
      .from('user_privacy_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const current = normalizeRow(existing, fallbackProfileVisible);

    const nextSettings: NormalizedSettings = {
      profileVisible: asBoolean(
        body.profileVisible ?? body.publicProfile,
        current.profileVisible
      ),
      allowPhotoTagging: asBoolean(
        body.allowPhotoTagging ?? body.allowTagging,
        current.allowPhotoTagging
      ),
      showInSearch: asBoolean(body.showInSearch, current.showInSearch),
      allowFaceRecognition: asBoolean(body.allowFaceRecognition, current.allowFaceRecognition),
      shareActivityWithCreators: asBoolean(
        body.shareActivityWithCreators,
        current.shareActivityWithCreators
      ),
      emailMarketing: asBoolean(body.emailMarketing, current.emailMarketing),
    };

    const { error: upsertError } = await supabase
      .from('user_privacy_settings')
      .upsert(
        {
          user_id: user.id,
          user_type: userType,
          profile_visible: nextSettings.profileVisible,
          allow_photo_tagging: nextSettings.allowPhotoTagging,
          show_in_search: nextSettings.showInSearch,
          allow_face_recognition: nextSettings.allowFaceRecognition,
          share_activity_with_photographers: nextSettings.shareActivityWithCreators,
          email_marketing: nextSettings.emailMarketing,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      console.error('Failed to update privacy settings:', upsertError);
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      );
    }

    if (profileRecord?.is_public_profile !== nextSettings.profileVisible) {
      const { error: profileError } = await supabase
        .from(profileTable)
        .update({ is_public_profile: nextSettings.profileVisible })
        .eq('id', user.id);

      if (profileError) {
        console.error('Failed to sync profile visibility:', profileError);
        return NextResponse.json(
          { error: 'Failed to update settings' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, ...toLegacyResponse(nextSettings) });

  } catch (error) {
    console.error('Failed to update privacy settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  return PATCH(request);
}

