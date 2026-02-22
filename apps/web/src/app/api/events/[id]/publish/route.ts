export const dynamic = 'force-dynamic';

/**
 * Event Publish/Unpublish API
 */

import { NextRequest, NextResponse } from 'next/server';

import { dispatchInAppNotification } from '@/lib/notifications/dispatcher';
import { getPhotographerIdCandidates, resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { generateAccessCode } from '@/lib/sharing/share-service';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// POST - Publish event (draft -> active)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const serviceClient = createServiceClient();

    const { id } = params;
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);
    const { data: creatorProfile } = await resolvePhotographerProfileByUser(serviceClient, user.id, user.email);
    if (!photographerIdCandidates.length) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    // Get event and verify ownership
    const { data: event, error: fetchError } = await serviceClient
      .from('events')
      .select('id, name, status, is_public, photographer_id, public_slug, require_access_code, public_access_code')
      .eq('id', id)
      .in('photographer_id', photographerIdCandidates)
      .single();

    if (fetchError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (event.status === 'active') {
      return NextResponse.json({ error: 'Event is already published' }, { status: 400 });
    }

    // Generate public slug if not set (required for sharing/access)
    const updates: Record<string, any> = {
      status: 'active',
    };

    if (!event.public_slug) {
      // Try using the database function first
      try {
        const { data: slugData, error: slugError } = await serviceClient.rpc('generate_event_slug', {
          event_name: 'temp', // Will be replaced by actual name query
          event_id: id,
        });
        
        if (!slugError && slugData) {
          updates.public_slug = slugData;
        } else {
          // Fallback: get event name and generate slug
          const { data: eventDetails } = await serviceClient
            .from('events')
            .select('name')
            .eq('id', id)
            .single();
          
          const eventName = eventDetails?.name || 'event';
          const baseSlug = eventName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 50);
          
          let finalSlug = baseSlug || id.split('-')[0];
          let counter = 0;
          
          // Ensure uniqueness
          while (true) {
            const { data: existing } = await serviceClient
              .from('events')
              .select('id')
              .eq('public_slug', finalSlug)
              .neq('id', id)
              .single();
            
            if (!existing) break;
            
            counter++;
            finalSlug = `${baseSlug || id.split('-')[0]}-${counter}`;
          }
          
          updates.public_slug = finalSlug;
        }
      } catch (err) {
        // Fallback to simple ID-based slug
        console.error('Error generating slug:', err);
        updates.public_slug = id.split('-')[0];
      }
    }

    // Generate access code if required but not set
    if (event.require_access_code && !event.public_access_code) {
      updates.public_access_code = generateAccessCode();
    }

    const { error: updateError } = await serviceClient
      .from('events')
      .update(updates)
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    if (event.is_public) {
      try {
        const creatorUserId = (creatorProfile as any)?.user_id || user.id;
        const [{ data: followers }, { data: profile }] = await Promise.all([
          serviceClient
            .from('follows')
            .select('follower_id')
            .eq('following_id', creatorUserId)
            .in('following_type', ['creator', 'photographer'])
            .eq('status', 'active')
            .eq('notify_new_event', true),
          serviceClient
            .from('photographers')
            .select('display_name')
            .eq('id', event.photographer_id)
            .maybeSingle(),
        ]);

        const followerIds: string[] = Array.from(
          new Set((followers || []).map((row: any) => row.follower_id).filter((id: string) => id && id !== creatorUserId))
        ) as string[];

        if (followerIds.length > 0) {
          const creatorName = profile?.display_name || 'A creator';
          const eventPath = updates.public_slug ? `/e/${updates.public_slug}` : `/e/${id}`;
          await Promise.all(
            followerIds.map((followerId: string) =>
              dispatchInAppNotification({
                supabase: serviceClient,
                recipientUserId: followerId,
                templateCode: 'creator_new_public_event',
                subject: `${creatorName} published a new event`,
                body: `${creatorName} just published: ${event.name || 'New Event'}`,
                dedupeKey: `creator_new_public_event:${id}:${followerId}`,
                actionUrl: eventPath,
                actorUserId: creatorUserId,
                details: {
                  creatorId: creatorUserId,
                  eventId: id,
                  eventName: event.name || 'New Event',
                  eventPath,
                },
                metadata: {
                  type: 'new_public_event',
                  creatorId: creatorUserId,
                  eventId: id,
                  eventName: event.name || 'New Event',
                  eventPath,
                },
              })
            )
          );
        }
      } catch (notifyError) {
        console.error('Publish follower notify error:', notifyError);
      }
    }

    return NextResponse.json({ success: true, status: 'active' });

  } catch (error) {
    console.error('Publish event error:', error);
    return NextResponse.json(
      { error: 'Failed to publish event' },
      { status: 500 }
    );
  }
}

// DELETE - Unpublish event (active -> draft)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const serviceClient = createServiceClient();

    const { id } = params;
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);
    if (!photographerIdCandidates.length) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    // Verify ownership
    const { data: event } = await serviceClient
      .from('events')
      .select('id, status')
      .eq('id', id)
      .in('photographer_id', photographerIdCandidates)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (event.status !== 'active') {
      return NextResponse.json({ error: 'Event is not published' }, { status: 400 });
    }

    const { error: updateError } = await serviceClient
      .from('events')
      .update({ status: 'draft' })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true, status: 'draft' });

  } catch (error) {
    console.error('Unpublish event error:', error);
    return NextResponse.json(
      { error: 'Failed to unpublish event' },
      { status: 500 }
    );
  }
}

