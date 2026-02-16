'use client';

/**
 * Event Collaborators Component
 * 
 * Manage photographers who can work on an event.
 */

import {
  Users,
  UserPlus,
  Crown,
  Star,
  Camera,
  User,
  Settings,
  Trash2,
  Check,
  X,
  Loader2,
  ChevronDown,
  Image as ImageIcon,
  DollarSign,
  Eye,
  Edit,
  Upload,
} from 'lucide-react';
import NextImage from 'next/image';
import { useState, useEffect, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

interface Collaborator {
  id: string;
  photographer_id: string;
  role: 'owner' | 'lead' | 'collaborator' | 'assistant';
  status: 'pending' | 'active' | 'declined' | 'removed';
  can_upload: boolean;
  can_edit_own_photos: boolean;
  can_delete_own_photos: boolean;
  can_view_all_photos: boolean;
  can_edit_event: boolean;
  can_manage_pricing: boolean;
  can_invite_collaborators: boolean;
  can_view_analytics: boolean;
  can_view_revenue: boolean;
  revenue_share_percent: number;
  invited_at: string;
  accepted_at: string | null;
  photo_count: number;
  photographers: {
    id: string;
    display_name: string;
    face_tag: string;
    profile_photo_url: string | null;
    email: string;
  };
}

interface EventCollaboratorsProps {
  eventId: string;
}

const ROLE_CONFIG = {
  owner: { label: 'Owner', icon: Crown, color: 'text-yellow-500' },
  lead: { label: 'Lead', icon: Star, color: 'text-accent' },
  collaborator: { label: 'Collaborator', icon: Camera, color: 'text-foreground' },
  assistant: { label: 'Assistant', icon: User, color: 'text-secondary' },
};

export function EventCollaborators({ eventId }: EventCollaboratorsProps) {
  const toast = useToast();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [myRole, setMyRole] = useState<string>('');
  const [canInvite, setCanInvite] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState<Collaborator | null>(null);

  const loadCollaborators = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/collaborators`);
      if (response.ok) {
        const data = await response.json();
        setCollaborators(data.collaborators || []);
        setMyRole(data.myRole);
        setCanInvite(data.canInvite);
      }
    } catch (error) {
      console.error('Error loading collaborators:', error);
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadCollaborators();
  }, [loadCollaborators]);

  const handleRemove = async (collaboratorId: string, name: string) => {
    if (!confirm(`Remove ${name} from this event?`)) return;

    try {
      const response = await fetch(
        `/api/events/${eventId}/collaborators?collaboratorId=${collaboratorId}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        setCollaborators((prev) => prev.filter((c) => c.id !== collaboratorId));
        toast.success('Removed', `${name} has been removed from this event.`);
      } else {
        const data = await response.json();
        toast.error('Error', data.error || 'Failed to remove collaborator');
      }
    } catch (error) {
      console.error('Remove error:', error);
      toast.error('Error', 'Failed to remove collaborator');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  const activeCollaborators = collaborators.filter((c) => c.status === 'active');
  const pendingInvitations = collaborators.filter((c) => c.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <Users className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Team</h3>
            <p className="text-sm text-secondary">
              {activeCollaborators.length} photographer{activeCollaborators.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {canInvite && (
          <Button size="sm" onClick={() => setShowInviteModal(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite
          </Button>
        )}
      </div>

      {/* Active Collaborators */}
      <div className="space-y-2">
        {activeCollaborators.map((collaborator) => {
          const photographer = collaborator.photographers;
          const roleConfig = ROLE_CONFIG[collaborator.role];
          const RoleIcon = roleConfig.icon;

          return (
            <div
              key={collaborator.id}
              className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors"
            >
              {/* Avatar */}
              {photographer.profile_photo_url ? (
                <NextImage
                  src={photographer.profile_photo_url}
                  alt={photographer.display_name}
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
                  {photographer.display_name.charAt(0).toUpperCase()}
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground truncate">
                    {photographer.display_name}
                  </p>
                  <span className={`flex items-center gap-1 text-xs ${roleConfig.color}`}>
                    <RoleIcon className="h-3 w-3" />
                    {roleConfig.label}
                  </span>
                </div>
                <p className="text-sm text-accent font-mono truncate">
                  {photographer.face_tag}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-secondary">
                  <span className="flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" />
                    {collaborator.photo_count} photos
                  </span>
                  {collaborator.revenue_share_percent < 100 && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {collaborator.revenue_share_percent}% share
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              {myRole === 'owner' && collaborator.role !== 'owner' && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowPermissionsModal(collaborator)}
                    className="p-2 rounded-lg text-secondary hover:text-foreground hover:bg-muted transition-colors"
                    title="Edit permissions"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleRemove(collaborator.id, photographer.display_name)}
                    className="p-2 rounded-lg text-secondary hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-secondary">Pending Invitations</p>
          {pendingInvitations.map((collaborator) => {
            const photographer = collaborator.photographers;

            return (
              <div
                key={collaborator.id}
                className="flex items-center gap-4 p-4 rounded-xl border border-dashed border-border bg-muted/30"
              >
                {photographer.profile_photo_url ? (
                  <NextImage
                    src={photographer.profile_photo_url}
                    alt={photographer.display_name}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover opacity-60"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg font-semibold text-secondary">
                    {photographer.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-secondary truncate">
                    {photographer.display_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Invited {new Date(collaborator.invited_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                  Pending
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteCollaboratorModal
          eventId={eventId}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            loadCollaborators();
          }}
        />
      )}

      {/* Permissions Modal */}
      {showPermissionsModal && (
        <PermissionsModal
          eventId={eventId}
          collaborator={showPermissionsModal}
          onClose={() => setShowPermissionsModal(null)}
          onSuccess={() => {
            setShowPermissionsModal(null);
            loadCollaborators();
          }}
        />
      )}
    </div>
  );
}

// ============================================
// INVITE MODAL
// ============================================

function InviteCollaboratorModal({
  eventId,
  onClose,
  onSuccess,
}: {
  eventId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [faceTag, setFaceTag] = useState('');
  const [role, setRole] = useState<'lead' | 'collaborator' | 'assistant'>('collaborator');
  const [revenueShare, setRevenueShare] = useState(100);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!faceTag.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/events/${eventId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photographerFaceTag: faceTag.trim(),
          role,
          revenueSharePercent: revenueShare,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Invitation Sent', 'The photographer will receive a notification.');
        onSuccess();
      } else {
        toast.error('Error', data.error || data.message || 'Failed to send invitation');
      }
    } catch (error) {
      console.error('Invite error:', error);
      toast.error('Error', 'Failed to send invitation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card border border-border p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-foreground">Invite Creator</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X className="h-5 w-5 text-secondary" />
          </button>
        </div>

        <div className="space-y-4">
          {/* FaceTag Input */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Creator FaceTag
            </label>
            <Input
              value={faceTag}
              onChange={(e) => setFaceTag(e.target.value)}
              placeholder="@photographer1234"
            />
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Role
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['lead', 'collaborator', 'assistant'] as const).map((r) => {
                const config = ROLE_CONFIG[r];
                const Icon = config.icon;
                return (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-colors ${
                      role === r
                        ? 'border-accent bg-accent/10'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${role === r ? 'text-accent' : 'text-secondary'}`} />
                    <span className={`text-xs font-medium ${role === r ? 'text-accent' : 'text-foreground'}`}>
                      {config.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Revenue Share */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Revenue Share ({revenueShare}%)
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={revenueShare}
              onChange={(e) => setRevenueShare(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-secondary mt-1">
              Percentage of their photo sales they receive (after platform fee)
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={!faceTag.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Invitation'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// PERMISSIONS MODAL
// ============================================

function PermissionsModal({
  eventId,
  collaborator,
  onClose,
  onSuccess,
}: {
  eventId: string;
  collaborator: Collaborator;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [permissions, setPermissions] = useState({
    canUpload: collaborator.can_upload,
    canEditOwnPhotos: collaborator.can_edit_own_photos,
    canDeleteOwnPhotos: collaborator.can_delete_own_photos,
    canViewAllPhotos: collaborator.can_view_all_photos,
    canEditEvent: collaborator.can_edit_event,
    canManagePricing: collaborator.can_manage_pricing,
    canInviteCollaborators: collaborator.can_invite_collaborators,
    canViewAnalytics: collaborator.can_view_analytics,
    canViewRevenue: collaborator.can_view_revenue,
  });
  const [revenueShare, setRevenueShare] = useState(collaborator.revenue_share_percent);
  const [role, setRole] = useState(collaborator.role);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/events/${eventId}/collaborators`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collaboratorId: collaborator.id,
          permissions,
          revenueSharePercent: revenueShare,
          role,
        }),
      });

      if (response.ok) {
        toast.success('Updated', 'Permissions have been updated.');
        onSuccess();
      } else {
        const data = await response.json();
        toast.error('Error', data.error || 'Failed to update permissions');
      }
    } catch (error) {
      console.error('Update error:', error);
      toast.error('Error', 'Failed to update permissions');
    } finally {
      setIsSubmitting(false);
    }
  };

  const PERMISSION_OPTIONS = [
    { key: 'canUpload', label: 'Upload photos', icon: Upload },
    { key: 'canEditOwnPhotos', label: 'Edit own photos', icon: Edit },
    { key: 'canDeleteOwnPhotos', label: 'Delete own photos', icon: Trash2 },
    { key: 'canViewAllPhotos', label: 'View all photos', icon: Eye },
    { key: 'canEditEvent', label: 'Edit event details', icon: Settings },
    { key: 'canManagePricing', label: 'Manage pricing', icon: DollarSign },
    { key: 'canInviteCollaborators', label: 'Invite others', icon: UserPlus },
    { key: 'canViewAnalytics', label: 'View analytics', icon: Eye },
    { key: 'canViewRevenue', label: 'View revenue', icon: DollarSign },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-card border border-border p-6 mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Edit Permissions
            </h3>
            <p className="text-sm text-secondary">
              {collaborator.photographers.display_name}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X className="h-5 w-5 text-secondary" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-foreground"
            >
              <option value="lead">Lead Creator</option>
              <option value="collaborator">Collaborator</option>
              <option value="assistant">Assistant</option>
            </select>
          </div>

          {/* Revenue Share */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Revenue Share ({revenueShare}%)
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={revenueShare}
              onChange={(e) => setRevenueShare(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Permissions */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              Permissions
            </label>
            <div className="space-y-2">
              {PERMISSION_OPTIONS.map(({ key, label, icon: Icon }) => (
                <label
                  key={key}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={permissions[key as keyof typeof permissions]}
                    onChange={(e) =>
                      setPermissions((prev) => ({
                        ...prev,
                        [key]: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                  />
                  <Icon className="h-4 w-4 text-secondary" />
                  <span className="text-sm text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
