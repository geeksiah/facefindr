'use client';

import {
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
  Trash2,
  Check,
  AlertTriangle,
  DollarSign,
  Gift,
  Package,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
  allow_anonymous_scan: boolean;
  require_access_code: boolean;
  public_access_code: string;
  face_recognition_enabled: boolean;
  live_mode_enabled: boolean;
  watermark_enabled: boolean;
  pricing_type: 'free' | 'per_photo' | 'bulk';
  price_per_photo: number;
  unlock_all_price: number | null;
  bulk_tiers: BulkTier[];
  currency_code: string;
}

interface BulkTier {
  min_photos: number;
  max_photos: number | null;
  price: number;
  label: string;
}

interface EventSettingsFormProps {
  event: EventSettings;
}

export function EventSettingsForm({ event: initialEvent }: EventSettingsFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [settings, setSettings] = useState<EventSettings>(initialEvent);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleCoverFile = useCallback(async (file: File) => {
    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/admin/events/${settings.id}/cover`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setSettings(prev => ({ ...prev, cover_image_url: data.url }));
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
  }, [settings.id]);

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

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/admin/events/${settings.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSuccess('Settings saved successfully');
        setTimeout(() => setSuccess(''), 3000);
        router.refresh();
      } else {
        const data = await res.json();
        const errorMsg = data.error || 'Failed to save settings';
        setError(errorMsg);
      }
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveCover() {
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/events/${settings.id}/cover`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setSettings(prev => ({ ...prev, cover_image_url: '' }));
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Event Settings</h1>
          <p className="text-sm text-muted-foreground">{settings.name}</p>
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
          {settings.cover_image_url ? (
            <div {...getRootProps()} className="flex-1">
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
          ) : (
            <div {...getRootProps()} className="flex-1">
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

          <div className="flex items-center justify-between py-3">
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
              <span className="font-medium block">Bulk</span>
            </button>
          </div>

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
            </div>
          )}

          {settings.pricing_type === 'bulk' && (
            <div className="p-4 bg-muted rounded-xl">
              <p className="text-sm text-muted-foreground">
                Bulk pricing tiers can be configured here.
              </p>
            </div>
          )}

          {settings.pricing_type === 'free' && (
            <p className="text-sm text-muted-foreground p-4 bg-muted rounded-xl">
              Photos from this event will be available for free download.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
