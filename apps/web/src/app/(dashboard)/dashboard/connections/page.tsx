'use client';

/**
 * Connections Page (Creator Dashboard)
 * 
 * Manage attendee connections for easy tagging.
 */

import {
  ArrowLeft,
  Users,
  Search,
  Loader2,
  UserPlus,
  Trash2,
  AtSign,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useRealtimeSubscription } from '@/hooks/use-realtime';

interface Connection {
  id: string;
  nickname: string;
  created_at: string;
  attendees: {
    id: string;
    display_name: string;
    face_tag: string;
    profile_photo_url: string | null;
  };
}

export default function ConnectionsPage() {
  const router = useRouter();
  const toast = useToast();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFaceTag, setNewFaceTag] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const loadConnections = useCallback(async () => {
    try {
      const response = await fetch('/api/creators/connections');
      if (response.ok) {
        const data = await response.json();
        setConnections(data.connections || []);
      }
    } catch (error) {
      console.error('Error loading connections:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Subscribe to realtime updates
  useRealtimeSubscription({
    table: 'photographer_connections',
    onChange: () => loadConnections(),
  });

  const handleAddConnection = async () => {
    if (!newFaceTag.trim()) return;

    setIsAdding(true);
    try {
      const response = await fetch('/api/creators/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeFaceTag: newFaceTag.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.alreadyExists) {
          toast.info('Already Connected', 'This attendee is already in your connections.');
        } else {
          toast.success('Connection Added', 'Attendee has been added to your connections.');
          loadConnections();
        }
        setShowAddModal(false);
        setNewFaceTag('');
      } else {
        toast.error('Error', data.error || 'Failed to add connection');
      }
    } catch (error) {
      console.error('Add connection error:', error);
      toast.error('Error', 'Failed to add connection');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveConnection = async (connectionId: string, name: string) => {
    if (!confirm(`Remove ${name} from your connections?`)) return;

    try {
      const response = await fetch(`/api/creators/connections?connectionId=${connectionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setConnections((prev) => prev.filter((c) => c.id !== connectionId));
        toast.success('Removed', `${name} has been removed from your connections.`);
      }
    } catch (error) {
      console.error('Remove connection error:', error);
      toast.error('Error', 'Failed to remove connection');
    }
  };

  const filteredConnections = connections.filter((conn) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      conn.attendees.display_name.toLowerCase().includes(query) ||
      conn.attendees.face_tag?.toLowerCase().includes(query) ||
      conn.nickname?.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
            <div className="space-y-2">
              <div className="h-8 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 w-52 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="h-10 w-36 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="h-16 animate-pulse rounded-xl border border-border bg-card" />
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((key) => (
              <div key={key} className="flex animate-pulse items-center gap-4 border-b border-border pb-3 last:border-0">
                <div className="h-12 w-12 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 rounded bg-muted" />
                  <div className="h-3 w-40 rounded bg-muted" />
                </div>
                <div className="h-9 w-9 rounded-lg bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Connections</h1>
            <p className="text-secondary">
              {connections.length} attendee{connections.length !== 1 ? 's' : ''} saved
            </p>
          </div>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Add Connection
        </Button>
      </div>

      {/* Info Card */}
      <div className="rounded-xl border border-border bg-muted/50 p-4">
        <p className="text-sm text-secondary">
          Connections are attendees you frequently tag in photos. Add them by their FaceTag 
          to quickly find and tag them when uploading event photos.
        </p>
      </div>

      {/* Search */}
      {connections.length > 5 && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search connections..."
            className="w-full rounded-xl border border-border bg-background pl-11 pr-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
        </div>
      )}

      {/* Connections List */}
      {filteredConnections.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">
            {searchQuery ? 'No results found' : 'No connections yet'}
          </h3>
          <p className="text-sm text-secondary mb-6">
            {searchQuery
              ? 'Try a different search term'
              : 'Add attendees by their FaceTag to easily tag them in photos'}
          </p>
          {!searchQuery && (
            <Button onClick={() => setShowAddModal(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Your First Connection
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {filteredConnections.map((conn) => {
              const attendee = conn.attendees;

              return (
                <div
                  key={conn.id}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                >
                  <Link
                    href={`/dashboard/people/attendee/${attendee.face_tag?.replace('@', '') || attendee.id}`}
                    className="flex items-center gap-4 flex-1 min-w-0"
                  >
                    {attendee.profile_photo_url ? (
                      <Image
                        src={attendee.profile_photo_url}
                        alt={attendee.display_name}
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
                        {attendee.display_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {attendee.display_name}
                      </p>
                      <p className="text-sm text-accent font-mono truncate">
                        {attendee.face_tag}
                      </p>
                    </div>
                  </Link>

                  <button
                    onClick={() => handleRemoveConnection(conn.id, attendee.display_name)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-secondary hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Remove connection"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Connection Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card border border-border p-6 mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-foreground">Add Connection</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5 text-secondary" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  FaceTag
                </label>
                <div className="relative">
                  <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
                  <Input
                    value={newFaceTag}
                    onChange={(e) => setNewFaceTag(e.target.value)}
                    placeholder="username1234"
                    className="pl-11"
                  />
                </div>
                <p className="text-xs text-secondary mt-2">
                  Enter the attendee&apos;s FaceTag (e.g., @amara1234)
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleAddConnection}
                  disabled={!newFaceTag.trim() || isAdding}
                >
                  {isAdding ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add Connection'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
