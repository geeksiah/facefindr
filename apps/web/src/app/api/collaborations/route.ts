export const dynamic = 'force-dynamic';

/**
 * Collaborations API
 * 
 * Get all events a photographer is collaborating on, including pending invitations.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getPhotographerIdCandidates } from '@/lib/profiles/ids';
import { checkLimit } from '@/lib/subscription/enforcement';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// GET - List all collaborations for the current photographer
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // 'pending', 'active', or null for all
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);
    if (!photographerIdCandidates.length) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    // Build query
    let query = serviceClient
      .from('event_collaborators')
      .select(`
        id,
        role,
        status,
        can_upload,
        can_view_all_photos,
        can_edit_event,
        can_view_analytics,
        can_view_revenue,
        revenue_share_percent,
        invited_at,
        accepted_at,
        events (
          id,
          name,
          event_date,
          location,
          status,
          cover_image_url,
          photographer_id,
          photographers (
            id,
            display_name,
            face_tag,
            profile_photo_url
          )
        )
      `)
      .in('photographer_id', photographerIdCandidates)
      .neq('role', 'owner'); // Exclude events they own

    if (status) {
      query = query.eq('status', status);
    } else {
      query = query.in('status', ['pending', 'active']);
    }

    const { data: collaborations, error } = await query.order('invited_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Separate pending and active
    const pending = collaborations?.filter((c) => c.status === 'pending') || [];
    const active = collaborations?.filter((c) => c.status === 'active') || [];

    return NextResponse.json({
      collaborations: collaborations || [],
      pending,
      active,
      pendingCount: pending.length,
      activeCount: active.length,
    });

  } catch (error) {
    console.error('Get collaborations error:', error);
    return NextResponse.json({ error: 'Failed to get collaborations' }, { status: 500 });
  }
}

// PATCH - Accept or decline an invitation
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { collaborationId, action } = body;
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);
    if (!photographerIdCandidates.length) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    if (!collaborationId || !['accept', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Verify this is the user's invitation
    const { data: collaboration } = await serviceClient
      .from('event_collaborators')
      .select('id, event_id, photographer_id, status, events(photographer_id)')
      .eq('id', collaborationId)
      .in('photographer_id', photographerIdCandidates)
      .eq('status', 'pending')
      .single();

    if (!collaboration) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (action === 'accept') {
      const ownerId = (collaboration as any)?.events?.photographer_id as string | undefined;
      if (ownerId) {
        const teamLimit = await checkLimit(ownerId, 'team_members');
        if (!teamLimit.allowed) {
          return NextResponse.json(
            {
              error: teamLimit.message || `Team member limit reached (${teamLimit.limit}).`,
              code: 'LIMIT_EXCEEDED',
              limitType: 'team_members',
              current: teamLimit.current,
              limit: teamLimit.limit,
            },
            { status: 403 }
          );
        }
      }
    }

    // Update status
    const { error } = await serviceClient
      .from('event_collaborators')
      .update({
        status: action === 'accept' ? 'active' : 'declined',
        accepted_at: action === 'accept' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', collaborationId);

    if (error) {
      const rawMessage = `${error.message || ''}`.toLowerCase();
      if (rawMessage.includes('limit_exceeded') || rawMessage.includes('team member limit')) {
        return NextResponse.json(
          {
            error: error.message || 'Team member limit reached for this creator plan.',
            code: 'LIMIT_EXCEEDED',
            limitType: 'team_members',
          },
          { status: 403 }
        );
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      status: action === 'accept' ? 'active' : 'declined',
    });

  } catch (error) {
    console.error('Update collaboration error:', error);
    return NextResponse.json({ error: 'Failed to update collaboration' }, { status: 500 });
  }
}

