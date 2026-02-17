export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { normalizeUserType } from '@/lib/user-type';
import { createClient, createClientWithAccessToken, createServiceClient } from '@/lib/supabase/server';

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

    const serviceClient = createServiceClient();
    const { data: currentProfileRecord } = await serviceClient
      .from(profileTable)
      .select('is_public_profile')
      .eq('id', user.id)
      .single();
    let profileRecord = currentProfileRecord;

    // Try to get existing settings (use service client to bypass RLS)
    let { data: settings } = await serviceClient
      .from('user_privacy_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // If no settings exist, create default ones
    if (!settings) {
      const { data: newSettings, error: insertError } = await serviceClient
        .from('user_privacy_settings')
        .insert({
          user_id: user.id,
          user_type: userType,
          profile_visible: profileRecord?.is_public_profile ?? (userType === 'creator'),
          allow_photo_tagging: true,
          show_in_search: true,
          allow_face_recognition: true,
          share_activity_with_photographers: false,
          email_marketing: false,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating privacy settings:', insertError);
        return NextResponse.json(
          { error: 'Failed to create privacy settings' },
          { status: 500 }
        );
      }

      settings = newSettings;
    }

    // Keep legacy rows in sync with profile visibility for search/public profile usage.
    if (
      settings &&
      typeof settings.profile_visible === 'boolean' &&
      profileRecord &&
      settings.profile_visible !== profileRecord.is_public_profile
    ) {
      await serviceClient
        .from(profileTable)
        .update({ is_public_profile: settings.profile_visible })
        .eq('id', user.id);
      profileRecord = { ...profileRecord, is_public_profile: settings.profile_visible };
    }

    return NextResponse.json({
      settings: {
        profileVisible: profileRecord?.is_public_profile ?? settings.profile_visible,
        allowPhotoTagging: settings.allow_photo_tagging,
        showInSearch: settings.show_in_search,
        allowFaceRecognition: settings.allow_face_recognition,
        shareActivityWithCreators: settings.share_activity_with_photographers,
        emailMarketing: settings.email_marketing,
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
    const {
      profileVisible,
      allowPhotoTagging,
      showInSearch,
      allowFaceRecognition,
      shareActivityWithCreators,
      emailMarketing,
    } = body;

    const userType = normalizeUserType(user.user_metadata?.user_type) || 'attendee';
    const profileTable = getProfileTable(userType);

    // Use service client to bypass RLS for settings operations
    const serviceClient = createServiceClient();

    // Check if settings exist
    const { data: existing } = await serviceClient
      .from('user_privacy_settings')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // Only update fields that were provided
    if (typeof profileVisible === 'boolean') updateData.profile_visible = profileVisible;
    if (typeof allowPhotoTagging === 'boolean') updateData.allow_photo_tagging = allowPhotoTagging;
    if (typeof showInSearch === 'boolean') updateData.show_in_search = showInSearch;
    if (typeof allowFaceRecognition === 'boolean') updateData.allow_face_recognition = allowFaceRecognition;
    if (typeof shareActivityWithCreators === 'boolean') updateData.share_activity_with_photographers = shareActivityWithCreators;
    if (typeof emailMarketing === 'boolean') updateData.email_marketing = emailMarketing;

    let result;

    if (existing) {
      // Update existing settings
      result = await serviceClient
        .from('user_privacy_settings')
        .update(updateData)
        .eq('user_id', user.id)
        .select()
        .single();
    } else {
      // Insert new settings
      result = await serviceClient
        .from('user_privacy_settings')
        .insert({
          user_id: user.id,
          user_type: userType,
          ...updateData,
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error('Error updating privacy settings:', result.error);
      return NextResponse.json(
        { error: 'Failed to update privacy settings' },
        { status: 500 }
      );
    }

    if (typeof profileVisible === 'boolean') {
      const serviceClient = createServiceClient();
      const { error: profileUpdateError } = await serviceClient
        .from(profileTable)
        .update({ is_public_profile: profileVisible })
        .eq('id', user.id);

      if (profileUpdateError) {
        console.error('Error syncing profile visibility:', profileUpdateError);
        return NextResponse.json(
          { error: 'Failed to sync profile visibility' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      settings: {
        profileVisible: result.data.profile_visible,
        allowPhotoTagging: result.data.allow_photo_tagging,
        showInSearch: result.data.show_in_search,
        allowFaceRecognition: result.data.allow_face_recognition,
        shareActivityWithCreators: result.data.share_activity_with_photographers,
        emailMarketing: result.data.email_marketing,
      },
    });

  } catch (error) {
    console.error('Privacy settings update error:', error);
    return NextResponse.json(
      { error: 'Failed to update privacy settings' },
      { status: 500 }
    );
  }
}

