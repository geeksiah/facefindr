export const dynamic = 'force-dynamic';

/**
 * Creator Connections API
 * 
 * Manage photographer-attendee connections for easy tagging.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

async function resolveCreatorId(userId: string, userEmail?: string) {
  const serviceClient = createServiceClient();

  // Try direct ID match (most common case: photographer.id === auth user.id)
  const byIdResult = await serviceClient
    .from('photographers')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (byIdResult.data?.id) {
    return byIdResult.data.id as string;
  }

  // Try email lookup as final fallback
  if (userEmail) {
    const byEmailResult = await serviceClient
      .from('photographers')
      .select('id')
      .eq('email', userEmail)
      .maybeSingle();

    if (byEmailResult.data?.id) {
      return byEmailResult.data.id as string;
    }
  }

  return null;
}

// POST - Add a connection (attendee by FaceTag)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const creatorId = await resolveCreatorId(user.id, user.email);
    if (!creatorId) {
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

    let attendee: any = null;
    let attendeeError: any = null;
    if (attendeeId) {
      const byIdentifier = await supabase
        .from('attendees')
        .select('id, display_name, face_tag')
        .eq('id', attendeeId)
        .maybeSingle();

      attendee = byIdentifier.data;
      attendeeError = byIdentifier.error;
    } else {
      // Normalize FaceTag
      const trimmedTag = String(attendeeFaceTag || '').trim();
      const normalizedTag = trimmedTag.startsWith('@')
        ? trimmedTag
        : `@${trimmedTag}`;
      const byFaceTag = await attendeeQuery
        .or(`face_tag.ilike.${normalizedTag},face_tag.ilike.${normalizedTag.replace(/\./g, '')}`)
        .maybeSingle();
      attendee = byFaceTag.data;
      attendeeError = byFaceTag.error;
    }

    if (attendeeError || !attendee) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
    }

    // Check if connection already exists
    const { data: existing } = await supabase
      .from('photographer_connections')
      .select('id')
      .eq('photographer_id', creatorId)
      .eq('attendee_id', attendee.id)
      .maybeSingle();

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
        photographer_id: creatorId,
        attendee_id: attendee.id,
        nickname: attendee.display_name,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '42P01') {
        return NextResponse.json(
          { error: 'Connections feature is not configured', failClosed: true },
          { status: 503 }
        );
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

    const creatorId = await resolveCreatorId(user.id, user.email);
    if (!creatorId) {
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
      .eq('photographer_id', creatorId)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`nickname.ilike.%${search}%,attendees.face_tag.ilike.%${search}%`);
    }

    const { data: connections, error } = await query;

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json(
          { error: 'Connections feature is not configured', failClosed: true },
          { status: 503 }
        );
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

    const creatorId = await resolveCreatorId(user.id, user.email);
    if (!creatorId) {
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
      .eq('photographer_id', creatorId);

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
