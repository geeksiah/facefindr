export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { getStoragePublicUrl } from '@/lib/storage/provider';
import { createClient, createServiceClient } from '@/lib/supabase/server';

function isMissingColumnError(error: any, column?: string): boolean {
  if (error?.code !== '42703') return false;
  if (!column) return true; // Any missing column
  return typeof error?.message === 'string' && error.message.includes(column);
}

function isUuidPrefixSlug(value: string): boolean {
  return /^[0-9a-f]{8}$/i.test(value);
}

function getUuidPrefixBounds(prefix: string) {
  const normalized = prefix.toLowerCase();
  return {
    lower: `${normalized}-0000-0000-0000-000000000000`,
    upper: `${normalized}-ffff-ffff-ffff-ffffffffffff`,
  };
}

function buildTokenVariants(value: string): string[] {
  return Array.from(new Set([value, value.toLowerCase(), value.toUpperCase()]));
}

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
    const previewRequested = searchParams.get('preview') === '1';

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
        location,
        cover_image_url,
        public_slug,
        short_link,
        is_public,
        allow_anonymous_scan,
        require_access_code,
        public_access_code,
        photographer_id,
        status
      `;

    const legacyEventSelect = `
        id,
        name,
        description,
        event_date,
        location,
        cover_image_url,
        public_slug,
        short_link,
        is_public,
        allow_anonymous_scan,
        require_access_code,
        public_access_code,
        photographer_id,
        status
      `;

    const compatibilityEventSelect = `
        id,
        name,
        description,
        event_date,
        location,
        cover_image_url,
        is_public,
        photographer_id,
        status
      `;

    const isUuidPrefix = isUuidPrefixSlug(slug);

    const lookupEventBySlug = async (
      selectClause: string,
      options?: {
        allowPublicSlug?: boolean;
        allowShortLink?: boolean;
        allowUuidPrefix?: boolean;
        allowAccessToken?: boolean;
      }
    ) => {
      const allowPublicSlug = options?.allowPublicSlug ?? true;
      const allowShortLink = options?.allowShortLink ?? true;
      const allowUuidPrefix = options?.allowUuidPrefix ?? true;
      const allowAccessToken = options?.allowAccessToken ?? true;
      let eventBySlug: any = null;
      let slugError: any = null;
      let matchedByAccessToken = false;

      if (isUuid) {
        const uuidResult = await serviceClient
          .from('events')
          .select(selectClause)
          .eq('id', slug)
          .maybeSingle();
        eventBySlug = uuidResult.data;
        slugError = uuidResult.error;
      } else {
        if (allowPublicSlug) {
          const byPublicSlug = await serviceClient
            .from('events')
            .select(selectClause)
            .eq('public_slug', slug)
            .maybeSingle();

          eventBySlug = byPublicSlug.data;
          slugError = byPublicSlug.error;
        }

        if (!eventBySlug && !slugError && allowShortLink) {
          const byShortLink = await serviceClient
            .from('events')
            .select(selectClause)
            .eq('short_link', slug)
            .maybeSingle();
          eventBySlug = byShortLink.data;
          slugError = byShortLink.error;
        }

        if (!eventBySlug && !slugError && (allowPublicSlug || allowShortLink)) {
          const lower = slug.toLowerCase();
          const upper = slug.toUpperCase();
          const variants = Array.from(new Set([slug, lower, upper]));

          if (variants.length > 1 && allowPublicSlug) {
            const byPublicSlugVariants = await serviceClient
              .from('events')
              .select(selectClause)
              .in('public_slug', variants)
              .maybeSingle();

            eventBySlug = byPublicSlugVariants.data;
            slugError = byPublicSlugVariants.error;
          }

          if (variants.length > 1 && !eventBySlug && !slugError && allowShortLink) {
            const byShortLinkVariants = await serviceClient
              .from('events')
              .select(selectClause)
              .in('short_link', variants)
              .maybeSingle();
            eventBySlug = byShortLinkVariants.data;
            slugError = byShortLinkVariants.error;
          }
        }

        if (!eventBySlug && !slugError && allowUuidPrefix && isUuidPrefix) {
          const bounds = getUuidPrefixBounds(slug);
          const byUuidPrefix = await serviceClient
            .from('events')
            .select(selectClause)
            .gte('id', bounds.lower)
            .lte('id', bounds.upper)
            .order('status', { ascending: false })
            .limit(2);

          if (byUuidPrefix.error) {
            slugError = byUuidPrefix.error;
          } else {
            const prefixMatches = byUuidPrefix.data || [];
            eventBySlug =
              prefixMatches.find((candidate: any) => candidate.status === 'active') ||
              prefixMatches[0] ||
              null;
          }
        }

        if (!eventBySlug && !slugError && allowAccessToken) {
          const tokenCandidates = buildTokenVariants(slug);
          const tokenLookup = await serviceClient
            .from('event_access_tokens')
            .select('event_id, expires_at, revoked_at')
            .in('token', tokenCandidates)
            .limit(5);

          if (tokenLookup.error) {
            slugError = tokenLookup.error;
          } else {
            const now = new Date();
            const validToken =
              (tokenLookup.data || []).find((token: any) => {
                if (token.revoked_at) return false;
                if (token.expires_at && new Date(token.expires_at) < now) return false;
                return Boolean(token.event_id);
              }) || null;

            if (validToken?.event_id) {
              const tokenEventResult = await serviceClient
                .from('events')
                .select(selectClause)
                .eq('id', validToken.event_id)
                .maybeSingle();

              eventBySlug = tokenEventResult.data;
              slugError = tokenEventResult.error;
              matchedByAccessToken = Boolean(tokenEventResult.data);
            }
          }
        }
      }

      return { eventBySlug, slugError, matchedByAccessToken };
    };

    let { eventBySlug, slugError, matchedByAccessToken } = await lookupEventBySlug(eventSelect);

    // Backward compatibility: cascade through progressively simpler SELECT clauses
    // when columns are missing (migration not yet applied).
    if (isMissingColumnError(slugError)) {
      const legacyLookup = await lookupEventBySlug(legacyEventSelect);
      eventBySlug = legacyLookup.eventBySlug;
      slugError = legacyLookup.slugError;
      matchedByAccessToken = legacyLookup.matchedByAccessToken;
    }

    if (isMissingColumnError(slugError)) {
      const compatibilityLookup = await lookupEventBySlug(compatibilityEventSelect, {
        allowPublicSlug: false,
        allowShortLink: false,
        allowUuidPrefix: true,
        allowAccessToken: true,
      });
      eventBySlug = compatibilityLookup.eventBySlug;
      slugError = compatibilityLookup.slugError;
      matchedByAccessToken = compatibilityLookup.matchedByAccessToken;
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

    let previewAuthorized = false;
    if (previewRequested) {
      const authClient = createClient();
      const {
        data: { user },
      } = await authClient.auth.getUser();

      if (user?.id) {
        if (user.id === eventBySlug.photographer_id) {
          previewAuthorized = true;
        } else {
          const { data: collaborator } = await serviceClient
            .from('event_collaborators')
            .select('id')
            .eq('event_id', eventBySlug.id)
            .eq('photographer_id', user.id)
            .in('status', ['accepted', 'active'])
            .maybeSingle();
          previewAuthorized = Boolean(collaborator);
        }
      }
    }

    // Check if event is active (required for public access unless preview is authorized)
    if (eventBySlug.status !== 'active' && !previewAuthorized) {
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
    const tokenAuthorized = matchedByAccessToken;
    const eventTimezone = (event as any).event_timezone || 'UTC';
    const isPublicEvent = event.is_public ?? false;
    const requireAccessCode = event.require_access_code ?? false;
    const allowAnonymousScan = event.allow_anonymous_scan ?? true;
    const eventAccessCode = event.public_access_code ?? null;

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
    if (!previewAuthorized && requireAccessCode && !tokenAuthorized) {
      if (!code) {
        // Show access code entry form
        const coverPath = event.cover_image_url?.startsWith('/')
          ? event.cover_image_url.slice(1)
          : event.cover_image_url;
        const coverImageUrl = coverPath?.startsWith('http')
          ? coverPath
          : coverPath
          ? getStoragePublicUrl('covers', coverPath) || getStoragePublicUrl('events', coverPath)
          : null;
        return NextResponse.json(
          {
            error: 'access_code_required',
            event: {
              id: event.id,
              name: event.name,
              require_access_code: requireAccessCode,
              cover_image_url: coverImageUrl,
            },
          },
          { status: 403 }
        );
      }

      // Validate access code
      if (code.toUpperCase() !== eventAccessCode?.toUpperCase()) {
        return NextResponse.json({ error: 'Invalid access code' }, { status: 403 });
      }
    }

    // For private events without code, check if anonymous scan is allowed
    // (This allows face scanning even for private events if photographer enabled it)
    if (!previewAuthorized && !isPublicEvent && !requireAccessCode && !allowAnonymousScan && !tokenAuthorized) {
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
      ? getStoragePublicUrl('covers', coverPath) || getStoragePublicUrl('events', coverPath)
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
        event_timezone: eventTimezone,
        location: event.location,
        cover_image_url: coverImageUrl,
        photo_count: photoCount || 0,
        allow_anonymous_scan: allowAnonymousScan,
        require_access_code: requireAccessCode,
        is_public: isPublicEvent,
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
