'use client';

import {
  ArrowLeft,
  Save,
  Loader2,
  ImageIcon,
  Upload,
  X,
  Globe,
  Lock,
  Calendar,
  MapPin,
  Eye,
  EyeOff,
  Trash2,
  Check,
  AlertTriangle,
  Rocket,
  DollarSign,
  Gift,
  Package,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

import { EventCollaborators } from '@/components/events/event-collaborators';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import { getCurrencySymbol } from '@/lib/currency-utils';
import { cn } from '@/lib/utils';

interface EventSettings {
  id: string;
  name: string;
  description: string;
  location: string;
  event_date: string;
  end_date: string;
  cover_image_url: string;
  status: string;
  is_public: boolean;
  is_publicly_listed: boolean;
  include_in_public_profile?: boolean;
  allow_anonymous_scan: boolean;
  require_access_code: boolean;
  public_access_code: string;
  face_recognition_enabled: boolean;
  live_mode_enabled: boolean;
  watermark_enabled: boolean;
  // Pricing
  pricing_type: 'free' | 'per_photo' | 'bulk';
  price_per_photo: number;
  unlock_all_price?: number | null;
  bulk_tiers: BulkTier[];
  currency_code: string;
}

interface BulkTier {
  min_photos: number;
  max_photos: number | null;
  price: number;
  label: string;
}

export default function EventSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const eventId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [settings, setSettings] = useState<EventSettings | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [eventId]);

  // Subscribe to real-time updates for event settings
  useRealtimeSubscription({
    table: 'events',
    filter: `id=eq.${eventId}`,
    onChange: () => {
      loadSettings();
    },
  });

  // Subscribe to real-time updates for watermark settings
  useRealtimeSubscription({
    table: 'watermark_settings',
    onChange: () => {
      loadSettings();
    },
  });

  async function loadSettings() {
    try {
      const res = await fetch(`/api/events/${eventId}/settings`);
      const data = await res.json();
      if (res.ok) {
        const eventData = data.event;
        // Initialize pricing fields with defaults if not present
        setSettings({
          ...eventData,
          pricing_type: eventData.pricing_type || 'free',
          price_per_photo: eventData.price_per_photo || 0,
          unlock_all_price: eventData.unlock_all_price || null,
          bulk_tiers: eventData.bulk_tiers || [],
          currency_code: eventData.currency_code || 'USD',
          include_in_public_profile: eventData.include_in_public_profile ?? true,
        });
      } else {
        setError(data.error || 'Failed to load settings');
      }
    } catch (err) {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!settings) return;
    
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/events/${eventId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSuccess('Settings saved successfully');
        toast.success('Settings Saved', 'Event settings have been updated successfully.');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await res.json();
        const errorMsg = data.error || 'Failed to save settings';
        setError(errorMsg);
        toast.error('Save Failed', errorMsg);
      }
    } catch (err) {
      const errorMsg = 'Failed to save settings';
      setError(errorMsg);
      toast.error('Save Failed', errorMsg);
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!settings) return;
    
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/events/${eventId}/publish`, {
        method: 'POST',
      });

      if (res.ok) {
        setSettings({ ...settings, status: 'active' });
        setSuccess('Event published successfully!');
        toast.success('Event Published', 'Your event is now live and visible to attendees.');
        setTimeout(() => setSuccess(''), 3000);
        router.refresh();
      } else {
        const data = await res.json();
        const errorMsg = data.error || 'Failed to publish event';
        setError(errorMsg);
        toast.error('Publish Failed', errorMsg);
      }
    } catch (err) {
      const errorMsg = 'Failed to publish event';
      setError(errorMsg);
      toast.error('Publish Failed', errorMsg);
    } finally {
      setSaving(false);
    }
  }

  async function handleUnpublish() {
    if (!settings) return;
    
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/events/${eventId}/publish`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setSettings({ ...settings, status: 'draft' });
        setSuccess('Event unpublished');
        toast.success('Event Unpublished', 'Your event is now in draft mode and hidden from attendees.');
        setTimeout(() => setSuccess(''), 3000);
        router.refresh();
      } else {
        const data = await res.json();
        const errorMsg = data.error || 'Failed to unpublish event';
        setError(errorMsg);
        toast.error('Unpublish Failed', errorMsg);
      }
    } catch (err) {
      const errorMsg = 'Failed to unpublish event';
      setError(errorMsg);
      toast.error('Unpublish Failed', errorMsg);
    } finally {
      setSaving(false);
    }
  }

  const handleCoverFile = useCallback(async (file: File) => {
    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/events/${eventId}/cover`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setSettings(prev => prev ? { ...prev, cover_image_url: data.url } : null);
        setSuccess('Cover photo uploaded');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Failed to upload cover');
      }
    } catch (err) {
      setError('Failed to upload cover');
    } finally {
      setUploading(false);
    }
  }, [eventId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles[0]) {
        handleCoverFile(acceptedFiles[0]);
      }
    },
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    },
    maxFiles: 1,
    multiple: false,
  });

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleCoverFile(file);
  }

  async function handleRemoveCover() {
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/events/${eventId}/cover`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setSettings(prev => prev ? { ...prev, cover_image_url: '' } : null);
        setSuccess('Cover photo removed');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to remove cover');
      }
    } catch (err) {
      setError('Failed to remove cover');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.push('/dashboard/events');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to delete event');
        setShowDeleteConfirm(false);
      }
    } catch (err) {
      setError('Failed to delete event');
      setShowDeleteConfirm(false);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center py-16">
        <p className="text-secondary">Event not found</p>
        <Link href="/dashboard/events" className="text-accent hover:underline mt-4 inline-block">
          Back to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/events/${eventId}`}
            className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Event Settings</h1>
            <p className="text-sm text-muted-foreground">{settings.name}</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-success/10 text-success">
          <Check className="h-5 w-5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Status & Publish */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Event Status</h2>
        
        <div className="flex items-center justify-between p-4 bg-muted rounded-xl mb-4">
          <div>
            <p className="font-medium text-foreground">Current Status</p>
            <p className="text-sm text-muted-foreground mt-1">
              {settings.status === 'draft' && 'This event is not visible to attendees yet'}
              {settings.status === 'active' && 'This event is live and visible to attendees'}
              {settings.status === 'closed' && 'This event is closed, no new scans allowed'}
              {settings.status === 'archived' && 'This event has been archived'}
            </p>
          </div>
          <span className={cn(
            'rounded-full px-3 py-1 text-sm font-medium',
            settings.status === 'draft' && 'bg-muted-foreground/10 text-muted-foreground',
            settings.status === 'active' && 'bg-success/10 text-success',
            settings.status === 'closed' && 'bg-warning/10 text-warning',
            settings.status === 'archived' && 'bg-destructive/10 text-destructive'
          )}>
            {settings.status.charAt(0).toUpperCase() + settings.status.slice(1)}
          </span>
        </div>

        {settings.status === 'draft' ? (
          <Button onClick={handlePublish} disabled={saving} className="w-full">
            <Rocket className="h-4 w-4 mr-2" />
            Publish Event
          </Button>
        ) : settings.status === 'active' ? (
          <Button onClick={handleUnpublish} variant="outline" disabled={saving} className="w-full">
            <EyeOff className="h-4 w-4 mr-2" />
            Unpublish Event
          </Button>
        ) : null}
      </div>

      {/* Cover Photo */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Cover Photo</h2>
        
        {settings.cover_image_url ? (
          <div className="relative aspect-video rounded-xl overflow-hidden bg-muted mb-4">
            <Image
              src={settings.cover_image_url}
              alt="Event cover"
              fill
              className="object-cover"
            />
            <button
              onClick={handleRemoveCover}
              className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div
            {...getRootProps()}
            className={cn(
              'aspect-video rounded-xl border-2 border-dashed mb-4 transition-colors cursor-pointer',
              isDragActive
                ? 'border-accent bg-accent/5'
                : 'border-border bg-muted/50 hover:border-accent/50 hover:bg-muted'
            )}
          >
            <input {...getInputProps()} />
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <ImageIcon className={cn(
                  'h-12 w-12 mx-auto mb-2 transition-colors',
                  isDragActive ? 'text-accent' : 'text-muted-foreground'
                )} />
                <p className={cn(
                  'text-sm transition-colors',
                  isDragActive ? 'text-accent font-medium' : 'text-muted-foreground'
                )}>
                  {isDragActive ? 'Drop cover photo here' : 'No cover photo'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Drag and drop or click to upload
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {settings.cover_image_url && (
            <div
              {...getRootProps()}
              className="flex-1"
            >
              <input {...getInputProps()} />
              <Button 
                variant="outline" 
                className="w-full" 
                disabled={uploading}
                onClick={(e) => {
                  e.stopPropagation();
                  getRootProps().onClick?.(e as any);
                }}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Change Cover Photo
                  </>
                )}
              </Button>
            </div>
          )}
          {!settings.cover_image_url && (
            <div
              {...getRootProps()}
              className="flex-1"
            >
              <input {...getInputProps()} />
              <Button 
                variant="outline" 
                className="w-full" 
                disabled={uploading}
                onClick={(e) => {
                  e.stopPropagation();
                  getRootProps().onClick?.(e as any);
                }}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Cover Photo
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Recommended: 1920×1080px or 16:9 aspect ratio. Max 10MB.
        </p>
      </div>

      {/* Basic Info */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Basic Information</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Event Name</label>
            <Input
              value={settings.name}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Description</label>
            <textarea
              value={settings.description || ''}
              onChange={(e) => setSettings({ ...settings, description: e.target.value })}
              rows={3}
              className="w-full rounded-xl border border-border bg-muted p-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
              placeholder="Describe your event..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                <Calendar className="h-4 w-4 inline mr-1" />
                Event Date
              </label>
              <Input
                type="date"
                value={settings.event_date?.split('T')[0] || ''}
                onChange={(e) => setSettings({ ...settings, event_date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                <Calendar className="h-4 w-4 inline mr-1" />
                End Date (Optional)
              </label>
              <Input
                type="date"
                value={settings.end_date?.split('T')[0] || ''}
                onChange={(e) => setSettings({ ...settings, end_date: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              <MapPin className="h-4 w-4 inline mr-1" />
              Location
            </label>
            <Input
              value={settings.location || ''}
              onChange={(e) => setSettings({ ...settings, location: e.target.value })}
              placeholder="Event venue or address"
            />
          </div>
        </div>
      </div>

      {/* Privacy & Access */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Privacy & Access</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div className="flex-1 mr-4">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">Public Event</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Anyone with the link can view this event
              </p>
            </div>
            <Switch
              checked={settings.is_public}
              onCheckedChange={(checked) => setSettings({ ...settings, is_public: checked })}
            />
          </div>

          <div className="flex items-center justify-between py-3 border-b border-border">
            <div className="flex-1 mr-4">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">Allow Anonymous Scanning</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Visitors can scan for photos without logging in
              </p>
            </div>
            <Switch
              checked={settings.allow_anonymous_scan}
              onCheckedChange={(checked) => setSettings({ ...settings, allow_anonymous_scan: checked })}
            />
          </div>

          <div className="flex items-center justify-between py-3 border-b border-border">
            <div className="flex-1 mr-4">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">Require Access Code</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Visitors must enter a code to view photos
              </p>
            </div>
            <Switch
              checked={settings.require_access_code}
              onCheckedChange={(checked) => setSettings({ ...settings, require_access_code: checked })}
            />
          </div>

          <div className="flex items-center justify-between py-3">
            <div className="flex-1 mr-4">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">Include in Public Profile</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Show this event on your public photographer profile for attendees to discover
              </p>
            </div>
            <Switch
              checked={settings.include_in_public_profile ?? true}
              onCheckedChange={(checked) => setSettings({ ...settings, include_in_public_profile: checked })}
            />
          </div>

          {settings.require_access_code && (
            <div className="pl-6 pt-2">
              <label className="block text-sm font-medium text-foreground mb-2">
                Access Code
              </label>
              <Input
                value={settings.public_access_code || ''}
                onChange={(e) => setSettings({ ...settings, public_access_code: e.target.value.toUpperCase() })}
                className="font-mono uppercase tracking-widest"
                maxLength={10}
              />
            </div>
          )}
        </div>
      </div>

      {/* Features */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Features</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div className="flex-1 mr-4">
              <span className="font-medium text-foreground">Face Recognition</span>
              <p className="text-sm text-muted-foreground mt-1">
                Enable AI-powered face matching for photos
              </p>
            </div>
            <Switch
              checked={settings.face_recognition_enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, face_recognition_enabled: checked })}
            />
          </div>

          <div className="flex items-center justify-between py-3 border-b border-border">
            <div className="flex-1 mr-4">
              <span className="font-medium text-foreground">Live Mode</span>
              <p className="text-sm text-muted-foreground mt-1">
                Automatically upload photos during the event
              </p>
            </div>
            <Switch
              checked={settings.live_mode_enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, live_mode_enabled: checked })}
            />
          </div>

          <div className="flex items-center justify-between py-3">
            <div className="flex-1 mr-4">
              <span className="font-medium text-foreground">Watermark Photos</span>
              <p className="text-sm text-muted-foreground mt-1">
                Add watermark to preview images
              </p>
            </div>
            <Switch
              checked={settings.watermark_enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, watermark_enabled: checked })}
            />
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">
          <DollarSign className="h-5 w-5 inline mr-2" />
          Photo Pricing
        </h2>
        
        <div className="space-y-4">
          {/* Pricing Type Selection */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setSettings({ ...settings, pricing_type: 'free' })}
              className={cn(
                'p-4 rounded-xl border text-center transition-colors',
                settings.pricing_type === 'free'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border hover:bg-muted'
              )}
            >
              <Gift className="h-6 w-6 mx-auto mb-2" />
              <span className="font-medium block">Free</span>
              <span className="text-xs text-muted-foreground">No charge</span>
            </button>
            <button
              onClick={() => setSettings({ ...settings, pricing_type: 'per_photo' })}
              className={cn(
                'p-4 rounded-xl border text-center transition-colors',
                settings.pricing_type === 'per_photo'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border hover:bg-muted'
              )}
            >
              <DollarSign className="h-6 w-6 mx-auto mb-2" />
              <span className="font-medium block">Per Photo</span>
              <span className="text-xs text-muted-foreground">Fixed price each</span>
            </button>
            <button
              onClick={() => setSettings({ ...settings, pricing_type: 'bulk' })}
              className={cn(
                'p-4 rounded-xl border text-center transition-colors',
                settings.pricing_type === 'bulk'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border hover:bg-muted'
              )}
            >
              <Package className="h-6 w-6 mx-auto mb-2" />
              <span className="font-medium block">Bulk Pricing</span>
              <span className="text-xs text-muted-foreground">Volume discounts</span>
            </button>
          </div>

          {/* Per Photo Pricing */}
          {settings.pricing_type === 'per_photo' && (
            <div className="p-4 bg-muted rounded-xl space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Price per Photo
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {getCurrencySymbol(settings.currency_code || 'USD')}
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={(settings.price_per_photo || 0) / 100}
                      onChange={(e) => setSettings({ 
                        ...settings, 
                        price_per_photo: Math.round(parseFloat(e.target.value || '0') * 100)
                      })}
                      className="pl-7"
                    />
                  </div>
                  <Select
                    value={settings.currency_code || 'USD'}
                    onChange={(e) => setSettings({ ...settings, currency_code: e.target.value })}
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="GHS">GHS (₵)</option>
                    <option value="NGN">NGN (₦)</option>
                  </Select>
                </div>
              </div>

              {/* Unlock All Price */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Unlock All Photos Price (Optional)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={((settings as any).unlock_all_price || 0) / 100}
                    onChange={(e) => setSettings({ 
                      ...settings, 
                      unlock_all_price: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null
                    } as any)}
                    className="pl-7"
                    placeholder="0.00"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Optional: Set a discounted price for unlocking all photos at once
                </p>
              </div>
            </div>
          )}

          {/* Bulk Pricing Tiers */}
          {settings.pricing_type === 'bulk' && (
            <div className="p-4 bg-muted rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Pricing Tiers</label>
                <button
                  onClick={() => {
                    const tiers = settings.bulk_tiers || [];
                    const lastMax = tiers.length > 0 ? (tiers[tiers.length - 1].max_photos || 0) : 0;
                    setSettings({
                      ...settings,
                      bulk_tiers: [...tiers, { min_photos: lastMax + 1, max_photos: lastMax + 10, price: 0, label: '' }]
                    });
                  }}
                  className="text-sm text-accent hover:underline"
                >
                  + Add Tier
                </button>
              </div>

              {(!settings.bulk_tiers || settings.bulk_tiers.length === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No pricing tiers defined. Add your first tier above.
                </p>
              ) : (
                <div className="space-y-3">
                  {settings.bulk_tiers.map((tier, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 bg-card rounded-lg">
                      <input
                        type="number"
                        value={tier.min_photos}
                        onChange={(e) => {
                          const tiers = [...settings.bulk_tiers];
                          tiers[index] = { ...tier, min_photos: parseInt(e.target.value) || 0 };
                          setSettings({ ...settings, bulk_tiers: tiers });
                        }}
                        placeholder="Min"
                        className="w-16 px-2 py-1 text-sm rounded border border-border bg-muted"
                      />
                      <span className="text-muted-foreground">-</span>
                      <input
                        type="number"
                        value={tier.max_photos || ''}
                        onChange={(e) => {
                          const tiers = [...settings.bulk_tiers];
                          tiers[index] = { ...tier, max_photos: e.target.value ? parseInt(e.target.value) : null };
                          setSettings({ ...settings, bulk_tiers: tiers });
                        }}
                        placeholder="∞"
                        className="w-16 px-2 py-1 text-sm rounded border border-border bg-muted"
                      />
                      <span className="text-muted-foreground text-sm">photos</span>
                      <span className="text-muted-foreground mx-2">=</span>
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          {getCurrencySymbol(settings.currency_code || 'USD')}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          value={(tier.price || 0) / 100}
                          onChange={(e) => {
                            const tiers = [...settings.bulk_tiers];
                            tiers[index] = { ...tier, price: Math.round(parseFloat(e.target.value || '0') * 100) };
                            setSettings({ ...settings, bulk_tiers: tiers });
                          }}
                          className="w-full pl-6 pr-2 py-1 text-sm rounded border border-border bg-muted"
                        />
                      </div>
                      <span className="text-muted-foreground text-sm">/photo</span>
                      <button
                        onClick={() => {
                          const tiers = settings.bulk_tiers.filter((_, i) => i !== index);
                          setSettings({ ...settings, bulk_tiers: tiers });
                        }}
                        className="p-1 text-destructive hover:bg-destructive/10 rounded"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Currency
                </label>
                <Select
                  value={settings.currency_code || 'USD'}
                  onChange={(e) => setSettings({ ...settings, currency_code: e.target.value })}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="GHS">GHS (₵)</option>
                  <option value="NGN">NGN (₦)</option>
                </Select>
              </div>
            </div>
          )}

          {settings.pricing_type === 'free' && (
            <p className="text-sm text-muted-foreground p-4 bg-muted rounded-xl">
              Photos from this event will be available for free download. Attendees won't need to pay.
            </p>
          )}
        </div>
      </div>

      {/* Team / Collaborators */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-accent" />
          <h2 className="font-semibold text-foreground">Team & Collaborators</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Invite other photographers to collaborate on this event. Each collaborator can upload their own photos
          and will receive their share of revenue from their photo sales.
        </p>
        <EventCollaborators eventId={eventId} />
      </div>

      {/* Danger Zone */}
      <div className="rounded-2xl border border-destructive/50 bg-destructive/5 p-6">
        <h2 className="font-semibold text-destructive mb-4">Danger Zone</h2>
        
        {showDeleteConfirm ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Are you sure you want to delete this event? This action cannot be undone.
              All photos and data will be permanently deleted.
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" onClick={handleDelete} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Yes, Delete Event
              </Button>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setShowDeleteConfirm(true)} className="text-destructive border-destructive/50 hover:bg-destructive/10">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Event
          </Button>
        )}
      </div>
    </div>
  );
}
