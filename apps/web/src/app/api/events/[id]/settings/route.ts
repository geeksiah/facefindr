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
import { checkFeature } from '@/lib/subscription/enforcement';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function getEventAccess(supabase: any, eventId: string, photographerIds: string[]) {
  if (!photographerIds.length) {
    return {
      canView: false,
      canEditEvent: false,
      canManagePricing: false,
      eventOwnerId: null as string | null,
    };
  }

  const { data: ownedEvent } = await supabase
    .from('events')
    .select('id, photographer_id')
    .eq('id', eventId)
    .in('photographer_id', photographerIds)
    .maybeSingle();

  if (ownedEvent) {
    return {
      canView: true,
      canEditEvent: true,
      canManagePricing: true,
      eventOwnerId: ownedEvent.photographer_id as string,
    };
  }

  const { data: event } = await supabase
    .from('events')
    .select('photographer_id')
    .eq('id', eventId)
    .maybeSingle();

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
      canEditEvent: false,
      canManagePricing: false,
      eventOwnerId: event?.photographer_id || null,
    };
  }

  return {
    canView: true,
    canEditEvent: Boolean(collaboratorAccess.can_edit_event),
    canManagePricing: Boolean(collaboratorAccess.can_manage_pricing),
    eventOwnerId: event?.photographer_id || null,
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

function getEmbeddedEventPricing(event: any) {
  const embedded = event?.event_pricing;
  if (Array.isArray(embedded)) {
    if (embedded.length === 0) return null;
    if (embedded.length === 1) return embedded[0];
    return [...embedded].sort((a: any, b: any) => {
      const aTs = Date.parse(String(a?.updated_at || a?.created_at || ''));
      const bTs = Date.parse(String(b?.updated_at || b?.created_at || ''));
      return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
    })[0];
  }
  if (embedded && typeof embedded === 'object') return embedded;
  return null;
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
    const pricing = getEmbeddedEventPricing(event);
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
    if (!access.canEditEvent && !access.canManagePricing) {
      return NextResponse.json({ error: 'Not authorized to manage this event' }, { status: 403 });
    }

    // Verify event and get current currency
    const eventSelectColumns = ['id', 'photographer_id', 'currency_code', 'currency', 'event_date', 'event_timezone'];
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
      photographer_id: (eventResult?.data as any)?.photographer_id || access.eventOwnerId || null,
      currency_code: (eventResult?.data as any)?.currency_code || 'USD',
      currency: (eventResult?.data as any)?.currency || 'USD',
      event_date: (eventResult?.data as any)?.event_date || null,
      event_timezone: (eventResult?.data as any)?.event_timezone || 'UTC',
    } as any;
    if (!event.id) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Build update object (only allowed fields)
    const updates: Record<string, any> = {};
    let pricingTouched = false;
    const canEditEvent = access.canEditEvent;
    const canManagePricing = access.canManagePricing || access.canEditEvent;
    const eventEditableFields = [
      'name',
      'description',
      'location',
      'event_date',
      'event_start_at_utc',
      'event_end_at_utc',
      'event_timezone',
      'end_date',
      'is_public',
      'is_publicly_listed',
      'include_in_public_profile',
      'allow_anonymous_scan',
      'require_access_code',
      'public_access_code',
      'face_recognition_enabled',
      'live_mode_enabled',
      'watermark_enabled',
    ];
    const requestedPricingFields = [
      'pricing_type',
      'price_per_photo',
      'bulk_tiers',
      'unlock_all_price',
      'currency_code',
    ];
    const requestedEventFieldInput = eventEditableFields.some((field) => body[field] !== undefined);
    const requestedPricingFieldChange = requestedPricingFields.some((field) => body[field] !== undefined);

    if (requestedPricingFieldChange && !canManagePricing) {
      return NextResponse.json(
        { error: 'Not authorized to manage event pricing.' },
        { status: 403 }
      );
    }
    if (requestedEventFieldInput && !canEditEvent && !requestedPricingFieldChange) {
      return NextResponse.json(
        { error: 'Not authorized to edit event details. Ask the event owner for edit permission.' },
        { status: 403 }
      );
    }

    if (canEditEvent && body.name !== undefined) updates.name = body.name;
    if (canEditEvent && body.description !== undefined) updates.description = body.description;
    if (canEditEvent && body.location !== undefined) updates.location = body.location;
    const nextEventDate =
      body.event_date !== undefined
        ? normalizeIsoDate(body.event_date)
        : normalizeIsoDate(event.event_date);
    const nextEventTimezone =
      body.event_timezone !== undefined
        ? normalizeEventTimezone(body.event_timezone)
        : normalizeEventTimezone(event.event_timezone);

    if (canEditEvent && body.event_date !== undefined) updates.event_date = nextEventDate;
    if (canEditEvent && body.event_start_at_utc !== undefined) {
      updates.event_start_at_utc = normalizeUtcTimestamp(body.event_start_at_utc);
    } else if (canEditEvent && (body.event_date !== undefined || body.event_timezone !== undefined)) {
      updates.event_start_at_utc = deriveEventStartAtUtc(nextEventDate, nextEventTimezone);
    }
    if (canEditEvent && body.event_end_at_utc !== undefined) {
      updates.event_end_at_utc = normalizeUtcTimestamp(body.event_end_at_utc);
    }
    if (canEditEvent && body.event_timezone !== undefined) updates.event_timezone = nextEventTimezone;
    if (canEditEvent && body.end_date !== undefined) updates.end_date = normalizeIsoDate(body.end_date);
    if (canEditEvent && body.is_public !== undefined) updates.is_public = body.is_public;
    if (canEditEvent && body.is_publicly_listed !== undefined) updates.is_publicly_listed = body.is_publicly_listed;
    if (canEditEvent && body.include_in_public_profile !== undefined) updates.include_in_public_profile = body.include_in_public_profile;
    if (canEditEvent && body.allow_anonymous_scan !== undefined) updates.allow_anonymous_scan = body.allow_anonymous_scan;
    if (canEditEvent && body.require_access_code !== undefined) updates.require_access_code = body.require_access_code;
    if (canEditEvent && body.public_access_code !== undefined) updates.public_access_code = body.public_access_code;
    if (canEditEvent && body.face_recognition_enabled !== undefined) updates.face_recognition_enabled = body.face_recognition_enabled;
    if (canEditEvent && body.live_mode_enabled !== undefined) updates.live_mode_enabled = body.live_mode_enabled;
    if (canEditEvent && body.watermark_enabled !== undefined) updates.watermark_enabled = body.watermark_enabled;
    if ((canEditEvent || canManagePricing) && body.currency_code !== undefined) updates.currency_code = body.currency_code;

    // Update or create event_pricing record
    if (
      (
        body.pricing_type !== undefined ||
        body.price_per_photo !== undefined ||
        body.bulk_tiers !== undefined ||
        body.unlock_all_price !== undefined ||
        body.currency_code !== undefined
      ) &&
      canManagePricing
    ) {
      pricingTouched = true;

      const currentCurrency = String(event.currency_code || event.currency || 'USD').toUpperCase();
      const requestedCurrency = String(body.currency_code || currentCurrency).toUpperCase();
      if (body.currency_code !== undefined && requestedCurrency !== currentCurrency) {
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
        updates.currency_code = requestedCurrency;
        updates.currency = requestedCurrency;
      }

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
        .select('id, pricing_type, is_free, price_per_media, bulk_tiers, currency, unlock_all_price')
        .eq('event_id', eventId)
        .maybeSingle();

      // Build pricing data
      const resolvedPricingType = body.pricing_type || existingPricing?.pricing_type || 'per_photo';
      const resolvedCurrency = body.currency_code || existingPricing?.currency || event.currency_code || event.currency || 'USD';
      const pricingData: Record<string, any> = {
        event_id: eventId,
        is_free:
          resolvedPricingType === 'free' ||
          (body.pricing_type === undefined && existingPricing?.is_free === true),
        pricing_type: resolvedPricingType,
        price_per_media:
          body.price_per_photo !== undefined
            ? body.price_per_photo
            : existingPricing?.price_per_media || 0,
        bulk_tiers:
          body.bulk_tiers !== undefined ? body.bulk_tiers : existingPricing?.bulk_tiers || null,
        currency: resolvedCurrency,
      };

      // Handle unlock_all_price based on pricing type
      if (resolvedPricingType === 'per_photo') {
        // Only set unlock_all_price if provided and valid
        if (body.unlock_all_price !== undefined) {
          const unlockPrice =
            typeof body.unlock_all_price === 'number'
              ? Math.round(body.unlock_all_price)
              : Number.parseInt(String(body.unlock_all_price || '0'), 10);
          pricingData.unlock_all_price = unlockPrice > 0 ? unlockPrice : null;
        } else if (existingPricing?.unlock_all_price !== undefined) {
          pricingData.unlock_all_price = existingPricing.unlock_all_price;
        }
      } else {
        // Clear unlock_all_price for free and bulk pricing
        pricingData.unlock_all_price = null;
      }

      if (existingPricing?.id) {
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
    }

    if (canEditEvent && body.face_recognition_enabled === true && event.photographer_id) {
      const canUseFaceRecognition = await checkFeature(event.photographer_id, 'face_recognition');
      if (!canUseFaceRecognition) {
        return NextResponse.json(
          { error: 'Face recognition is not available on this plan. Please upgrade first.' },
          { status: 403 }
        );
      }
    }

    if (canEditEvent && body.live_mode_enabled === true && event.photographer_id) {
      const canUseLiveMode = await checkFeature(event.photographer_id, 'live_event_mode');
      if (!canUseLiveMode) {
        return NextResponse.json(
          { error: 'Live mode is not available on this plan. Please upgrade first.' },
          { status: 403 }
        );
      }
    }

    if (canEditEvent && body.watermark_enabled === true && event.photographer_id) {
      const canUseCustomWatermark = await checkFeature(event.photographer_id, 'custom_watermark');
      if (!canUseCustomWatermark) {
        return NextResponse.json(
          { error: 'Custom watermark is not available on this plan. Please upgrade first.' },
          { status: 403 }
        );
      }
    }

    const requestedEventUpdateKeys = Object.keys(updates);
    const runEventUpdate = (payload: Record<string, any>) =>
      serviceClient
        .from('events')
        .update(payload)
        .eq('id', eventId)
        .select('id')
        .maybeSingle();

    let updateError: any = null;
    const updatePayload = { ...updates };
    if (Object.keys(updatePayload).length > 0) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const attemptResult = await runEventUpdate(updatePayload);
        updateError = attemptResult.error;
        if (!updateError) {
          if (!attemptResult.data?.id) {
            updateError = { message: 'Event not found' };
          } else {
            break;
          }
        }

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
    if (requestedEventUpdateKeys.length > 0 && Object.keys(updatePayload).length === 0 && !pricingTouched) {
      return NextResponse.json(
        { error: 'No compatible event setting columns are available in this environment. Please run latest migrations.' },
        { status: 400 }
      );
    }

    const { data: refreshedEvent } = await serviceClient
      .from('events')
      .select(`
        *,
        event_pricing (*)
      `)
      .eq('id', eventId)
      .maybeSingle();

    const refreshedPricing = getEmbeddedEventPricing(refreshedEvent);
    const eventWithPricing = refreshedEvent
      ? {
          ...refreshedEvent,
          pricing_type:
            refreshedPricing?.pricing_type || (refreshedPricing?.is_free ? 'free' : 'per_photo'),
          price_per_photo: refreshedPricing?.price_per_media || 0,
          bulk_tiers: refreshedPricing?.bulk_tiers || [],
          unlock_all_price: refreshedPricing?.unlock_all_price || null,
          currency_code:
            refreshedPricing?.currency ||
            (refreshedEvent as any).currency_code ||
            (refreshedEvent as any).currency ||
            'USD',
        }
      : null;

    return NextResponse.json({ success: true, event: eventWithPricing });

  } catch (error: any) {
    console.error('Update event settings error:', error);
    const errorMessage = error?.message || error?.error || 'Failed to update event settings';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

