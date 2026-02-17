export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { normalizeUserType } from '@/lib/user-type';
import { createClient, createClientWithAccessToken } from '@/lib/supabase/server';

async function getAuthClient(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  return accessToken
    ? createClientWithAccessToken(accessToken)
    : await createClient();
}

export interface PrivacySettings {
  profileVisible: boolean;
  allowPhotoTagging: boolean;
  showInSearch: boolean;
  allowFaceRecognition: boolean;
  shareActivityWithCreators: boolean;
  emailMarketing: boolean;
}

function getProfileTable(userType: 'creator' | 'attendee') {
  return userType === 'creator' ? 'photographers' : 'attendees';
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeSettings(
  row: any,
  defaults: {
    profileVisible: boolean;
    allowPhotoTagging: boolean;
    showInSearch: boolean;
    allowFaceRecognition: boolean;
    shareActivityWithCreators: boolean;
    emailMarketing: boolean;
  }
): PrivacySettings {
  return {
    profileVisible: asBoolean(row?.profile_visible, defaults.profileVisible),
    allowPhotoTagging: asBoolean(row?.allow_photo_tagging, defaults.allowPhotoTagging),
    showInSearch: asBoolean(row?.show_in_search, defaults.showInSearch),
    allowFaceRecognition: asBoolean(row?.allow_face_recognition, defaults.allowFaceRecognition),
    shareActivityWithCreators: asBoolean(
      row?.share_activity_with_photographers,
      defaults.shareActivityWithCreators
    ),
    emailMarketing: asBoolean(row?.email_marketing, defaults.emailMarketing),
  };
}

// GET - Fetch user's privacy settings
export async function GET(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userType = normalizeUserType(user.user_metadata?.user_type) || 'attendee';
    const profileTable = getProfileTable(userType);
    const { data: currentProfileRecord } = await supabase
      .from(profileTable)
      .select('is_public_profile')
      .eq('id', user.id)
      .maybeSingle();
    let profileRecord = currentProfileRecord;
    let { data: settings } = await supabase
      .from('user_privacy_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // If no settings exist, create default ones
    if (!settings) {
      const defaultProfileVisible =
        profileRecord?.is_public_profile ?? (userType === 'creator');
      const { data: newSettings, error: insertError } = await supabase
        .from('user_privacy_settings')
        .insert({
          user_id: user.id,
          user_type: userType,
          profile_visible: defaultProfileVisible,
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
          console.error('Error creating privacy settings:', insertError);
          return NextResponse.json(
            { error: 'Failed to create privacy settings' },
            { status: 500 }
          );
        }
      } else {
        settings = newSettings;
      }
    }

    const normalized = normalizeSettings(settings, {
      profileVisible: profileRecord?.is_public_profile ?? (userType === 'creator'),
      allowPhotoTagging: true,
      showInSearch: true,
      allowFaceRecognition: true,
      shareActivityWithCreators: false,
      emailMarketing: false,
    });

    // Keep profile visibility in sync.
    if (
      profileRecord &&
      normalized.profileVisible !== profileRecord.is_public_profile
    ) {
      const { error: syncError } = await supabase
        .from(profileTable)
        .update({ is_public_profile: normalized.profileVisible })
        .eq('id', user.id);

      if (!syncError) {
        profileRecord = {
          ...profileRecord,
          is_public_profile: normalized.profileVisible,
        };
      } else {
        console.error('Error syncing profile visibility:', syncError);
      }
    }

    return NextResponse.json({
      settings: {
        ...normalized,
        profileVisible: profileRecord?.is_public_profile ?? normalized.profileVisible,
      },
    });

  } catch (error) {
    console.error('Privacy settings fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch privacy settings' },
      { status: 500 }
    );
  }
}

// PUT - Update user's privacy settings
export async function PUT(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const userType = normalizeUserType(user.user_metadata?.user_type) || 'attendee';
    const profileTable = getProfileTable(userType);

    const { data: profileRecord } = await supabase
      .from(profileTable)
      .select('is_public_profile')
      .eq('id', user.id)
      .maybeSingle();

    const { data: existingSettings } = await supabase
      .from('user_privacy_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const defaults = normalizeSettings(existingSettings, {
      profileVisible: profileRecord?.is_public_profile ?? (userType === 'creator'),
      allowPhotoTagging: true,
      showInSearch: true,
      allowFaceRecognition: true,
      shareActivityWithCreators: false,
      emailMarketing: false,
    });

    const nextSettings: PrivacySettings = {
      profileVisible: asBoolean(
        body.profileVisible ?? body.publicProfile,
        defaults.profileVisible
      ),
      allowPhotoTagging: asBoolean(
        body.allowPhotoTagging ?? body.allowTagging,
        defaults.allowPhotoTagging
      ),
      showInSearch: asBoolean(body.showInSearch, defaults.showInSearch),
      allowFaceRecognition: asBoolean(body.allowFaceRecognition, defaults.allowFaceRecognition),
      shareActivityWithCreators: asBoolean(
        body.shareActivityWithCreators,
        defaults.shareActivityWithCreators
      ),
      emailMarketing: asBoolean(body.emailMarketing, defaults.emailMarketing),
    };

    const { data: savedSettings, error: upsertError } = await supabase
      .from('user_privacy_settings')
      .upsert({
        user_id: user.id,
        user_type: userType,
        profile_visible: nextSettings.profileVisible,
        allow_photo_tagging: nextSettings.allowPhotoTagging,
        show_in_search: nextSettings.showInSearch,
        allow_face_recognition: nextSettings.allowFaceRecognition,
        share_activity_with_photographers: nextSettings.shareActivityWithCreators,
        email_marketing: nextSettings.emailMarketing,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (upsertError) {
      console.error('Error updating privacy settings:', upsertError);
      return NextResponse.json(
        { error: 'Failed to update privacy settings' },
        { status: 500 }
      );
    }

    if (!profileRecord || profileRecord.is_public_profile !== nextSettings.profileVisible) {
      const { error: profileUpdateError } = await supabase
        .from(profileTable)
        .update({ is_public_profile: nextSettings.profileVisible })
        .eq('id', user.id);

      if (profileUpdateError) {
        console.error('Error syncing profile visibility:', profileUpdateError);
        return NextResponse.json(
          { error: 'Failed to sync profile visibility' },
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
