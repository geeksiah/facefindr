export const dynamic = 'force-dynamic';

/**
 * Get My Rating API
 * 
 * Get current user's rating for a photographer
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

async function resolvePhotographerByIdentifier(supabase: any, identifier: string) {
  const normalizedIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
  const faceTag = normalizedIdentifier.startsWith('@')
    ? normalizedIdentifier
    : `@${normalizedIdentifier}`;

  return supabase
    .from('photographers')
    .select('id')
    .or(
      `id.eq.${normalizedIdentifier},public_profile_slug.eq.${normalizedIdentifier},face_tag.eq.${faceTag}`
    )
    .limit(1)
    .maybeSingle();
}

async function resolveAttendeeByUser(supabase: any, userId: string) {
  return supabase
    .from('attendees')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ rating: null });
    }

    const { id: photographerIdentifier } = params;

    const { data: photographer } = await resolvePhotographerByIdentifier(
      serviceClient,
      photographerIdentifier
    );

    if (!photographer) {
      return NextResponse.json({ rating: null });
    }

    // Check if user is an attendee
    const { data: attendee } = await resolveAttendeeByUser(serviceClient, user.id);

    if (!attendee) {
      return NextResponse.json({ rating: null });
    }

    // Get user's rating
    const { data: rating, error } = await serviceClient
      .from('photographer_ratings')
      .select('rating, review_text, created_at')
      .eq('photographer_id', photographer.id)
      .eq('attendee_id', attendee.id)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return NextResponse.json({
      rating: rating?.rating || null,
      reviewText: rating?.review_text || null,
      createdAt: rating?.created_at || null,
    });

  } catch (error: any) {
    console.error('Get my rating error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to get rating' },
      { status: 500 }
    );
  }
}

