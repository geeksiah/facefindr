export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// JOIN EVENT BY ACCESS CODE
// ============================================
interface EventSummary {
  id: string;
  name: string;
  status: string;
  attendee_access_enabled?: boolean | null;
}

function buildCodeVariants(code: string): string[] {
  return Array.from(new Set([code, code.toUpperCase(), code.toLowerCase()]));
}

function isMissingRelationError(error: any): boolean {
  return Boolean(error?.code === 'PGRST116' || error?.message?.includes('Results contain 0 rows'));
}

function isActiveEvent(event: EventSummary | null | undefined): event is EventSummary {
  return Boolean(event?.id && event.status === 'active');
}

function hasAttendeeAccess(event: EventSummary): boolean {
  // Backward compatibility for environments where attendee_access_enabled may be null.
  if (typeof event.attendee_access_enabled === 'boolean') {
    return event.attendee_access_enabled;
  }
  return true;
}

async function findEventByAccessToken(serviceClient: any, accessCode: string): Promise<EventSummary | null> {
  const variants = buildCodeVariants(accessCode);

  const { data: tokens, error } = await serviceClient
    .from('event_access_tokens')
    .select(`
      token,
      expires_at,
      revoked_at,
      events (
        id,
        name,
        status,
        attendee_access_enabled
      )
    `)
    .in('token', variants)
    .limit(5);

  if (error || !tokens?.length) {
    return null;
  }

  const now = new Date();
  for (const token of tokens) {
    if (token.revoked_at) continue;
    if (token.expires_at && new Date(token.expires_at) < now) continue;

    const event = token.events as EventSummary | null;
    if (isActiveEvent(event) && hasAttendeeAccess(event)) {
      return event;
    }
  }

  return null;
}

async function findEventByPublicAccessCode(
  serviceClient: any,
  accessCode: string
): Promise<EventSummary | null> {
  const variants = buildCodeVariants(accessCode);

  const { data, error } = await serviceClient
    .from('events')
    .select('id, name, status, attendee_access_enabled, require_access_code, public_access_code')
    .in('public_access_code', variants)
    .eq('status', 'active')
    .eq('require_access_code', true)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  if (!hasAttendeeAccess(data)) {
    return null;
  }

  return data as EventSummary;
}

async function findEventByShareLinkToken(serviceClient: any, accessCode: string): Promise<EventSummary | null> {
  const variants = buildCodeVariants(accessCode);

  const { data: links, error } = await serviceClient
    .from('event_share_links')
    .select(`
      token,
      is_active,
      expires_at,
      max_uses,
      use_count,
      events (
        id,
        name,
        status,
        attendee_access_enabled
      )
    `)
    .in('token', variants)
    .eq('is_active', true)
    .limit(5);

  if (error || !links?.length) {
    return null;
  }

  const now = new Date();
  for (const link of links) {
    if (link.expires_at && new Date(link.expires_at) < now) continue;
    if (link.max_uses && link.use_count >= link.max_uses) continue;

    const event = link.events as EventSummary | null;
    if (isActiveEvent(event) && hasAttendeeAccess(event)) {
      return event;
    }
  }

  return null;
}

async function findEventByIdentifier(
  serviceClient: any,
  identifier: string
): Promise<EventSummary | null> {
  const token = String(identifier || '').trim();
  if (!token) return null;

  const byId = await serviceClient
    .from('events')
    .select('id, name, status, attendee_access_enabled')
    .eq('id', token)
    .eq('status', 'active')
    .maybeSingle();
  if (isActiveEvent(byId.data) && hasAttendeeAccess(byId.data)) {
    return byId.data as EventSummary;
  }

  const variants = buildCodeVariants(token);
  const bySlug = await serviceClient
    .from('events')
    .select('id, name, status, attendee_access_enabled')
    .in('public_slug', variants)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (isActiveEvent(bySlug.data) && hasAttendeeAccess(bySlug.data)) {
    return bySlug.data as EventSummary;
  }

  try {
    const byShortLink = await serviceClient
      .from('events')
      .select('id, name, status, attendee_access_enabled')
      .in('short_link', variants)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (isActiveEvent(byShortLink.data) && hasAttendeeAccess(byShortLink.data)) {
      return byShortLink.data as EventSummary;
    }
  } catch {
    // Legacy environments may not have short_link column.
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rawAccessCode = body?.accessCode;
    const rawEventSlug = body?.eventSlug;
    const rawEventId = body?.eventId;
    const accessCode = typeof rawAccessCode === 'string' ? rawAccessCode.trim() : '';
    const eventSlug = typeof rawEventSlug === 'string' ? rawEventSlug.trim() : '';
    const eventId = typeof rawEventId === 'string' ? rawEventId.trim() : '';

    if (!accessCode && !eventSlug && !eventId) {
      return NextResponse.json(
        { error: 'Access code or event identifier is required' },
        { status: 400 }
      );
    }

    let event: EventSummary | null = null;
    if (accessCode) {
      // Resolve against supported code sources (token links, event access code, share links).
      event =
        (await findEventByAccessToken(serviceClient, accessCode)) ||
        (await findEventByPublicAccessCode(serviceClient, accessCode)) ||
        (await findEventByShareLinkToken(serviceClient, accessCode));
    } else {
      event = await findEventByIdentifier(serviceClient, eventSlug || eventId);
    }

    if (!event) {
      return NextResponse.json({ error: 'Invalid access code' }, { status: 404 });
    }

    if (!hasAttendeeAccess(event)) {
      return NextResponse.json({ error: 'This event is not accepting attendees' }, { status: 403 });
    }

    if (event.status !== 'active') {
      return NextResponse.json({ error: 'This event is no longer active' }, { status: 403 });
    }

    // Create consent record for the attendee
    // Check if consent already exists
    const { data: existingConsent, error: existingConsentError } = await serviceClient
      .from('attendee_consents')
      .select('id')
      .eq('attendee_id', user.id)
      .eq('event_id', event.id)
      .eq('consent_type', 'biometric')
      .is('withdrawn_at', null)
      .maybeSingle();

    if (existingConsentError && !isMissingRelationError(existingConsentError)) {
      console.error('Failed to read existing consent:', existingConsentError);
    }

    if (!existingConsent) {
      // Get request info for consent record
      const ip = request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      const { error: consentError } = await serviceClient
        .from('attendee_consents')
        .insert({
          attendee_id: user.id,
          event_id: event.id,
          consent_type: 'biometric',
          consent_version: '1.0',
          ip_address: ip !== 'unknown' ? ip.split(',')[0].trim() : null,
          user_agent: userAgent,
        });

      if (consentError) {
        console.error('Failed to create consent:', consentError);
        // Don't fail the request, just log the error
      }
    }

    return NextResponse.json({
      success: true,
      event: {
        id: event.id,
        name: event.name,
      },
    });

  } catch (error) {
    console.error('Failed to join event:', error);
    return NextResponse.json(
      { error: 'Failed to join event' },
      { status: 500 }
    );
  }
}

