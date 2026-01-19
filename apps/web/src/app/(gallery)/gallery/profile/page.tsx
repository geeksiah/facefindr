'use client';

import {
  User,
  Camera,
  Copy,
  Check,
  Edit2,
  Trash2,
  RefreshCw,
  Calendar,
  Shield,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AttendeeProfile {
  id: string;
  displayName: string;
  email: string;
  faceTag: string;
  profilePhotoUrl?: string;
  hasFaceProfile: boolean;
  lastFaceRefresh?: string;
  createdAt: string;
  totalPhotos: number;
  totalEvents: number;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<AttendeeProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch('/api/attendee/profile');
        if (response.ok) {
          const data = await response.json();
          setProfile(data);
          setDisplayName(data.displayName);
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const copyFaceTag = () => {
    if (profile?.faceTag) {
      navigator.clipboard.writeText(profile.faceTag);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) return;
    
    setIsSaving(true);
    try {
      const response = await fetch('/api/attendee/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });

      if (response.ok) {
        const updated = await response.json();
        setProfile(updated);
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFaceData = async () => {
    try {
      const response = await fetch('/api/attendee/face-profile', {
        method: 'DELETE',
      });

      if (response.ok) {
        setProfile((prev) => prev ? { ...prev, hasFaceProfile: false } : null);
        setShowDeleteConfirm(false);
      }
    } catch (error) {
      console.error('Failed to delete face data:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl text-center py-12">
        <p className="text-secondary">Failed to load profile</p>
        <Button variant="primary" className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
        <p className="text-secondary mt-1">Manage your FaceTag and profile settings</p>
      </div>

      {/* Profile Card */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Profile Header */}
        <div className="relative h-24 bg-gradient-to-r from-accent/20 via-accent/10 to-transparent">
          <div className="absolute -bottom-12 left-6">
            <div className="relative">
              {profile.profilePhotoUrl ? (
                <Image
                  src={profile.profilePhotoUrl}
                  alt={profile.displayName}
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-2xl border-4 border-card object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-card bg-accent text-3xl font-bold text-white">
                  {profile.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <button className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-card border border-border text-secondary hover:text-foreground transition-colors">
                <Camera className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Profile Info */}
        <div className="pt-16 px-6 pb-6 space-y-6">
          {/* Name */}
          <div>
            {isEditing ? (
              <div className="flex items-center gap-3">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="max-w-xs"
                  placeholder="Display name"
                />
                <Button variant="primary" size="sm" onClick={handleSave} isLoading={isSaving}>
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDisplayName(profile.displayName);
                    setIsEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">{profile.displayName}</h2>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-secondary hover:text-foreground transition-colors"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>
            )}
            <p className="text-sm text-secondary mt-1">{profile.email}</p>
          </div>

          {/* FaceTag */}
          <div className="rounded-xl bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-secondary">Your FaceTag</p>
                <p className="text-xl font-bold text-accent">{profile.faceTag}</p>
              </div>
              <button
                onClick={copyFaceTag}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-card border border-border text-secondary hover:text-foreground transition-colors"
              >
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-secondary mt-2">
              Share your FaceTag with photographers so they can tag you in photos
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-xl bg-muted/30">
              <p className="text-2xl font-bold text-foreground">{profile.totalPhotos}</p>
              <p className="text-xs text-secondary">Photos</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/30">
              <p className="text-2xl font-bold text-foreground">{profile.totalEvents}</p>
              <p className="text-xs text-secondary">Events</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/30">
              <p className="text-2xl font-bold text-foreground">
                {profile.hasFaceProfile ? '1' : '0'}
              </p>
              <p className="text-xs text-secondary">Face Profiles</p>
            </div>
          </div>
        </div>
      </div>

      {/* Face Profile Section */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
              <User className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Face Profile</h3>
              <p className="text-sm text-secondary">
                {profile.hasFaceProfile ? 'Active • Used for photo matching' : 'Not set up'}
              </p>
            </div>
          </div>
          {profile.hasFaceProfile && (
            <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              Active
            </span>
          )}
        </div>

        {profile.hasFaceProfile ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-secondary">Last updated</span>
              <span className="text-foreground">
                {profile.lastFaceRefresh
                  ? new Date(profile.lastFaceRefresh).toLocaleDateString()
                  : 'Unknown'}
              </span>
            </div>

            <div className="flex gap-3">
              <Button asChild variant="secondary" className="flex-1">
                <Link href="/gallery/scan">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh Face
                </Link>
              </Button>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <Button asChild variant="primary" className="w-full">
            <Link href="/gallery/scan">
              <Camera className="mr-2 h-4 w-4" />
              Set Up Face Profile
            </Link>
          </Button>
        )}
      </div>

      {/* Quick Links */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <Link
          href="/gallery/settings"
          className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-secondary" />
            <span className="font-medium text-foreground">Privacy & Security</span>
          </div>
          <ChevronRight className="h-4 w-4 text-secondary" />
        </Link>
        <div className="border-t border-border" />
        <div className="flex items-center justify-between p-4 text-secondary">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5" />
            <span className="text-sm">
              Member since {new Date(profile.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Delete Face Data Confirmation */}
      {showDeleteConfirm && (
        <div 
          className="fixed z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          style={{
            position: 'fixed',
            inset: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            width: '100dvw',
            height: '100vh',
            height: '100dvh',
            margin: 0,
            padding: 0,
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-card p-6 space-y-4 mx-4 my-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-semibold">Delete Face Data?</h3>
            </div>
            <p className="text-sm text-secondary">
              This will remove your face profile from our system. You won&apos;t receive automatic
              photo matches until you scan your face again.
            </p>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1 bg-destructive hover:bg-destructive/90"
                onClick={handleDeleteFaceData}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
