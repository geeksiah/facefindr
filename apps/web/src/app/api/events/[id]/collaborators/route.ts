export const dynamic = 'force-dynamic';

/**
 * Event Collaborators API
 * 
 * Manage photographers who can work on an event.
 */

import { NextRequest, NextResponse } from 'next/server';

import { checkLimit } from '@/lib/subscription/enforcement';
import { createClient, createServiceClient } from '@/lib/supabase/server';

interface RouteParams {
  params: { id: string };
}

// GET - List collaborators for an event
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params.id;

    // Check if user is a collaborator on this event
    const { data: myAccess } = await supabase
      .from('event_collaborators')
      .select('role, can_invite_collaborators')
      .eq('event_id', eventId)
      .eq('photographer_id', user.id)
      .eq('status', 'active')
      .single();

    if (!myAccess) {
      return NextResponse.json({ error: 'Not authorized to view this event' }, { status: 403 });
    }

    // Get all collaborators
    const { data: collaborators, error } = await supabase
      .from('event_collaborators')
      .select(`
        id,
        photographer_id,
        role,
        status,
        can_upload,
        can_edit_own_photos,
        can_delete_own_photos,
        can_view_all_photos,
        can_edit_event,
        can_manage_pricing,
        can_invite_collaborators,
        can_view_analytics,
        can_view_revenue,
        revenue_share_percent,
        invited_at,
        accepted_at,
        notes,
        photographers (
          id,
          display_name,
          face_tag,
          profile_photo_url,
          email
        )
      `)
      .eq('event_id', eventId)
      .order('role', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    // Get photo counts per collaborator
    const serviceClient = createServiceClient();
    const { data: photoCounts } = await serviceClient
      .from('media')
      .select('uploader_id')
      .eq('event_id', eventId);

    const photoCountMap = new Map<string, number>();
    photoCounts?.forEach((p) => {
      const count = photoCountMap.get(p.uploader_id) || 0;
      photoCountMap.set(p.uploader_id, count + 1);
    });

    const collaboratorsWithCounts = collaborators?.map((c) => ({
      ...c,
      photo_count: photoCountMap.get(c.photographer_id) || 0,
    }));

    return NextResponse.json({
      collaborators: collaboratorsWithCounts || [],
      myRole: myAccess.role,
      canInvite: myAccess.can_invite_collaborators || myAccess.role === 'owner',
    });

  } catch (error) {
    console.error('Get collaborators error:', error);
    return NextResponse.json({ error: 'Failed to get collaborators' }, { status: 500 });
  }
}

// POST - Invite a collaborator
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params.id;
    const body = await request.json();
    const { photographerId, photographerFaceTag, role = 'collaborator', permissions = {}, revenueSharePercent = 100 } = body;

    // Check if user can invite collaborators
    const { data: myAccess } = await supabase
      .from('event_collaborators')
      .select('role, can_invite_collaborators')
      .eq('event_id', eventId)
      .eq('photographer_id', user.id)
      .eq('status', 'active')
      .single();

    if (!myAccess || (!myAccess.can_invite_collaborators && myAccess.role !== 'owner')) {
      return NextResponse.json({ error: 'Not authorized to invite collaborators' }, { status: 403 });
    }

    // Check team member limit based on plan
    const { data: event } = await supabase
      .from('events')
      .select('id, name, photographer_id')
      .eq('id', eventId)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // ENFORCE: Check team member limit using the enforcement system
    const teamLimit = await checkLimit(event.photographer_id, 'team_members');
    if (!teamLimit.allowed) {
      return NextResponse.json({
        error: 'LIMIT_EXCEEDED',
        message: teamLimit.message || `Team member limit reached (${teamLimit.limit}). Upgrade to add more team members.`,
        code: 'LIMIT_EXCEEDED',
        limitType: 'team_members',
        current: teamLimit.current,
        limit: teamLimit.limit,
      }, { status: 403 });
    }

    // Find photographer by ID or FaceTag
    let targetCreatorId = photographerId;
    if (!targetCreatorId && photographerFaceTag) {
      const { data: photographer } = await supabase
        .from('photographers')
        .select('id')
        .ilike('face_tag', photographerFaceTag.startsWith('@') ? photographerFaceTag : `@${photographerFaceTag}`)
        .single();

      if (!photographer) {
        return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
      }
      targetCreatorId = photographer.id;
    }

    if (!targetCreatorId) {
      return NextResponse.json({ error: 'Creator ID or FaceTag required' }, { status: 400 });
    }

    // Check if already a collaborator
    const { data: existing } = await supabase
      .from('event_collaborators')
      .select('id, status')
      .eq('event_id', eventId)
      .eq('photographer_id', targetCreatorId)
      .single();

    if (existing) {
      if (existing.status === 'active') {
        return NextResponse.json({ error: 'Already a collaborator' }, { status: 400 });
      }
      if (existing.status === 'pending') {
        return NextResponse.json({ error: 'Invitation already pending' }, { status: 400 });
      }
    }

    // Create or update collaborator invitation
    const collaboratorData = {
      event_id: eventId,
      photographer_id: targetCreatorId,
      role: role === 'owner' ? 'collaborator' : role, // Can't invite as owner
      can_upload: permissions.canUpload ?? true,
      can_edit_own_photos: permissions.canEditOwnPhotos ?? true,
      can_delete_own_photos: permissions.canDeleteOwnPhotos ?? true,
      can_view_all_photos: permissions.canViewAllPhotos ?? true,
      can_edit_event: permissions.canEditEvent ?? false,
      can_manage_pricing: permissions.canManagePricing ?? false,
      can_invite_collaborators: permissions.canInviteCollaborators ?? false,
      can_view_analytics: permissions.canViewAnalytics ?? false,
      can_view_revenue: permissions.canViewRevenue ?? false,
      revenue_share_percent: revenueSharePercent,
      status: 'pending',
      invited_by: user.id,
      invited_at: new Date().toISOString(),
    };

    const { data: collaborator, error } = await supabase
      .from('event_collaborators')
      .upsert(collaboratorData, { onConflict: 'event_id,photographer_id' })
      .select(`
        *,
        photographers (id, display_name, face_tag, profile_photo_url)
      `)
      .single();

    if (error) {
      throw error;
    }

    // Send in-app notification to invited photographer.
    try {
      const inviterName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'A creator';
      const serviceClient = createServiceClient();

      await serviceClient
        .from('notifications')
        .insert({
          user_id: targetCreatorId,
          template_code: 'event_collaboration_invite',
          channel: 'in_app',
          subject: `Invitation: ${event.name}`,
          body: `${inviterName} invited you to collaborate on "${event.name}".`,
          variables: {
            eventId,
            eventName: event.name,
            role: collaborator.role,
            inviterId: user.id,
            inviterName,
          },
          status: 'sent',
          sent_at: new Date().toISOString(),
          metadata: {
            type: 'event_collaboration_invite',
            eventId,
            collaboratorId: collaborator.id,
            inviterId: user.id,
            role: collaborator.role,
            links: {
              collaborations: '/dashboard/collaborations',
              event: `/dashboard/events/${eventId}`,
            },
          },
        })
        .throwOnError();
    } catch (notificationError) {
      console.error('Failed to create collaboration notification:', notificationError);
    }

    return NextResponse.json({
      success: true,
      collaborator,
    });

  } catch (error) {
    console.error('Invite collaborator error:', error);
    return NextResponse.json({ error: 'Failed to invite collaborator' }, { status: 500 });
  }
}

// PATCH - Update collaborator permissions or accept/decline invitation
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params.id;
    const body = await request.json();
    const { collaboratorId, action, permissions, revenueSharePercent, role } = body;

    // Handle accept/decline actions
    if (action === 'accept' || action === 'decline') {
      const { data: invitation } = await supabase
        .from('event_collaborators')
        .select('id, photographer_id, status')
        .eq('event_id', eventId)
        .eq('photographer_id', user.id)
        .eq('status', 'pending')
        .single();

      if (!invitation) {
        return NextResponse.json({ error: 'No pending invitation found' }, { status: 404 });
      }

      const { error } = await supabase
        .from('event_collaborators')
        .update({
          status: action === 'accept' ? 'active' : 'declined',
          accepted_at: action === 'accept' ? new Date().toISOString() : null,
        })
        .eq('id', invitation.id);

      if (error) {
        throw error;
      }

      return NextResponse.json({ success: true, status: action === 'accept' ? 'active' : 'declined' });
    }

    // For other updates, check if user can manage collaborators
    const { data: myAccess } = await supabase
      .from('event_collaborators')
      .select('role, can_invite_collaborators')
      .eq('event_id', eventId)
      .eq('photographer_id', user.id)
      .eq('status', 'active')
      .single();

    if (!myAccess || (myAccess.role !== 'owner' && !myAccess.can_invite_collaborators)) {
      return NextResponse.json({ error: 'Not authorized to manage collaborators' }, { status: 403 });
    }

    // Get the collaborator being updated
    const { data: collaborator } = await supabase
      .from('event_collaborators')
      .select('id, role, photographer_id')
      .eq('id', collaboratorId)
      .eq('event_id', eventId)
      .single();

    if (!collaborator) {
      return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 });
    }

    // Can't modify owner
    if (collaborator.role === 'owner') {
      return NextResponse.json({ error: 'Cannot modify event owner' }, { status: 403 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    
    if (permissions) {
      if (typeof permissions.canUpload === 'boolean') updateData.can_upload = permissions.canUpload;
      if (typeof permissions.canEditOwnPhotos === 'boolean') updateData.can_edit_own_photos = permissions.canEditOwnPhotos;
      if (typeof permissions.canDeleteOwnPhotos === 'boolean') updateData.can_delete_own_photos = permissions.canDeleteOwnPhotos;
      if (typeof permissions.canViewAllPhotos === 'boolean') updateData.can_view_all_photos = permissions.canViewAllPhotos;
      if (typeof permissions.canEditEvent === 'boolean') updateData.can_edit_event = permissions.canEditEvent;
      if (typeof permissions.canManagePricing === 'boolean') updateData.can_manage_pricing = permissions.canManagePricing;
      if (typeof permissions.canInviteCollaborators === 'boolean') updateData.can_invite_collaborators = permissions.canInviteCollaborators;
      if (typeof permissions.canViewAnalytics === 'boolean') updateData.can_view_analytics = permissions.canViewAnalytics;
      if (typeof permissions.canViewRevenue === 'boolean') updateData.can_view_revenue = permissions.canViewRevenue;
    }

    if (typeof revenueSharePercent === 'number') {
      updateData.revenue_share_percent = Math.min(100, Math.max(0, revenueSharePercent));
    }

    if (role && role !== 'owner') {
      updateData.role = role;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    updateData.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('event_collaborators')
      .update(updateData)
      .eq('id', collaboratorId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Update collaborator error:', error);
    return NextResponse.json({ error: 'Failed to update collaborator' }, { status: 500 });
  }
}

// DELETE - Remove a collaborator
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params.id;
    const { searchParams } = new URL(request.url);
    const collaboratorId = searchParams.get('collaboratorId');

    if (!collaboratorId) {
      return NextResponse.json({ error: 'Collaborator ID required' }, { status: 400 });
    }

    // Get the collaborator
    const { data: collaborator } = await supabase
      .from('event_collaborators')
      .select('id, role, photographer_id')
      .eq('id', collaboratorId)
      .eq('event_id', eventId)
      .single();

    if (!collaborator) {
      return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 });
    }

    // Can't remove owner
    if (collaborator.role === 'owner') {
      return NextResponse.json({ error: 'Cannot remove event owner' }, { status: 403 });
    }

    // Check if user can remove collaborators (owner, or removing self)
    const isSelf = collaborator.photographer_id === user.id;
    
    if (!isSelf) {
      const { data: myAccess } = await supabase
        .from('event_collaborators')
        .select('role')
        .eq('event_id', eventId)
        .eq('photographer_id', user.id)
        .eq('status', 'active')
        .single();

      if (!myAccess || myAccess.role !== 'owner') {
        return NextResponse.json({ error: 'Not authorized to remove collaborators' }, { status: 403 });
      }
    }

    // Update status to removed (soft delete to preserve history)
    const { error } = await supabase
      .from('event_collaborators')
      .update({ status: 'removed', updated_at: new Date().toISOString() })
      .eq('id', collaboratorId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Remove collaborator error:', error);
    return NextResponse.json({ error: 'Failed to remove collaborator' }, { status: 500 });
  }
}

