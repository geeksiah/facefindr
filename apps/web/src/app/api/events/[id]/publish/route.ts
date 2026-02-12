export const dynamic = 'force-dynamic';

/**
 * Event Publish/Unpublish API
 */

import { NextRequest, NextResponse } from 'next/server';

import { generateAccessCode } from '@/lib/sharing/share-service';
import { createClient } from '@/lib/supabase/server';

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

    const { id } = params;

    // Get event and verify ownership
    const { data: event, error: fetchError } = await supabase
      .from('events')
      .select('id, status, public_slug, require_access_code, public_access_code')
      .eq('id', id)
      .eq('photographer_id', user.id)
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
        const { data: slugData, error: slugError } = await supabase.rpc('generate_event_slug', {
          event_name: 'temp', // Will be replaced by actual name query
          event_id: id,
        });
        
        if (!slugError && slugData) {
          updates.public_slug = slugData;
        } else {
          // Fallback: get event name and generate slug
          const { data: eventDetails } = await supabase
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
            const { data: existing } = await supabase
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

    const { error: updateError } = await supabase
      .from('events')
      .update(updates)
      .eq('id', id);

    if (updateError) {
      throw updateError;
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

    const { id } = params;

    // Verify ownership
    const { data: event } = await supabase
      .from('events')
      .select('id, status')
      .eq('id', id)
      .eq('photographer_id', user.id)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (event.status !== 'active') {
      return NextResponse.json({ error: 'Event is not published' }, { status: 400 });
    }

    const { error: updateError } = await supabase
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

