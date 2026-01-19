/**
 * Event Settings API
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// GET - Get event settings
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    const { data: event, error } = await supabase
      .from('events')
      .select(`
        *,
        event_pricing (*)
      `)
      .eq('id', id)
      .eq('photographer_id', user.id)
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
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();

    // Verify ownership and get current currency
    const { data: event } = await supabase
      .from('events')
      .select('id, currency_code')
      .eq('id', id)
      .eq('photographer_id', user.id)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Build update object (only allowed fields)
    const updates: Record<string, any> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.location !== undefined) updates.location = body.location;
    if (body.event_date !== undefined) updates.event_date = body.event_date;
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

      const { data: existingPricing } = await supabase
        .from('event_pricing')
        .select('id')
        .eq('event_id', id)
        .single();

      // Build pricing data
      const pricingData: Record<string, any> = {
        event_id: id,
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
        const { error: pricingError } = await supabase
          .from('event_pricing')
          .update(pricingData)
          .eq('event_id', id);

        if (pricingError) {
          throw pricingError;
        }
      } else {
        const { error: pricingError } = await supabase
          .from('event_pricing')
          .insert(pricingData);

        if (pricingError) {
          throw pricingError;
        }
      }

      // Prevent currency change if transactions exist (to avoid accounting issues)
      if (body.currency_code !== undefined && body.currency_code !== (event.currency_code || 'USD')) {
        const { count: transactionCount } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', id)
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

    const { error: updateError } = await supabase
      .from('events')
      .update(updates)
      .eq('id', id);

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
