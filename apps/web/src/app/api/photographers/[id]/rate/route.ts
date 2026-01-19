/**
 * Rate Photographer API
 * 
 * Create or update a rating for a photographer.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

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

    // Check if attendee has purchased/downloaded photos from this photographer (for verified rating)
    const { count: purchaseCount } = await supabase
      .from('entitlements')
      .select('id', { count: 'exact', head: true })
      .eq('attendee_id', user.id)
      .in('media_id', 
        supabase
          .from('media')
          .select('id')
          .in('event_id',
            supabase
              .from('events')
              .select('id')
              .eq('photographer_id', photographerId)
          )
      );

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

    return NextResponse.json({ rating: ratingData });

  } catch (error: any) {
    console.error('Rate photographer error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to submit rating' },
      { status: 500 }
    );
  }
}
