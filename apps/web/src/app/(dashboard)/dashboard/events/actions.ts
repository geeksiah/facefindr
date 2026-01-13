'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import {
  createEventSchema,
  updateEventSchema,
  eventPricingSchema,
  type CreateEventInput,
  type UpdateEventInput,
  type EventPricingInput,
} from '@/lib/validations/event';

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

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Check subscription limits
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan_code')
    .eq('photographer_id', user.id)
    .single();

  const { count: eventCount } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('photographer_id', user.id)
    .in('status', ['draft', 'active']);

  const planLimits: Record<string, number> = {
    free: 2,
    starter: 5,
    pro: 20,
    studio: 9999,
  };

  const limit = planLimits[subscription?.plan_code || 'free'] || 2;

  if ((eventCount || 0) >= limit) {
    return {
      error: `You've reached your event limit (${limit}). Please upgrade your plan.`,
    };
  }

  // Create the event
  const { data: event, error } = await supabase
    .from('events')
    .insert({
      photographer_id: user.id,
      name: validated.data.name,
      description: validated.data.description || null,
      location: validated.data.location || null,
      event_date: validated.data.eventDate || null,
      is_public: validated.data.isPublic,
      face_recognition_enabled: validated.data.faceRecognitionEnabled,
      live_mode_enabled: validated.data.liveModeEnabled,
      attendee_access_enabled: validated.data.attendeeAccessEnabled,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating event:', error);
    return { error: 'Failed to create event' };
  }

  // Create default pricing
  await supabase.from('event_pricing').insert({
    event_id: event.id,
    price_per_media: 0,
    unlock_all_price: null,
    currency: 'USD',
    is_free: true,
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

  const supabase = createClient();
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

  // Update the event
  const { error } = await supabase
    .from('events')
    .update({
      name: validated.data.name,
      description: validated.data.description,
      location: validated.data.location,
      event_date: validated.data.eventDate,
      is_public: validated.data.isPublic,
      face_recognition_enabled: validated.data.faceRecognitionEnabled,
      live_mode_enabled: validated.data.liveModeEnabled,
      attendee_access_enabled: validated.data.attendeeAccessEnabled,
    })
    .eq('id', eventId);

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
  const supabase = createClient();
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

  const supabase = createClient();
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
  const supabase = createClient();
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
  const supabase = createClient();
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
