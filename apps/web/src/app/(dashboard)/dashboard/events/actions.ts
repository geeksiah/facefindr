'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  checkLimit,
  checkFeature,
  LimitExceededError,
  FeatureNotEnabledError,
} from '@/lib/subscription/enforcement';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  createEventSchema,
  updateEventSchema,
  eventPricingSchema,
  type CreateEventInput,
  type UpdateEventInput,
  type EventPricingInput,
} from '@/lib/validations/event';
import {
  deriveEventStartAtUtc,
  normalizeEventTimezone,
  normalizeIsoDate,
} from '@/lib/events/time';

function isMissingEventStartAtUtcColumnError(error: any) {
  return (
    error?.code === '42703' &&
    typeof error?.message === 'string' &&
    error.message.includes('event_start_at_utc')
  );
}

// ============================================
// CREATE EVENT
// ============================================

export async function createEvent(formData: CreateEventInput) {
  const validated = createEventSchema.safeParse(formData);

  if (!validated.success) {
    return {
      error: validated.error.errors[0]?.message || 'Invalid input',
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  // ENFORCE: Check event limit using the enforcement system
  const eventLimit = await checkLimit(user.id, 'events');
  if (!eventLimit.allowed) {
    return {
      error: eventLimit.message || `You've reached your event limit (${eventLimit.limit} active events). Please upgrade your plan or archive existing events.`,
      code: 'LIMIT_EXCEEDED',
      limitType: 'events',
      current: eventLimit.current,
      limit: eventLimit.limit,
    };
  }

  // ENFORCE: Check if face recognition is enabled for the plan (if user wants it)
  if (validated.data.faceRecognitionEnabled) {
    const canUseFaceRecognition = await checkFeature(user.id, 'face_recognition');
    if (!canUseFaceRecognition) {
      return {
        error: 'Face recognition is not available on your current plan. Please upgrade to enable this feature.',
        code: 'FEATURE_NOT_ENABLED',
        feature: 'face_recognition',
      };
    }
  }

  // ENFORCE: Check if live mode is enabled for the plan (if user wants it)
  if (validated.data.liveModeEnabled) {
    const canUseLiveMode = await checkFeature(user.id, 'live_event_mode');
    if (!canUseLiveMode) {
      return {
        error: 'Live Event Mode is not available on your current plan. Please upgrade to enable this feature.',
        code: 'FEATURE_NOT_ENABLED',
        feature: 'live_event_mode',
      };
    }
  }

  const { data: photographerProfile } = await supabase
    .from('photographers')
    .select('timezone')
    .eq('id', user.id)
    .maybeSingle();

  const eventDate = normalizeIsoDate(validated.data.eventDate || null);
  const eventTimezone = normalizeEventTimezone(
    validated.data.eventTimezone || photographerProfile?.timezone || 'UTC'
  );
  const eventStartAtUtc = deriveEventStartAtUtc(eventDate, eventTimezone);

  const insertPayload: Record<string, any> = {
    photographer_id: user.id,
    name: validated.data.name,
    description: validated.data.description || null,
    location: validated.data.location || null,
    event_date: eventDate,
    event_timezone: eventTimezone,
    event_start_at_utc: eventStartAtUtc,
    is_public: validated.data.isPublic,
    face_recognition_enabled: validated.data.faceRecognitionEnabled,
    live_mode_enabled: validated.data.liveModeEnabled,
    attendee_access_enabled: validated.data.attendeeAccessEnabled,
    status: 'draft',
  };

  // Create the event
  let { data: event, error } = await supabase
    .from('events')
    .insert(insertPayload)
    .select()
    .single();

  if (isMissingEventStartAtUtcColumnError(error)) {
    const legacyPayload = { ...insertPayload };
    delete legacyPayload.event_start_at_utc;

    const legacyInsert = await supabase
      .from('events')
      .insert(legacyPayload)
      .select()
      .single();

    event = legacyInsert.data;
    error = legacyInsert.error;
  }

  if (error) {
    console.error('Error creating event:', error);
    return { error: 'Failed to create event' };
  }

  // Generate public slug immediately (not just when activated)
  if (event) {
    try {
      const { data: slugData, error: slugError } = await supabase.rpc('generate_event_slug', {
        event_name: validated.data.name,
        event_id: event.id,
      });

      if (!slugError && slugData) {
        await supabase
          .from('events')
          .update({ public_slug: slugData })
          .eq('id', event.id);
      } else if (slugError) {
        // Fallback: generate slug manually if RPC fails
        const baseSlug = validated.data.name
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .substring(0, 50);
        
        let finalSlug = baseSlug;
        let counter = 0;
        
        // Check for uniqueness
        while (true) {
          const { data: existing } = await supabase
            .from('events')
            .select('id')
            .eq('public_slug', finalSlug)
            .neq('id', event.id)
            .single();
          
          if (!existing) break;
          
          counter++;
          finalSlug = `${baseSlug}-${counter}`;
        }
        
        await supabase
          .from('events')
          .update({ public_slug: finalSlug })
          .eq('id', event.id);
      }
    } catch (err) {
      console.error('Error generating event slug:', err);
      // Continue without slug - it can be generated later
    }
  }

  // Create default pricing
  await supabase.from('event_pricing').insert({
    event_id: event.id,
    price_per_media: 0,
    unlock_all_price: null,
    currency: validated.data.currency || 'USD',
    is_free: true,
    pricing_type: 'free',
    bulk_tiers: null,
  });

  revalidatePath('/dashboard/events');
  redirect(`/dashboard/events/${event.id}`);
}

// ============================================
// UPDATE EVENT
// ============================================

export async function updateEvent(eventId: string, formData: UpdateEventInput) {
  const validated = updateEventSchema.safeParse(formData);

  if (!validated.success) {
    return {
      error: validated.error.errors[0]?.message || 'Invalid input',
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Verify ownership
  const { data: existingEvent } = await supabase
    .from('events')
    .select('photographer_id, event_timezone')
    .eq('id', eventId)
    .single();

  if (!existingEvent || existingEvent.photographer_id !== user.id) {
    return { error: 'Event not found' };
  }

  const eventDate = normalizeIsoDate(validated.data.eventDate || null);
  const eventTimezone = normalizeEventTimezone(
    validated.data.eventTimezone || existingEvent.event_timezone || 'UTC'
  );
  const eventStartAtUtc = deriveEventStartAtUtc(eventDate, eventTimezone);

  const updates: Record<string, any> = {
    name: validated.data.name,
    description: validated.data.description,
    location: validated.data.location,
    event_date: eventDate,
    event_timezone: eventTimezone,
    event_start_at_utc: eventStartAtUtc,
    is_public: validated.data.isPublic,
    face_recognition_enabled: validated.data.faceRecognitionEnabled,
    live_mode_enabled: validated.data.liveModeEnabled,
    attendee_access_enabled: validated.data.attendeeAccessEnabled,
  };

  // Update the event
  let { error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', eventId);

  if (isMissingEventStartAtUtcColumnError(error)) {
    const legacyUpdates = { ...updates };
    delete legacyUpdates.event_start_at_utc;

    const legacyUpdate = await supabase
      .from('events')
      .update(legacyUpdates)
      .eq('id', eventId);

    error = legacyUpdate.error;
  }

  if (error) {
    console.error('Error updating event:', error);
    return { error: 'Failed to update event' };
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath('/dashboard/events');

  return { success: true };
}

// ============================================
// UPDATE EVENT STATUS
// ============================================

export async function updateEventStatus(
  eventId: string,
  status: 'draft' | 'active' | 'closed' | 'archived'
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Verify ownership
  const { data: existingEvent } = await supabase
    .from('events')
    .select('photographer_id, status, is_public, name, public_slug')
    .eq('id', eventId)
    .single();

  if (!existingEvent || existingEvent.photographer_id !== user.id) {
    return { error: 'Event not found' };
  }

  // Update status
  const { error } = await supabase
    .from('events')
    .update({
      status,
      archived_at: status === 'archived' ? new Date().toISOString() : null,
    })
    .eq('id', eventId);

  if (error) {
    console.error('Error updating event status:', error);
    return { error: 'Failed to update event status' };
  }

  // Notify followers when a public event becomes active.
  if (status === 'active' && existingEvent.is_public) {
    try {
      const service = createServiceClient();
      const [{ data: followers }, { data: creatorProfile }] = await Promise.all([
        service
          .from('follows')
          .select('follower_id')
          .eq('following_id', user.id)
          .in('following_type', ['creator', 'photographer'])
          .eq('status', 'active')
          .eq('notify_new_event', true),
        service
          .from('photographers')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle(),
      ]);

      const followerIds = Array.from(
        new Set((followers || []).map((row: any) => row.follower_id).filter((id: string) => id && id !== user.id))
      );

      if (followerIds.length > 0) {
        const creatorName = creatorProfile?.display_name || 'A creator';
        const eventName = existingEvent.name || 'New Event';
        const eventPath = existingEvent.public_slug
          ? `/e/${existingEvent.public_slug}`
          : `/e/${eventId}`;
        const now = new Date().toISOString();

        await service.from('notifications').insert(
          followerIds.map((followerId) => ({
            user_id: followerId,
            template_code: 'creator_new_public_event',
            channel: 'in_app',
            subject: `${creatorName} published a new event`,
            body: `${creatorName} just published: ${eventName}`,
            status: 'delivered',
            sent_at: now,
            delivered_at: now,
            metadata: {
              type: 'new_public_event',
              creatorId: user.id,
              eventId,
              eventName,
              eventPath,
            },
          }))
        );
      }
    } catch (notifyError) {
      console.error('Failed to notify followers about new public event:', notifyError);
    }
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath('/dashboard/events');
  revalidatePath('/dashboard');

  return { success: true };
}

// ============================================
// UPDATE EVENT PRICING
// ============================================

export async function updateEventPricing(eventId: string, formData: EventPricingInput) {
  const validated = eventPricingSchema.safeParse(formData);

  if (!validated.success) {
    return {
      error: validated.error.errors[0]?.message || 'Invalid input',
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Verify ownership
  const { data: existingEvent } = await supabase
    .from('events')
    .select('photographer_id')
    .eq('id', eventId)
    .single();

  if (!existingEvent || existingEvent.photographer_id !== user.id) {
    return { error: 'Event not found' };
  }

  // Upsert pricing
  const { error } = await supabase.from('event_pricing').upsert({
    event_id: eventId,
    price_per_media: Math.round(validated.data.pricePerMedia * 100), // Convert to cents
    unlock_all_price: validated.data.unlockAllPrice
      ? Math.round(validated.data.unlockAllPrice * 100)
      : null,
    currency: validated.data.currency,
    is_free: validated.data.isFree,
  });

  if (error) {
    console.error('Error updating pricing:', error);
    return { error: 'Failed to update pricing' };
  }

  revalidatePath(`/dashboard/events/${eventId}`);

  return { success: true };
}

// ============================================
// DELETE EVENT
// ============================================

export async function deleteEvent(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Verify ownership
  const { data: existingEvent } = await supabase
    .from('events')
    .select('photographer_id')
    .eq('id', eventId)
    .single();

  if (!existingEvent || existingEvent.photographer_id !== user.id) {
    return { error: 'Event not found' };
  }

  // Delete event (cascade will handle related records)
  const { error } = await supabase.from('events').delete().eq('id', eventId);

  if (error) {
    console.error('Error deleting event:', error);
    return { error: 'Failed to delete event' };
  }

  revalidatePath('/dashboard/events');
  revalidatePath('/dashboard');
  redirect('/dashboard/events');
}

// ============================================
// GENERATE ACCESS TOKEN
// ============================================

export async function generateAccessToken(eventId: string, label?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Verify ownership
  const { data: existingEvent } = await supabase
    .from('events')
    .select('photographer_id')
    .eq('id', eventId)
    .single();

  if (!existingEvent || existingEvent.photographer_id !== user.id) {
    return { error: 'Event not found' };
  }

  // Generate token
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const { data, error } = await supabase
    .from('event_access_tokens')
    .insert({
      event_id: eventId,
      token,
      role: 'attendee',
      label: label || 'Access Link',
    })
    .select()
    .single();

  if (error) {
    console.error('Error generating token:', error);
    return { error: 'Failed to generate access token' };
  }

  revalidatePath(`/dashboard/events/${eventId}`);

  return {
    success: true,
    token: data.token,
    url: `${process.env.NEXT_PUBLIC_APP_URL}/e/${data.token}`,
  };
}
