export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// JOIN EVENT BY ACCESS CODE
// ============================================

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessCode } = await request.json();

    if (!accessCode || typeof accessCode !== 'string') {
      return NextResponse.json({ error: 'Access code is required' }, { status: 400 });
    }

    // Find the access token
    const { data: token, error: tokenError } = await supabase
      .from('event_access_tokens')
      .select(`
        id,
        event_id,
        role,
        expires_at,
        revoked_at,
        events (
          id,
          name,
          status,
          attendee_access_enabled
        )
      `)
      .eq('token', accessCode.toUpperCase().trim())
      .single();

    if (tokenError || !token) {
      return NextResponse.json({ error: 'Invalid access code' }, { status: 404 });
    }

    // Check if token is revoked
    if (token.revoked_at) {
      return NextResponse.json({ error: 'This access code has been revoked' }, { status: 403 });
    }

    // Check if token is expired
    if (token.expires_at && new Date(token.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This access code has expired' }, { status: 403 });
    }

    // Check if event exists and allows attendee access
    const event = token.events as any;
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (!event.attendee_access_enabled) {
      return NextResponse.json({ error: 'This event is not accepting attendees' }, { status: 403 });
    }

    if (event.status !== 'active') {
      return NextResponse.json({ error: 'This event is no longer active' }, { status: 403 });
    }

    // Create consent record for the attendee
    const serviceClient = createServiceClient();

    // Check if consent already exists
    const { data: existingConsent } = await supabase
      .from('attendee_consents')
      .select('id')
      .eq('attendee_id', user.id)
      .eq('event_id', token.event_id)
      .eq('consent_type', 'biometric')
      .is('withdrawn_at', null)
      .single();

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
          event_id: token.event_id,
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

