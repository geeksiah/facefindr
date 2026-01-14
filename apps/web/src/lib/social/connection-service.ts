/**
 * Connection Service
 * 
 * Manages photographer <-> attendee connections.
 */

import { createClient } from '@/lib/supabase/server';

interface ConnectionResult {
  success: boolean;
  connection?: any;
  error?: string;
}

/**
 * Add an attendee connection (photographer adds attendee)
 */
export async function addConnection(
  attendeeId: string,
  options?: {
    connectionType?: string;
    sourceEventId?: string;
    notes?: string;
    tags?: string[];
  }
): Promise<ConnectionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify photographer
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!photographer) {
      return { success: false, error: 'Only photographers can add connections' };
    }

    // Verify attendee exists
    const { data: attendee } = await supabase
      .from('attendees')
      .select('id, display_name, face_tag')
      .eq('id', attendeeId)
      .single();

    if (!attendee) {
      return { success: false, error: 'Attendee not found' };
    }

    // Create connection
    const { data, error } = await supabase
      .from('connections')
      .insert({
        photographer_id: user.id,
        attendee_id: attendeeId,
        connection_type: options?.connectionType || 'manual',
        source_event_id: options?.sourceEventId,
        notes: options?.notes,
        tags: options?.tags,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { success: true, connection: { existing: true } };
      }
      throw error;
    }

    return { success: true, connection: data };
  } catch (error) {
    console.error('Add connection error:', error);
    return { success: false, error: 'Failed to add connection' };
  }
}

/**
 * Get photographer's connections
 */
export async function getConnections(
  options?: {
    limit?: number;
    offset?: number;
    tags?: string[];
    search?: string;
  }
): Promise<{ success: boolean; connections?: any[]; total?: number; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    let query = supabase
      .from('connections')
      .select(`
        id,
        connection_type,
        source_event_id,
        notes,
        tags,
        status,
        created_at,
        attendees (
          id, display_name, face_tag, profile_photo_url, email
        ),
        events (
          id, name
        )
      `, { count: 'exact' })
      .eq('photographer_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    // Apply filters
    if (options?.tags && options.tags.length > 0) {
      query = query.contains('tags', options.tags);
    }

    if (options?.search) {
      // This requires a join or RPC for searching attendee fields
      // For now, we'll filter client-side or use a more complex query
    }

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    return { success: true, connections: data || [], total: count || 0 };
  } catch (error) {
    console.error('Get connections error:', error);
    return { success: false, error: 'Failed to get connections' };
  }
}

/**
 * Update connection details
 */
export async function updateConnection(
  connectionId: string,
  updates: {
    notes?: string;
    tags?: string[];
    status?: 'active' | 'blocked';
  }
): Promise<ConnectionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data, error } = await supabase
      .from('connections')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId)
      .eq('photographer_id', user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return { success: true, connection: data };
  } catch (error) {
    console.error('Update connection error:', error);
    return { success: false, error: 'Failed to update connection' };
  }
}

/**
 * Remove connection
 */
export async function removeConnection(connectionId: string): Promise<ConnectionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error } = await supabase
      .from('connections')
      .delete()
      .eq('id', connectionId)
      .eq('photographer_id', user.id);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Remove connection error:', error);
    return { success: false, error: 'Failed to remove connection' };
  }
}

/**
 * Find attendee by FaceTag
 */
export async function findAttendeeByFaceTag(
  faceTag: string
): Promise<{ success: boolean; attendee?: any; error?: string }> {
  try {
    const supabase = await createClient();

    // Normalize face tag
    let tag = faceTag.trim();
    if (!tag.startsWith('@')) {
      tag = '@' + tag;
    }

    const { data, error } = await supabase
      .from('attendees')
      .select('id, display_name, face_tag, profile_photo_url')
      .eq('face_tag', tag)
      .single();

    if (error || !data) {
      return { success: false, error: 'Attendee not found' };
    }

    return { success: true, attendee: data };
  } catch (error) {
    console.error('Find attendee error:', error);
    return { success: false, error: 'Failed to find attendee' };
  }
}

/**
 * Bulk add connections from event attendees
 */
export async function addConnectionsFromEvent(
  eventId: string
): Promise<{ success: boolean; added?: number; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify photographer owns event
    const { data: event } = await supabase
      .from('events')
      .select('id, photographer_id')
      .eq('id', eventId)
      .eq('photographer_id', user.id)
      .single();

    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    // Get attendees who have photos in this event (from face matches)
    const { data: attendeeMatches } = await supabase
      .from('face_embeddings')
      .select('attendee_id')
      .eq('event_id', eventId)
      .not('attendee_id', 'is', null);

    if (!attendeeMatches || attendeeMatches.length === 0) {
      return { success: true, added: 0 };
    }

    // Get unique attendee IDs
    const attendeeIds = [...new Set(attendeeMatches.map(m => m.attendee_id))];

    // Create connections (upsert to avoid duplicates)
    let added = 0;
    for (const attendeeId of attendeeIds) {
      const { error } = await supabase
        .from('connections')
        .upsert({
          photographer_id: user.id,
          attendee_id: attendeeId,
          connection_type: 'event',
          source_event_id: eventId,
        }, { onConflict: 'photographer_id,attendee_id' });

      if (!error) {
        added++;
      }
    }

    return { success: true, added };
  } catch (error) {
    console.error('Add connections from event error:', error);
    return { success: false, error: 'Failed to add connections' };
  }
}
