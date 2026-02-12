export const dynamic = 'force-dynamic';

/**
 * Photographer Profile API
 * 
 * Get and update photographer profile information.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// GET - Get photographer profile
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error } = await supabase
      .from('photographers')
      .select('*')
      .eq('id', user.id)
      .single();

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
      timezone,
    } = body;

    // Update profile
    const { data: profile, error } = await supabase
      .from('photographers')
      .update({
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
      })
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Update error:', error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 400 }
      );
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

