export const dynamic = 'force-dynamic';

/**
 * Event Settings API
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  deriveEventStartAtUtc,
  normalizeEventTimezone,
  normalizeIsoDate,
  normalizeUtcTimestamp,
} from '@/lib/events/time';
import { getPhotographerIdCandidates } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function getEventAccess(supabase: any, eventId: string, photographerIds: string[]) {
  if (!photographerIds.length) {
    return {
      canView: false,
      canEdit: false,
    };
  }

  const { data: ownedEvent } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .in('photographer_id', photographerIds)
    .maybeSingle();

  if (ownedEvent) {
    return {
      canView: true,
      canEdit: true,
    };
  }

  const { data: collaboratorAccess } = await supabase
    .from('event_collaborators')
    .select('can_edit_event, can_manage_pricing, status')
    .eq('event_id', eventId)
    .in('photographer_id', photographerIds)
    .eq('status', 'active')
    .maybeSingle();

  if (!collaboratorAccess) {
    return {
      canView: false,
      canEdit: false,
    };
  }

  return {
    canView: true,
    canEdit: Boolean(collaboratorAccess.can_edit_event || collaboratorAccess.can_manage_pricing),
  };
}

function getMissingColumnName(error: any): string | null {
  if (error?.code !== '42703' || typeof error?.message !== 'string') return null;
  const quotedMatch = error.message.match(/column \"([^\"]+)\"/i);
  const bareMatch = error.message.match(/column\s+([a-zA-Z0-9_.]+)/i);
  const rawName = quotedMatch?.[1] || bareMatch?.[1] || null;
  if (!rawName) return null;
  return rawName.includes('.') ? rawName.split('.').pop() || rawName : rawName;
}

async function resolveEventIdByIdentifier(supabase: any, identifier: string) {
  const byId = await supabase
    .from('events')
    .select('id')
    .eq('id', identifier)
    .maybeSingle();
  if (byId.data?.id) return byId.data.id as string;

  const bySlug = await supabase
    .from('events')
    .select('id')
    .eq('public_slug', identifier)
    .maybeSingle();
  if (bySlug.data?.id) return bySlug.data.id as string;

  return identifier;
}

// GET - Get event settings
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const eventId = await resolveEventIdByIdentifier(serviceClient, id);
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);
    const access = await getEventAccess(serviceClient, eventId, photographerIdCandidates);
    if (!access.canView) {
      return NextResponse.json({ error: 'Not authorized to manage this event' }, { status: 403 });
    }

    const { data: event, error } = await serviceClient
      .from('events')
      .select(`
        *,
        event_pricing (*)
      `)
      .eq('id', eventId)
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
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const eventId = await resolveEventIdByIdentifier(serviceClient, id);
    const body = await request.json();
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);

    const access = await getEventAccess(serviceClient, eventId, photographerIdCandidates);
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Not authorized to manage this event' }, { status: 403 });
    }

    // Verify event and get current currency
    const eventSelectColumns = ['id', 'currency_code', 'event_date'];
    let eventResult: any = null;
    const selectedColumns = [...eventSelectColumns];

    while (selectedColumns.length > 0) {
      const result = await serviceClient
        .from('events')
        .select(selectedColumns.join(', '))
        .eq('id', eventId)
        .single();

      if (!result.error) {
        eventResult = result;
        break;
      }

      const missingColumn = getMissingColumnName(result.error);
      if (missingColumn && selectedColumns.includes(missingColumn)) {
        const idx = selectedColumns.indexOf(missingColumn);
        selectedColumns.splice(idx, 1);
        continue;
      }

      if (result.error?.code === 'PGRST116') {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }

      throw result.error;
    }

    const event = {
      id: eventResult?.data?.id || eventId,
      currency_code: (eventResult?.data as any)?.currency_code || 'USD',
      event_date: (eventResult?.data as any)?.event_date || null,
    } as any;
    if (!event.id) {
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
        : normalizeEventTimezone(null);

    if (body.event_date !== undefined) updates.event_date = nextEventDate;
    if (body.event_start_at_utc !== undefined) {
      updates.event_start_at_utc = normalizeUtcTimestamp(body.event_start_at_utc);
    } else if (body.event_date !== undefined || body.event_timezone !== undefined) {
      updates.event_start_at_utc = deriveEventStartAtUtc(nextEventDate, nextEventTimezone);
    }
    if (body.event_end_at_utc !== undefined) {
      updates.event_end_at_utc = normalizeUtcTimestamp(body.event_end_at_utc);
    }
    if (body.end_date !== undefined) updates.end_date = body.end_date;
    if (body.is_public !== undefined) updates.is_public = body.is_public;
    if (body.is_publicly_listed !== undefined) updates.is_publicly_listed = body.is_publicly_listed;
    if (body.include_in_public_profile !== undefined) updates.include_in_public_profile = body.include_in_public_profile;
    if (body.allow_anonymous_scan !== undefined) updates.allow_anonymous_scan = body.allow_anonymous_scan;
    if (body.require_access_code !== undefined) updates.require_access_code = body.require_access_code;
    if (body.public_access_code !== undefined) updates.public_access_code = body.public_access_code;
    if (body.face_recognition_enabled !== undefined) updates.face_recognition_enabled = body.face_recognition_enabled;
    if (body.live_mode_enabled !== undefined) updates.live_mode_enabled = body.live_mode_enabled;
    if (body.watermark_enabled !== undefined) updates.watermark_enabled = body.watermark_enabled;
    if (body.currency_code !== undefined) updates.currency_code = body.currency_code;

    // Update or create event_pricing record
    if (body.pricing_type !== undefined || body.price_per_photo !== undefined || body.bulk_tiers !== undefined || body.currency_code !== undefined) {
      // Validate bulk tiers if provided
      if (body.pricing_type === 'bulk' && body.bulk_tiers) {
        const { validateBulkTiers } = await import('@/lib/payments/fee-calculator');
        const validation = validateBulkTiers(body.bulk_tiers);
        if (!validation.valid) {
          return NextResponse.json(
            { error: validation.error || 'Invalid bulk pricing tiers' },
            { status: 400 }
          );
        }
      }

      const { data: existingPricing } = await serviceClient
        .from('event_pricing')
        .select('id')
        .eq('event_id', eventId)
        .single();

      // Build pricing data
      const pricingData: Record<string, any> = {
        event_id: eventId,
        is_free: body.pricing_type === 'free',
        pricing_type: body.pricing_type || 'per_photo',
        price_per_media: body.price_per_photo || 0,
        bulk_tiers: body.bulk_tiers || null,
        currency: body.currency_code || 'USD',
      };

      // Handle unlock_all_price based on pricing type
      if (body.pricing_type === 'per_photo') {
        // Only set unlock_all_price if provided and valid
        if (body.unlock_all_price !== undefined) {
          // Convert from dollars to cents if needed
          const unlockPrice = typeof body.unlock_all_price === 'number' && body.unlock_all_price > 1000
            ? body.unlock_all_price  // Already in cents
            : Math.round((body.unlock_all_price || 0) * 100);  // Convert from dollars to cents
          pricingData.unlock_all_price = unlockPrice > 0 ? unlockPrice : null;
        }
      } else {
        // Clear unlock_all_price for free and bulk pricing
        pricingData.unlock_all_price = null;
      }

      if (existingPricing) {
        const pricingUpdatePayload = { ...pricingData };
        let pricingError: any = null;
        for (let attempt = 0; attempt < 8; attempt++) {
          const result = await serviceClient
            .from('event_pricing')
            .update(pricingUpdatePayload)
            .eq('event_id', eventId);
          pricingError = result.error;
          if (!pricingError) break;

          const missingColumn = getMissingColumnName(pricingError);
          if (!missingColumn || !(missingColumn in pricingUpdatePayload)) {
            break;
          }

          delete pricingUpdatePayload[missingColumn];
          if (!Object.keys(pricingUpdatePayload).length) {
            break;
          }
        }

        if (pricingError) throw pricingError;
      } else {
        const pricingInsertPayload = { ...pricingData };
        let pricingError: any = null;
        for (let attempt = 0; attempt < 8; attempt++) {
          const result = await serviceClient
            .from('event_pricing')
            .insert(pricingInsertPayload);
          pricingError = result.error;
          if (!pricingError) break;

          const missingColumn = getMissingColumnName(pricingError);
          if (!missingColumn || !(missingColumn in pricingInsertPayload)) {
            break;
          }

          delete pricingInsertPayload[missingColumn];
          if (!Object.keys(pricingInsertPayload).length) {
            break;
          }
        }

        if (pricingError) throw pricingError;
      }

      // Prevent currency change if transactions exist (to avoid accounting issues)
      if (body.currency_code !== undefined && body.currency_code !== (event.currency_code || 'USD')) {
        const { count: transactionCount } = await serviceClient
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .in('status', ['pending', 'succeeded']);

        if (transactionCount && transactionCount > 0) {
          return NextResponse.json(
            { error: 'Cannot change event currency after transactions have been made. This ensures accurate accounting and prevents data inconsistencies.' },
            { status: 400 }
          );
        }
        updates.currency_code = body.currency_code;
      }
    }

    const runEventUpdate = (payload: Record<string, any>) =>
      serviceClient
        .from('events')
        .update(payload)
        .eq('id', eventId);

    let updateError: any = null;
    const updatePayload = { ...updates };
    if (Object.keys(updatePayload).length > 0) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const attemptResult = await runEventUpdate(updatePayload);
        updateError = attemptResult.error;
        if (!updateError) break;

        const missingColumn = getMissingColumnName(updateError);
        if (!missingColumn || !(missingColumn in updatePayload)) {
          break;
        }

        delete updatePayload[missingColumn];
        if (Object.keys(updatePayload).length === 0) {
          updateError = null;
          break;
        }
      }
    }

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Update event settings error:', error);
    const errorMessage = error?.message || error?.error || 'Failed to update event settings';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

