/**
 * Admin Event Settings API
 */

import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import {
  deriveEventStartAtUtc,
  normalizeEventTimezone,
  normalizeIsoDate,
  normalizeUtcTimestamp,
} from '@/lib/event-time';
import { supabaseAdmin } from '@/lib/supabase';

// GET - Get event settings
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canView = (await hasPermission('events.view')) || (await hasPermission('settings.view'));
    if (!canView) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { id } = params;

    const { data: event, error } = await supabaseAdmin
      .from('events')
      .select(`
        *,
        event_pricing (*)
      `)
      .eq('id', id)
      .single();

    if (error || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Merge pricing data
    const pricing = event.event_pricing?.[0];
    const eventWithPricing = {
      ...event,
      pricing_type: pricing?.pricing_type || (pricing?.is_free ? 'free' : 'per_photo'),
      price_per_photo: pricing?.price_per_media || 0,
      bulk_tiers: pricing?.bulk_tiers || [],
      unlock_all_price: pricing?.unlock_all_price || null,
      currency_code: pricing?.currency || event.currency_code || 'USD',
    };

    return NextResponse.json({ event: eventWithPricing });

  } catch (error) {
    console.error('Get event settings error:', error);
    return NextResponse.json(
      { error: 'Failed to get event settings' },
      { status: 500 }
    );
  }
}

// PUT - Update event settings
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canManage =
      (await hasPermission('settings.update')) ||
      (await hasPermission('events.feature')) ||
      (await hasPermission('events.transfer'));
    if (!canManage) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json();

    // Verify event exists
    const { data: event } = await supabaseAdmin
      .from('events')
      .select('id, currency_code, event_date, event_timezone')
      .eq('id', id)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Build update object (only allowed fields)
    const updates: Record<string, any> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.location !== undefined) updates.location = body.location;
    const nextEventDate =
      body.event_date !== undefined
        ? normalizeIsoDate(body.event_date)
        : normalizeIsoDate(event.event_date);
    const nextEventTimezone =
      body.event_timezone !== undefined
        ? normalizeEventTimezone(body.event_timezone)
        : normalizeEventTimezone(event.event_timezone);

    if (body.event_date !== undefined) updates.event_date = nextEventDate;
    if (body.event_timezone !== undefined) updates.event_timezone = nextEventTimezone;
    if (body.event_start_at_utc !== undefined) {
      updates.event_start_at_utc = normalizeUtcTimestamp(body.event_start_at_utc);
    } else if (body.event_date !== undefined || body.event_timezone !== undefined) {
      updates.event_start_at_utc = deriveEventStartAtUtc(nextEventDate);
    }
    if (body.event_end_at_utc !== undefined) {
      updates.event_end_at_utc = normalizeUtcTimestamp(body.event_end_at_utc);
    }
    if (body.end_date !== undefined) updates.end_date = body.end_date;
    if (body.is_public !== undefined) updates.is_public = body.is_public;
    if (body.is_publicly_listed !== undefined) updates.is_publicly_listed = body.is_publicly_listed;
    if (body.allow_anonymous_scan !== undefined) updates.allow_anonymous_scan = body.allow_anonymous_scan;
    if (body.require_access_code !== undefined) updates.require_access_code = body.require_access_code;
    if (body.public_access_code !== undefined) updates.public_access_code = body.public_access_code;
    if (body.face_recognition_enabled !== undefined) updates.face_recognition_enabled = body.face_recognition_enabled;
    if (body.live_mode_enabled !== undefined) updates.live_mode_enabled = body.live_mode_enabled;
    if (body.watermark_enabled !== undefined) updates.watermark_enabled = body.watermark_enabled;
    if (body.status !== undefined) updates.status = body.status;
    if (body.currency_code !== undefined) {
      updates.currency_code = body.currency_code;
      updates.currency = body.currency_code; // Sync both columns
    }

    // Update event
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('events')
        .update(updates)
        .eq('id', id);

      if (updateError) {
        console.error('Update event error:', updateError);
        return NextResponse.json(
          { error: 'Failed to update event' },
          { status: 500 }
        );
      }
    }

    // Handle pricing updates
    if (body.pricing_type !== undefined || body.price_per_photo !== undefined || body.bulk_tiers !== undefined || body.unlock_all_price !== undefined) {
      const pricingUpdates: Record<string, any> = {};

      if (body.pricing_type === 'free') {
        pricingUpdates.is_free = true;
        pricingUpdates.price_per_media = 0;
        pricingUpdates.bulk_tiers = [];
        pricingUpdates.unlock_all_price = null;
      } else {
        pricingUpdates.is_free = false;
        
        if (body.price_per_photo !== undefined) {
          // Convert from dollars to cents if needed
          const priceValue = typeof body.price_per_photo === 'number' ? body.price_per_photo : parseFloat(body.price_per_photo || '0');
          pricingUpdates.price_per_media = priceValue > 1000 ? priceValue : Math.round(priceValue * 100);
        }

        if (body.unlock_all_price !== undefined && body.unlock_all_price !== null) {
          const unlockValue = typeof body.unlock_all_price === 'number' ? body.unlock_all_price : parseFloat(body.unlock_all_price || '0');
          pricingUpdates.unlock_all_price = unlockValue > 1000 ? unlockValue : Math.round(unlockValue * 100);
        } else if (body.unlock_all_price === null) {
          pricingUpdates.unlock_all_price = null;
        }

        if (body.bulk_tiers !== undefined) {
          pricingUpdates.bulk_tiers = body.bulk_tiers;
        }
      }

      if (body.currency_code !== undefined) {
        pricingUpdates.currency = body.currency_code;
      }

      // Upsert pricing
      const { data: existingPricing } = await supabaseAdmin
        .from('event_pricing')
        .select('id')
        .eq('event_id', id)
        .single();

      if (existingPricing) {
        const { error: pricingError } = await supabaseAdmin
          .from('event_pricing')
          .update(pricingUpdates)
          .eq('event_id', id);

        if (pricingError) {
          console.error('Update pricing error:', pricingError);
          return NextResponse.json(
            { error: 'Failed to update pricing' },
            { status: 500 }
          );
        }
      } else {
        const { error: pricingError } = await supabaseAdmin
          .from('event_pricing')
          .insert({
            event_id: id,
            ...pricingUpdates,
          });

        if (pricingError) {
          console.error('Create pricing error:', pricingError);
          return NextResponse.json(
            { error: 'Failed to create pricing' },
            { status: 500 }
          );
        }
      }
    }

    await logAction('event_settings_update', 'event', id, {
      admin_id: session.adminId,
      updated_fields: Object.keys(body || {}),
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Update event settings error:', error);
    return NextResponse.json(
      { error: 'Failed to update event settings' },
      { status: 500 }
    );
  }
}
