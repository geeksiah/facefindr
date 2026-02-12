export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// LIVE EVENT MODE API
// SRS §6.5: Toggle live mode for real-time notifications
// ============================================

/**
 * GET - Get current live mode status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params.id;

    // Get event with live mode status
    const serviceClient = createServiceClient();
    const { data: event, error } = await serviceClient
      .from('events')
      .select('id, name, live_mode_enabled, photographer_id')
      .eq('id', eventId)
      .single();

    if (error || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Verify ownership
    if (event.photographer_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    return NextResponse.json({
      eventId: event.id,
      eventName: event.name,
      liveModeEnabled: event.live_mode_enabled || false,
    });

  } catch (error) {
    console.error('Get live mode error:', error);
    return NextResponse.json(
      { error: 'Failed to get live mode status' },
      { status: 500 }
    );
  }
}

/**
 * POST - Toggle live mode on/off
 */
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

    const eventId = params.id;
    const body = await request.json();
    const { enabled } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    // Get event and verify ownership
    const { data: event, error: fetchError } = await serviceClient
      .from('events')
      .select('id, photographer_id, status')
      .eq('id', eventId)
      .single();

    if (fetchError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (event.photographer_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Only allow live mode for active events
    if (enabled && event.status !== 'active') {
      return NextResponse.json({ 
        error: 'Live mode can only be enabled for active events' 
      }, { status: 400 });
    }

    // Update live mode
    const { error: updateError } = await serviceClient
      .from('events')
      .update({ 
        live_mode_enabled: enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    if (updateError) {
      console.error('Update live mode error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update live mode' },
        { status: 500 }
      );
    }

    // Log the action
    await serviceClient
      .from('audit_logs')
      .insert({
        actor_type: 'photographer',
        actor_id: user.id,
        action: enabled ? 'live_mode_enabled' : 'live_mode_disabled',
        resource_type: 'event',
        resource_id: eventId,
      });

    return NextResponse.json({
      success: true,
      eventId,
      liveModeEnabled: enabled,
      message: enabled 
        ? 'Live mode enabled - attendees will receive notifications within 5 minutes'
        : 'Live mode disabled - standard notification timing restored',
    });

  } catch (error) {
    console.error('Toggle live mode error:', error);
    return NextResponse.json(
      { error: 'Failed to toggle live mode' },
      { status: 500 }
    );
  }
}

