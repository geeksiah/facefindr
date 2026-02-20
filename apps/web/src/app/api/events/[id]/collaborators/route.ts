export const dynamic = 'force-dynamic';

/**
 * Event Collaborators API
 * 
 * Manage photographers who can work on an event.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getPhotographerIdCandidates, resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { checkLimit } from '@/lib/subscription/enforcement';
import { createClient, createServiceClient } from '@/lib/supabase/server';

interface RouteParams {
  params: { id: string };
}

interface EventAccessResult {
  eventOwnerId: string;
  isOwner: boolean;
  collaboratorAccess: {
    role: string;
    can_invite_collaborators: boolean;
  } | null;
}

async function getEventAccess(
  db: ReturnType<typeof createServiceClient>,
  eventId: string,
  photographerIdCandidates: string[]
): Promise<EventAccessResult | null> {
  const { data: event } = await db
    .from('events')
    .select('id, photographer_id')
    .eq('id', eventId)
    .maybeSingle();

  if (!event) {
    return null;
  }

  const isOwner = photographerIdCandidates.includes(event.photographer_id);

  const { data: collaboratorAccess } = await db
    .from('event_collaborators')
    .select('role, can_invite_collaborators')
    .eq('event_id', eventId)
    .in('photographer_id', photographerIdCandidates)
    .eq('status', 'active')
    .maybeSingle();

  return {
    eventOwnerId: event.photographer_id,
    isOwner,
    collaboratorAccess: collaboratorAccess || null,
  };
}

type CollaboratorRole = 'owner' | 'lead' | 'collaborator' | 'assistant';

const ROLE_DEFAULT_PERMISSIONS: Record<
  Exclude<CollaboratorRole, 'owner'>,
  {
    can_upload: boolean;
    can_edit_own_photos: boolean;
    can_delete_own_photos: boolean;
    can_view_all_photos: boolean;
    can_edit_event: boolean;
    can_manage_pricing: boolean;
    can_invite_collaborators: boolean;
    can_view_analytics: boolean;
    can_view_revenue: boolean;
  }
> = {
  lead: {
    can_upload: true,
    can_edit_own_photos: true,
    can_delete_own_photos: true,
    can_view_all_photos: true,
    can_edit_event: true,
    can_manage_pricing: true,
    can_invite_collaborators: true,
    can_view_analytics: true,
    can_view_revenue: true,
  },
  collaborator: {
    can_upload: true,
    can_edit_own_photos: true,
    can_delete_own_photos: true,
    can_view_all_photos: true,
    can_edit_event: false,
    can_manage_pricing: false,
    can_invite_collaborators: false,
    can_view_analytics: false,
    can_view_revenue: false,
  },
  assistant: {
    can_upload: true,
    can_edit_own_photos: true,
    can_delete_own_photos: true,
    can_view_all_photos: false,
    can_edit_event: false,
    can_manage_pricing: false,
    can_invite_collaborators: false,
    can_view_analytics: false,
    can_view_revenue: false,
  },
};

function normalizeCollaboratorRole(value: unknown): Exclude<CollaboratorRole, 'owner'> {
  const normalized = String(value || 'collaborator').toLowerCase();
  if (normalized === 'lead' || normalized === 'assistant' || normalized === 'collaborator') {
    return normalized;
  }
  return 'collaborator';
}

function normalizeRevenueShare(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  const clamped = Math.min(100, Math.max(0, parsed));
  return Math.round(clamped * 100) / 100;
}

function buildPermissionSet(
  role: Exclude<CollaboratorRole, 'owner'>,
  permissions: Record<string, unknown> | null | undefined
) {
  const base = { ...ROLE_DEFAULT_PERMISSIONS[role] };
  const overrideMap: Record<string, keyof typeof base> = {
    canUpload: 'can_upload',
    canEditOwnPhotos: 'can_edit_own_photos',
    canDeleteOwnPhotos: 'can_delete_own_photos',
    canViewAllPhotos: 'can_view_all_photos',
    canEditEvent: 'can_edit_event',
    canManagePricing: 'can_manage_pricing',
    canInviteCollaborators: 'can_invite_collaborators',
    canViewAnalytics: 'can_view_analytics',
    canViewRevenue: 'can_view_revenue',
  };

  for (const [inputKey, targetKey] of Object.entries(overrideMap)) {
    if (typeof permissions?.[inputKey] === 'boolean') {
      base[targetKey] = permissions[inputKey] as boolean;
    }
  }

  // Keep permission model strict and predictable by role.
  if (role === 'assistant') {
    base.can_edit_event = false;
    base.can_manage_pricing = false;
    base.can_invite_collaborators = false;
    base.can_view_analytics = false;
    base.can_view_revenue = false;
  }
  if (role === 'collaborator') {
    base.can_manage_pricing = false;
    base.can_invite_collaborators = false;
  }

  return base;
}

// GET - List collaborators for an event
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const db = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params.id;
    const photographerIdCandidates = await getPhotographerIdCandidates(db, user.id, user.email);
    if (!photographerIdCandidates.length) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    const access = await getEventAccess(db, eventId, photographerIdCandidates);
    if (!access) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const canView = access.isOwner || Boolean(access.collaboratorAccess);
    if (!canView) {
      return NextResponse.json({ error: 'Not authorized to view this event' }, { status: 403 });
    }

    // Get all collaborators
    const { data: collaborators, error } = await db
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
    const { data: photoCounts } = await db
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
      myRole: access.isOwner ? 'owner' : access.collaboratorAccess?.role || 'collaborator',
      canInvite: access.isOwner || Boolean(access.collaboratorAccess?.can_invite_collaborators),
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
    const db = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params.id;
    const body = await request.json();
    const { photographerId, photographerFaceTag, role = 'collaborator', permissions = {}, revenueSharePercent = 100 } = body;
    const photographerIdCandidates = await getPhotographerIdCandidates(db, user.id, user.email);
    const { data: inviterProfile } = await resolvePhotographerProfileByUser(db, user.id, user.email);
    if (!photographerIdCandidates.length) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }
    if (!inviterProfile?.id) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    const access = await getEventAccess(db, eventId, photographerIdCandidates);
    if (!access) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const canInvite = access.isOwner || Boolean(access.collaboratorAccess?.can_invite_collaborators);
    if (!canInvite) {
      return NextResponse.json({ error: 'Not authorized to invite collaborators' }, { status: 403 });
    }

    // Check team member limit based on plan
    const { data: event } = await db
      .from('events')
      .select('id, name, photographer_id')
      .eq('id', eventId)
      .maybeSingle();

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
      const { data: photographer } = await db
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
    if (targetCreatorId === access.eventOwnerId) {
      return NextResponse.json({ error: 'Event owner is already part of this event' }, { status: 400 });
    }

    // Check if already a collaborator
    const { data: existing } = await db
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

    const normalizedRole = normalizeCollaboratorRole(role);
    const permissionSet = buildPermissionSet(normalizedRole, permissions || null);
    const normalizedRevenueShare = normalizeRevenueShare(revenueSharePercent);

    // Create or update collaborator invitation
    const collaboratorData = {
      event_id: eventId,
      photographer_id: targetCreatorId,
      role: normalizedRole,
      can_upload: permissionSet.can_upload,
      can_edit_own_photos: permissionSet.can_edit_own_photos,
      can_delete_own_photos: permissionSet.can_delete_own_photos,
      can_view_all_photos: permissionSet.can_view_all_photos,
      can_edit_event: permissionSet.can_edit_event,
      can_manage_pricing: permissionSet.can_manage_pricing,
      can_invite_collaborators: permissionSet.can_invite_collaborators,
      can_view_analytics: permissionSet.can_view_analytics,
      can_view_revenue: permissionSet.can_view_revenue,
      revenue_share_percent: normalizedRevenueShare,
      status: 'pending',
      invited_by: inviterProfile.id,
      invited_at: new Date().toISOString(),
    };

    const { data: collaborator, error } = await db
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
      await db
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
    const db = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params.id;
    const body = await request.json();
    const { collaboratorId, action, permissions, revenueSharePercent, role } = body;
    const photographerIdCandidates = await getPhotographerIdCandidates(db, user.id, user.email);
    if (!photographerIdCandidates.length) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    // Handle accept/decline actions
    if (action === 'accept' || action === 'decline') {
      const { data: invitation } = await db
        .from('event_collaborators')
        .select('id, event_id, photographer_id, status, events(photographer_id)')
        .eq('event_id', eventId)
        .in('photographer_id', photographerIdCandidates)
        .eq('status', 'pending')
        .single();

      if (!invitation) {
        return NextResponse.json({ error: 'No pending invitation found' }, { status: 404 });
      }
      if (action === 'accept') {
        const ownerId = (invitation as any)?.events?.photographer_id as string | undefined;
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

      const { error } = await db
        .from('event_collaborators')
        .update({
          status: action === 'accept' ? 'active' : 'declined',
          accepted_at: action === 'accept' ? new Date().toISOString() : null,
        })
        .eq('id', invitation.id);

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

      return NextResponse.json({ success: true, status: action === 'accept' ? 'active' : 'declined' });
    }

    // For other updates, check if user can manage collaborators
    const access = await getEventAccess(db, eventId, photographerIdCandidates);
    if (!access) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (!access.isOwner) {
      return NextResponse.json({ error: 'Not authorized to manage collaborators' }, { status: 403 });
    }

    // Get the collaborator being updated
    const { data: collaborator } = await db
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
    
    const hasPermissionsPayload = permissions && typeof permissions === 'object';
    const normalizedRole = role && role !== 'owner' ? normalizeCollaboratorRole(role) : null;
    if (normalizedRole) {
      updateData.role = normalizedRole;
    }

    if (hasPermissionsPayload || normalizedRole) {
      const effectiveRole = (normalizedRole || collaborator.role || 'collaborator') as Exclude<CollaboratorRole, 'owner'>;
      const permissionSet = buildPermissionSet(effectiveRole, hasPermissionsPayload ? permissions : null);
      updateData.can_upload = permissionSet.can_upload;
      updateData.can_edit_own_photos = permissionSet.can_edit_own_photos;
      updateData.can_delete_own_photos = permissionSet.can_delete_own_photos;
      updateData.can_view_all_photos = permissionSet.can_view_all_photos;
      updateData.can_edit_event = permissionSet.can_edit_event;
      updateData.can_manage_pricing = permissionSet.can_manage_pricing;
      updateData.can_invite_collaborators = permissionSet.can_invite_collaborators;
      updateData.can_view_analytics = permissionSet.can_view_analytics;
      updateData.can_view_revenue = permissionSet.can_view_revenue;
    }

    if (typeof revenueSharePercent === 'number') {
      updateData.revenue_share_percent = normalizeRevenueShare(revenueSharePercent);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    updateData.updated_at = new Date().toISOString();

    const { error } = await db
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
    const db = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params.id;
    const { searchParams } = new URL(request.url);
    const collaboratorId = searchParams.get('collaboratorId');
    const photographerIdCandidates = await getPhotographerIdCandidates(db, user.id, user.email);
    if (!photographerIdCandidates.length) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    if (!collaboratorId) {
      return NextResponse.json({ error: 'Collaborator ID required' }, { status: 400 });
    }

    // Get the collaborator
    const { data: collaborator } = await db
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
    const isSelf = photographerIdCandidates.includes(collaborator.photographer_id);
    
    if (!isSelf) {
      const access = await getEventAccess(db, eventId, photographerIdCandidates);
      if (!access || !access.isOwner) {
        return NextResponse.json({ error: 'Not authorized to remove collaborators' }, { status: 403 });
      }
    }

    // Update status to removed (soft delete to preserve history)
    const { error } = await db
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

