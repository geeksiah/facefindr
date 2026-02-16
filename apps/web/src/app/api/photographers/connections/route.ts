export const dynamic = 'force-dynamic';

/**
 * Creator Connections API
 * 
 * Manage photographer-attendee connections for easy tagging.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// POST - Add a connection (attendee by FaceTag)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get photographer profile
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!photographer) {
      return NextResponse.json({ error: 'Not a photographer' }, { status: 403 });
    }

    const body = await request.json();
    const { attendeeFaceTag, attendeeId } = body;

    if (!attendeeFaceTag && !attendeeId) {
      return NextResponse.json(
        { error: 'Either attendeeFaceTag or attendeeId is required' },
        { status: 400 }
      );
    }

    // Find attendee
    let attendeeQuery = supabase
      .from('attendees')
      .select('id, display_name, face_tag');

    if (attendeeId) {
      attendeeQuery = attendeeQuery.eq('id', attendeeId);
    } else {
      // Normalize FaceTag
      const normalizedTag = attendeeFaceTag.startsWith('@')
        ? attendeeFaceTag
        : `@${attendeeFaceTag}`;
      attendeeQuery = attendeeQuery.ilike('face_tag', normalizedTag);
    }

    const { data: attendee, error: attendeeError } = await attendeeQuery.single();

    if (attendeeError || !attendee) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
    }

    // Check if connection already exists
    const { data: existing } = await supabase
      .from('photographer_connections')
      .select('id')
      .eq('photographer_id', photographer.id)
      .eq('attendee_id', attendee.id)
      .single();

    if (existing) {
      return NextResponse.json({
        success: true,
        alreadyExists: true,
        connection: { id: existing.id, attendee },
      });
    }

    // Create connection
    const { data: connection, error: insertError } = await supabase
      .from('photographer_connections')
      .insert({
        photographer_id: photographer.id,
        attendee_id: attendee.id,
        nickname: attendee.display_name,
      })
      .select()
      .single();

    if (insertError) {
      // If table doesn't exist, create it inline (for development)
      if (insertError.code === '42P01') {
        // Table doesn't exist - return success anyway for now
        return NextResponse.json({
          success: true,
          message: 'Connection feature not fully configured',
        });
      }
      throw insertError;
    }

    return NextResponse.json({
      success: true,
      connection: { ...connection, attendee },
    });

  } catch (error) {
    console.error('Add connection error:', error);
    return NextResponse.json({ error: 'Failed to add connection' }, { status: 500 });
  }
}

// GET - List connections
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get photographer profile
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!photographer) {
      return NextResponse.json({ error: 'Not a photographer' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    let query = supabase
      .from('photographer_connections')
      .select(`
        id,
        nickname,
        created_at,
        attendees!photographer_connections_attendee_id_fkey (
          id, display_name, face_tag, profile_photo_url
        )
      `)
      .eq('photographer_id', photographer.id)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`nickname.ilike.%${search}%,attendees.face_tag.ilike.%${search}%`);
    }

    const { data: connections, error } = await query;

    if (error) {
      // If table doesn't exist, return empty array
      if (error.code === '42P01') {
        return NextResponse.json({ connections: [] });
      }
      throw error;
    }

    return NextResponse.json({ connections: connections || [] });

  } catch (error) {
    console.error('Get connections error:', error);
    return NextResponse.json({ error: 'Failed to get connections' }, { status: 500 });
  }
}

// DELETE - Remove a connection
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get photographer profile
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!photographer) {
      return NextResponse.json({ error: 'Not a photographer' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');
    const attendeeId = searchParams.get('attendeeId');

    if (!connectionId && !attendeeId) {
      return NextResponse.json(
        { error: 'Either connectionId or attendeeId is required' },
        { status: 400 }
      );
    }

    let deleteQuery = supabase
      .from('photographer_connections')
      .delete()
      .eq('photographer_id', photographer.id);

    if (connectionId) {
      deleteQuery = deleteQuery.eq('id', connectionId);
    } else {
      deleteQuery = deleteQuery.eq('attendee_id', attendeeId);
    }

    const { error } = await deleteQuery;

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Delete connection error:', error);
    return NextResponse.json({ error: 'Failed to delete connection' }, { status: 500 });
  }
}

