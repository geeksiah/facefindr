export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { getPhotographerIdCandidates } from '@/lib/profiles/ids';
import { checkFeature } from '@/lib/subscription/enforcement';
import { createClient, createServiceClient } from '@/lib/supabase/server';

function getMissingColumnName(error: any): string | null {
  if (error?.code !== '42703' || typeof error?.message !== 'string') return null;
  const quotedMatch = error.message.match(/column \"([^\"]+)\"/i);
  const bareMatch = error.message.match(/column\s+([a-zA-Z0-9_.]+)/i);
  const rawName = quotedMatch?.[1] || bareMatch?.[1] || null;
  if (!rawName) return null;
  return rawName.includes('.') ? rawName.split('.').pop() || rawName : rawName;
}

async function fetchLiveModeEvent(serviceClient: any, eventId: string) {
  const selectedColumns = ['id', 'name', 'live_mode_enabled', 'photographer_id', 'status'];
  while (selectedColumns.length > 0) {
    const result = await serviceClient
      .from('events')
      .select(selectedColumns.join(', '))
      .eq('id', eventId)
      .maybeSingle();
    if (!result.error) return result.data || null;

    const missing = getMissingColumnName(result.error);
    if (missing && selectedColumns.includes(missing)) {
      const nextColumns = selectedColumns.filter((column) => column !== missing);
      selectedColumns.splice(0, selectedColumns.length, ...nextColumns);
      continue;
    }
    if (result.error?.code === 'PGRST116') return null;
    throw result.error;
  }
  return null;
}

async function updateLiveModeColumn(
  serviceClient: any,
  eventId: string,
  enabled: boolean
): Promise<{ success: boolean; missingColumn: boolean }> {
  const payload: Record<string, unknown> = {
    live_mode_enabled: enabled,
    updated_at: new Date().toISOString(),
  };

  while (Object.keys(payload).length > 0) {
    const { error } = await serviceClient
      .from('events')
      .update(payload)
      .eq('id', eventId);
    if (!error) return { success: true, missingColumn: false };

    const missing = getMissingColumnName(error);
    if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
      delete payload[missing];
      continue;
    }
    throw error;
  }

  return { success: false, missingColumn: true };
}

/**
 * GET - Get current live mode status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params.id;
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);
    const event = await fetchLiveModeEvent(serviceClient, eventId);

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (!photographerIdCandidates.includes(event.photographer_id)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const liveModeSupported = Object.prototype.hasOwnProperty.call(event, 'live_mode_enabled');
    return NextResponse.json({
      eventId: event.id,
      eventName: event.name,
      liveModeEnabled: liveModeSupported ? Boolean(event.live_mode_enabled) : false,
      liveModeSupported,
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
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params.id;
    const body = await request.json();
    const { enabled } = body;
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);

    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }

    const event = await fetchLiveModeEvent(serviceClient, eventId);

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (!photographerIdCandidates.includes(event.photographer_id)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    if (enabled && event.status !== 'active') {
      return NextResponse.json(
        { error: 'Live mode can only be enabled for active events' },
        { status: 400 }
      );
    }

    if (enabled) {
      const canUseLiveMode = await checkFeature(event.photographer_id, 'live_event_mode');
      if (!canUseLiveMode) {
        return NextResponse.json(
          { error: 'Live mode is not available on your current plan. Please upgrade first.' },
          { status: 403 }
        );
      }
    }

    const updateResult = await updateLiveModeColumn(serviceClient, eventId, enabled);
    if (!updateResult.success && updateResult.missingColumn) {
      return NextResponse.json(
        { error: 'Live mode toggle is unavailable in this deployment. Apply latest migrations.' },
        { status: 400 }
      );
    }

    if (!updateResult.success) {
      return NextResponse.json(
        { error: 'Failed to update live mode' },
        { status: 500 }
      );
    }

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
