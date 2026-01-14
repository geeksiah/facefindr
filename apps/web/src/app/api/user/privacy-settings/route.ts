import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface PrivacySettings {
  profileVisible: boolean;
  allowPhotoTagging: boolean;
  showInSearch: boolean;
  allowFaceRecognition: boolean;
  shareActivityWithPhotographers: boolean;
  emailMarketing: boolean;
}

// GET - Fetch user's privacy settings
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Try to get existing settings
    let { data: settings, error } = await supabase
      .from('user_privacy_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // If no settings exist, create default ones
    if (!settings) {
      const userType = user.user_metadata?.user_type || 'attendee';
      
      const { data: newSettings, error: insertError } = await supabase
        .from('user_privacy_settings')
        .insert({
          user_id: user.id,
          user_type: userType,
          profile_visible: true,
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

    return NextResponse.json({
      settings: {
        profileVisible: settings.profile_visible,
        allowPhotoTagging: settings.allow_photo_tagging,
        showInSearch: settings.show_in_search,
        allowFaceRecognition: settings.allow_face_recognition,
        shareActivityWithPhotographers: settings.share_activity_with_photographers,
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
    const supabase = await createClient();
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
      shareActivityWithPhotographers,
      emailMarketing,
    } = body;

    // Check if settings exist
    const { data: existing } = await supabase
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
    if (typeof shareActivityWithPhotographers === 'boolean') updateData.share_activity_with_photographers = shareActivityWithPhotographers;
    if (typeof emailMarketing === 'boolean') updateData.email_marketing = emailMarketing;

    let result;

    if (existing) {
      // Update existing settings
      result = await supabase
        .from('user_privacy_settings')
        .update(updateData)
        .eq('user_id', user.id)
        .select()
        .single();
    } else {
      // Insert new settings
      const userType = user.user_metadata?.user_type || 'attendee';
      result = await supabase
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

    return NextResponse.json({
      success: true,
      settings: {
        profileVisible: result.data.profile_visible,
        allowPhotoTagging: result.data.allow_photo_tagging,
        showInSearch: result.data.show_in_search,
        allowFaceRecognition: result.data.allow_face_recognition,
        shareActivityWithPhotographers: result.data.share_activity_with_photographers,
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
