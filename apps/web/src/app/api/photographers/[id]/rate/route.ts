export const dynamic = 'force-dynamic';

/**
 * Rate Creator API
 * 
 * Create or update a rating for a photographer.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: photographerId } = params;
    const body = await request.json();

    if (photographerId === user.id) {
      return NextResponse.json(
        { error: 'You cannot rate your own profile' },
        { status: 400 }
      );
    }

    // Validate rating
    const rating = parseInt(body.rating);
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    // Check if user is an attendee
    const { data: attendee } = await supabase
      .from('attendees')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!attendee) {
      return NextResponse.json(
        { error: 'Only attendees can rate photographers' },
        { status: 403 }
      );
    }

    const serviceClient = createServiceClient();
    const { data: photographerEvents } = await serviceClient
      .from('events')
      .select('id')
      .eq('photographer_id', photographerId);
    const eventIds = (photographerEvents || []).map((event: any) => event.id);

    // Check if attendee has purchased/downloaded photos from this photographer (for verified rating)
    let purchaseCount = 0;
    if (eventIds.length > 0) {
      const purchaseResult = await supabase
        .from('entitlements')
        .select('id', { count: 'exact', head: true })
        .eq('attendee_id', user.id)
        .in('event_id', eventIds);
      purchaseCount = purchaseResult.count || 0;
    }

    const isVerified = (purchaseCount || 0) > 0;

    // Upsert rating (one rating per attendee per photographer)
    const { data: ratingData, error: ratingError } = await supabase
      .from('photographer_ratings')
      .upsert({
        photographer_id: photographerId,
        attendee_id: user.id,
        event_id: body.eventId || null,
        rating,
        review_text: body.reviewText || null,
        is_verified: isVerified,
        is_public: body.isPublic !== false, // Default to public
      }, {
        onConflict: 'photographer_id,attendee_id',
      })
      .select()
      .single();

    if (ratingError) {
      throw ratingError;
    }

    // Refresh rating stats
    await supabase.rpc('refresh_photographer_rating_stats').catch(() => {});

    await serviceClient.from('audit_logs').insert({
      actor_type: 'attendee',
      actor_id: user.id,
      action: 'photographer_rating_upsert',
      resource_type: 'photographer_rating',
      resource_id: ratingData.id,
      metadata: {
        photographer_id: photographerId,
        rating,
        is_verified: isVerified,
      },
      ip_address:
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        null,
    }).catch(() => {});

    return NextResponse.json({ rating: ratingData });

  } catch (error: any) {
    console.error('Rate photographer error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to submit rating' },
      { status: 500 }
    );
  }
}

