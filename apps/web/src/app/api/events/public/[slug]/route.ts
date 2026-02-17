export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';

// GET - Get public event by slug
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const rawSlug = params.slug || '';
    const slug = (() => {
      try {
        return decodeURIComponent(rawSlug).trim();
      } catch {
        return rawSlug.trim();
      }
    })();
    if (!slug) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    // Use service client to bypass RLS completely - we'll validate access manually
    const serviceClient = createServiceClient();

    // Get event by public_slug, short_link, or id
    // First, try to find the event regardless of status to provide better error messages
    
    // Check if slug is a UUID (for direct ID lookup)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    
    const eventSelect = `
        id,
        name,
        description,
        event_date,
        event_start_at_utc,
        event_timezone,
        location,
        cover_image_url,
        public_slug,
        short_link,
        is_public,
        is_publicly_listed,
        allow_anonymous_scan,
        require_access_code,
        public_access_code,
        photographer_id,
        status
      `;

    let eventBySlug: any = null;
    let slugError: any = null;

    if (isUuid) {
      const uuidResult = await serviceClient
        .from('events')
        .select(eventSelect)
        .eq('id', slug)
        .maybeSingle();
      eventBySlug = uuidResult.data;
      slugError = uuidResult.error;
    } else {
      const byPublicSlug = await serviceClient
        .from('events')
        .select(eventSelect)
        .eq('public_slug', slug)
        .maybeSingle();

      eventBySlug = byPublicSlug.data;
      slugError = byPublicSlug.error;

      if (!eventBySlug && !slugError) {
        const byShortLink = await serviceClient
          .from('events')
          .select(eventSelect)
          .eq('short_link', slug)
          .maybeSingle();
        eventBySlug = byShortLink.data;
        slugError = byShortLink.error;
      }

      if (!eventBySlug && !slugError) {
        const lower = slug.toLowerCase();
        const upper = slug.toUpperCase();
        const variants = Array.from(new Set([slug, lower, upper]));

        if (variants.length > 1) {
          const byPublicSlugVariants = await serviceClient
            .from('events')
            .select(eventSelect)
            .in('public_slug', variants)
            .maybeSingle();

          eventBySlug = byPublicSlugVariants.data;
          slugError = byPublicSlugVariants.error;

          if (!eventBySlug && !slugError) {
            const byShortLinkVariants = await serviceClient
              .from('events')
              .select(eventSelect)
              .in('short_link', variants)
              .maybeSingle();
            eventBySlug = byShortLinkVariants.data;
            slugError = byShortLinkVariants.error;
          }
        }
      }
    }

    // If event doesn't exist, return 404
    if (slugError) {
      console.error('Event query error:', slug, slugError);
      return NextResponse.json({ error: 'Failed to load event' }, { status: 500 });
    }
    
    if (!eventBySlug) {
      console.error('Event not found by slug:', slug);
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check if event is active (required for public access)
    if (eventBySlug.status !== 'active') {
      return NextResponse.json(
        { 
          error: 'Event not active',
          message: eventBySlug.status === 'draft' 
            ? 'This event has not been published yet. It must be activated before it can be accessed.'
            : `This event is ${eventBySlug.status} and cannot be accessed.`
        },
        { status: 403 }
      );
    }

    const event = eventBySlug;

    // Now get photographer details (using service client for consistency)
    const { data: photographer } = await serviceClient
      .from('photographers')
      .select('id, display_name, profile_photo_url, bio')
      .eq('id', event.photographer_id)
      .single();
    
    // Get all collaborators for this event (for multi-photographer events)
    const { data: collaborators } = await serviceClient
      .from('event_collaborators')
      .select(`
        photographer_id,
        role,
        photographers:photographer_id (
          id,
          display_name,
          profile_photo_url,
          bio
        )
      `)
      .eq('event_id', event.id)
      .eq('status', 'accepted');
    
    // Build all photographers list (owner + collaborators)
    const allCreators = [
      photographer,
      ...(collaborators || [])
        .map((c: any) => c.photographers)
        .filter((p: any) => p && p.id !== event.photographer_id)
    ].filter(Boolean);

    // ACCESS LOGIC (Product Design Perspective):
    // 1. If event requires access code, validate it
    // 2. If event is private (is_public = false) and no code provided, deny access
    // 3. If event is public OR has valid code OR allows anonymous scan, grant access
    
    // Check access code if required
    if (event.require_access_code) {
      if (!code) {
        // Show access code entry form
        const coverPath = event.cover_image_url?.startsWith('/')
          ? event.cover_image_url.slice(1)
          : event.cover_image_url;
        const coverImageUrl = coverPath?.startsWith('http')
          ? coverPath
          : coverPath
          ? serviceClient.storage.from('covers').getPublicUrl(coverPath).data.publicUrl
          : null;
        return NextResponse.json(
          {
            error: 'access_code_required',
            event: {
              id: event.id,
              name: event.name,
              require_access_code: true,
              cover_image_url: coverImageUrl,
            },
          },
          { status: 403 }
        );
      }

      // Validate access code
      if (code.toUpperCase() !== event.public_access_code?.toUpperCase()) {
        return NextResponse.json({ error: 'Invalid access code' }, { status: 403 });
      }
    }

    // For private events without code, check if anonymous scan is allowed
    // (This allows face scanning even for private events if photographer enabled it)
    if (!event.is_public && !event.require_access_code && !event.allow_anonymous_scan) {
      return NextResponse.json(
        { error: 'Event is private', message: 'This event is not publicly accessible.' },
        { status: 403 }
      );
    }

    // Get photo count only (photos are NOT returned - only visible after face scan)
    const { count: photoCount } = await serviceClient
      .from('media')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .is('deleted_at', null);

    const coverPath = event.cover_image_url?.startsWith('/')
      ? event.cover_image_url.slice(1)
      : event.cover_image_url;
    const coverImageUrl = coverPath?.startsWith('http')
      ? coverPath
      : coverPath
      ? serviceClient.storage.from('covers').getPublicUrl(coverPath).data.publicUrl
      : null;

    // NOTE: Photos are NOT returned in the public event response.
    // Attendees can only see photos after using the face scanner.
    // This ensures privacy - Attendee A cannot see Attendee B's photos.

    return NextResponse.json({
      event: {
        id: event.id,
        name: event.name,
        description: event.description,
        date: event.event_date,
        event_date: event.event_date,
        event_start_at_utc: event.event_start_at_utc || null,
        event_timezone: event.event_timezone || 'UTC',
        location: event.location,
        cover_image_url: coverImageUrl,
        photo_count: photoCount || 0,
        allow_anonymous_scan: event.allow_anonymous_scan,
        require_access_code: event.require_access_code,
        is_public: event.is_public,
        // Primary photographer
        photographer: photographer,
        // All photographers (for multi-photographer events)
        all_photographers: allCreators.length > 1 ? allCreators : undefined,
      },
      // No photos returned - only visible after face scan
      photos: [],
    });
  } catch (error) {
    console.error('Get public event error:', error);
    return NextResponse.json({ error: 'Failed to load event' }, { status: 500 });
  }
}

