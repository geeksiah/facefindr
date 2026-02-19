export const dynamic = 'force-dynamic';

/**
 * Creator Profile API
 * 
 * Get and update photographer profile information.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

function isMissingColumnError(error: any, columnName: string) {
  return error?.code === '42703' && typeof error?.message === 'string' && error.message.includes(columnName);
}

async function resolvePhotographerProfileByUser(supabase: any, userId: string) {
  const byUserId = await supabase
    .from('photographers')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!byUserId.error || !isMissingColumnError(byUserId.error, 'user_id')) {
    return byUserId;
  }

  const fallback = await supabase
    .from('photographers')
    .select('*')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  return {
    data: fallback.data ? { ...fallback.data, user_id: fallback.data.id } : fallback.data,
    error: fallback.error,
  };
}

// GET - Get photographer profile
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error } = await resolvePhotographerProfileByUser(supabase, user.id);

    if (error) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({
      profile: {
        id: profile.id,
        email: user.email,
        displayName: profile.display_name,
        businessName: profile.business_name,
        bio: profile.bio,
        profilePhotoUrl: profile.profile_photo_url,
        faceTag: profile.face_tag,
        publicProfileSlug: profile.public_profile_slug,
        isPublicProfile: profile.is_public_profile,
        website: profile.website,
        instagram: profile.instagram,
        twitter: profile.twitter,
        facebook: profile.facebook,
        phone: profile.phone,
        location: profile.location,
        countryCode: (profile as any).country_code || null,
        timezone: profile.timezone,
        createdAt: profile.created_at,
      },
    });

  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: 'Failed to get profile' },
      { status: 500 }
    );
  }
}

// PUT - Update photographer profile
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      displayName,
      businessName,
      bio,
      website,
      instagram,
      twitter,
      facebook,
      phone,
      location,
      countryCode,
      timezone,
    } = body;

    const normalizedCountryCode =
      typeof countryCode === 'string' && /^[A-Za-z]{2}$/.test(countryCode.trim())
        ? countryCode.trim().toUpperCase()
        : null;

    const { data: profileRecord, error: profileLookupError } =
      await resolvePhotographerProfileByUser(supabase, user.id);
    if (profileLookupError || !profileRecord) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    const profileId = profileRecord.id;

    // Update profile
    const updatePayload: Record<string, any> = {
        display_name: displayName,
        business_name: businessName,
        bio,
        website,
        instagram,
        twitter,
        facebook,
        phone,
        location,
        timezone,
        updated_at: new Date().toISOString(),
      };

    if (countryCode !== undefined) {
      if (!normalizedCountryCode) {
        return NextResponse.json({ error: 'Invalid country code' }, { status: 400 });
      }
      updatePayload.country_code = normalizedCountryCode;
    }

    let updateQuery = supabase
      .from('photographers')
      .update(updatePayload)
      .eq('id', profileId)
      .select()
      .single();

    let { data: profile, error } = await updateQuery;

    if (error?.code === '42703' && String(error.message || '').includes('country_code')) {
      const { country_code, ...legacyPayload } = updatePayload;
      const fallback = await supabase
        .from('photographers')
        .update(legacyPayload)
        .eq('id', profileId)
        .select()
        .single();
      profile = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Update error:', error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 400 }
      );
    }

    if (normalizedCountryCode) {
      await supabase.auth.updateUser({
        data: {
          ...(user.user_metadata || {}),
          country_code: normalizedCountryCode,
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: profile.id,
        displayName: profile.display_name,
        businessName: profile.business_name,
        bio: profile.bio,
        profilePhotoUrl: profile.profile_photo_url,
        website: profile.website,
        instagram: profile.instagram,
        twitter: profile.twitter,
        facebook: profile.facebook,
        phone: profile.phone,
        location: profile.location,
        countryCode: (profile as any).country_code || null,
        timezone: profile.timezone,
      },
    });

  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}

