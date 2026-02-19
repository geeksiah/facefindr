export const dynamic = 'force-dynamic';

/**
 * Get My Rating API
 * 
 * Get current user's rating for a photographer
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

function isMissingColumnError(error: any, columnName: string) {
  return error?.code === '42703' && typeof error?.message === 'string' && error.message.includes(columnName);
}

async function resolvePhotographerByIdentifier(supabase: any, identifier: string) {
  const withUserId = await supabase
    .from('photographers')
    .select('id')
    .or(`id.eq.${identifier},user_id.eq.${identifier}`)
    .limit(1)
    .maybeSingle();

  if (!withUserId.error || !isMissingColumnError(withUserId.error, 'user_id')) {
    return withUserId;
  }

  return supabase
    .from('photographers')
    .select('id')
    .eq('id', identifier)
    .maybeSingle();
}

async function resolveAttendeeByUser(supabase: any, userId: string) {
  const byUserId = await supabase
    .from('attendees')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!byUserId.error || !isMissingColumnError(byUserId.error, 'user_id')) {
    return byUserId;
  }

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
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine
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

