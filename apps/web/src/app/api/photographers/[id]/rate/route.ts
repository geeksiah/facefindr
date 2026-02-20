export const dynamic = 'force-dynamic';

/**
 * Rate Creator API
 * 
 * Create or update a rating for a photographer.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

function isMissingColumnError(error: any, columnName: string) {
  return error?.code === '42703' && typeof error?.message === 'string' && error.message.includes(columnName);
}

async function resolvePhotographerByIdentifier(supabase: any, identifier: string) {
  const normalizedIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
  const faceTag = normalizedIdentifier.startsWith('@')
    ? normalizedIdentifier
    : `@${normalizedIdentifier}`;

  const withUserId = await supabase
    .from('photographers')
    .select('id, user_id')
    .or(
      `id.eq.${normalizedIdentifier},user_id.eq.${normalizedIdentifier},public_profile_slug.eq.${normalizedIdentifier},face_tag.eq.${faceTag}`
    )
    .limit(1)
    .maybeSingle();

  if (!withUserId.error || !isMissingColumnError(withUserId.error, 'user_id')) {
    return withUserId;
  }

  const fallback = await supabase
    .from('photographers')
    .select('id')
    .or(
      `id.eq.${normalizedIdentifier},public_profile_slug.eq.${normalizedIdentifier},face_tag.eq.${faceTag}`
    )
    .maybeSingle();

  return {
    data: fallback.data ? { ...fallback.data, user_id: fallback.data.id } : fallback.data,
    error: fallback.error,
  };
}

async function resolveAttendeeByUser(supabase: any, userId: string) {
  const byUserId = await supabase
    .from('attendees')
    .select('id, user_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!byUserId.error || !isMissingColumnError(byUserId.error, 'user_id')) {
    return byUserId;
  }

  const fallback = await supabase
    .from('attendees')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  return {
    data: fallback.data ? { ...fallback.data, user_id: fallback.data.id } : fallback.data,
    error: fallback.error,
  };
}

async function getRatingEligibility(
  supabase: any,
  attendeeId: string,
  attendeeUserId: string,
  photographerId: string,
  photographerUserId: string,
  eventId?: string | null
) {
  const [connectionsResult, followsResult, eventsResult] = await Promise.all([
    supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .eq('photographer_id', photographerId)
      .eq('attendee_id', attendeeId)
      .eq('status', 'active'),
    supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', attendeeUserId)
      .eq('following_id', photographerUserId)
      .eq('status', 'active'),
    supabase
      .from('events')
      .select('id')
      .eq('photographer_id', photographerId),
  ]);

  const creatorEventIds = (eventsResult.data || []).map((event: any) => event.id);
  const entitlementQuery = supabase
    .from('entitlements')
    .select('id', { count: 'exact', head: true })
    .eq('attendee_id', attendeeId);

  let entitlementCount = 0;
  if (eventId) {
    const { count } = await entitlementQuery.eq('event_id', eventId);
    entitlementCount = count || 0;
  } else if (creatorEventIds.length > 0) {
    const { count } = await entitlementQuery.in('event_id', creatorEventIds);
    entitlementCount = count || 0;
  }

  const hasConnection = (connectionsResult.count || 0) > 0;
  const hasFollow = (followsResult.count || 0) > 0;
  const hasEntitlement = entitlementCount > 0;

  return {
    hasConnection,
    hasFollow,
    hasEntitlement,
    eligible: hasConnection || hasEntitlement || hasFollow,
    creatorEventIds,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authClient = await createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: photographerIdentifier } = params;
    const body = await request.json();

    const { data: photographer } = await resolvePhotographerByIdentifier(
      serviceClient,
      photographerIdentifier
    );

    if (!photographer) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    const photographerId = photographer.id;
    const photographerUserId = (photographer as any).user_id || photographer.id;
    if (photographerUserId === user.id) {
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
    const { data: attendee } = await resolveAttendeeByUser(serviceClient, user.id);

    if (!attendee) {
      return NextResponse.json(
        { error: 'Only attendees can rate photographers' },
        { status: 403 }
      );
    }

    const attendeeUserId = (attendee as any).user_id || user.id;
    const eventId =
      typeof body.eventId === 'string' && body.eventId.trim().length > 0
        ? body.eventId.trim()
        : null;

    if (eventId) {
      const { data: event } = await serviceClient
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('photographer_id', photographerId)
        .maybeSingle();
      if (!event) {
        return NextResponse.json(
          { error: 'Event does not belong to this creator' },
          { status: 400 }
        );
      }
    }

    const eligibility = await getRatingEligibility(
      serviceClient,
      attendee.id,
      attendeeUserId,
      photographerId,
      photographerUserId,
      eventId
    );

    if (!eligibility.eligible) {
      return NextResponse.json(
        {
          error:
            'You can only rate creators you have followed, connected with, or purchased from.',
        },
        { status: 403 }
      );
    }

    const isVerified = eligibility.hasConnection || eligibility.hasEntitlement;

    // Upsert rating (one rating per attendee per photographer)
    const { data: ratingData, error: ratingError } = await serviceClient
      .from('photographer_ratings')
      .upsert({
        photographer_id: photographerId,
        attendee_id: attendee.id,
        event_id: eventId,
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
    try {
      await serviceClient.rpc('refresh_photographer_rating_stats');
    } catch {
      // Non-blocking stats refresh.
    }

    try {
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
      });
    } catch {
      // Non-blocking audit trail.
    }

    return NextResponse.json({ rating: ratingData });

  } catch (error: any) {
    console.error('Rate photographer error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to submit rating' },
      { status: 500 }
    );
  }
}

