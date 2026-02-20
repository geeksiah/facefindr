'use client';

import { useState, useEffect } from 'react';
import { Lock, Download, Image as ImageIcon, Shield, Clock, Trash2 } from 'lucide-react';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';

interface VaultPhoto {
  id: string;
  thumbnailUrl: string;
  fullUrl: string;
  storagePath: string;
  eventName: string;
  purchasedAt: string;
  expiresAt: string | null;
}

interface VaultUsage {
  totalPhotos: number;
  totalSizeBytes: number;
  storageLimitBytes: number;
  photoLimit: number;
  usagePercent: number;
  photosPercent: number;
}

interface VaultSubscription {
  planName?: string;
  planSlug?: string;
  billingCycle?: string;
}

interface StoragePlan {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price_monthly?: number | null;
  price_yearly?: number | null;
  currency?: string | null;
  storage_limit_mb?: number | null;
  photo_limit?: number | null;
  is_popular?: boolean | null;
}

export default function VaultPage() {
  const toast = useToast();
  const [photos, setPhotos] = useState<VaultPhoto[]>([]);
  const [usage, setUsage] = useState<VaultUsage | null>(null);
  const [subscription, setSubscription] = useState<VaultSubscription | null>(null);
  const [storagePlans, setStoragePlans] = useState<StoragePlan[]>([]);
  const [subscribingPlan, setSubscribingPlan] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadVaultPhotos();
  }, []);

  const loadVaultPhotos = async () => {
    const supabase = createClient();
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPhotos([]);
        return;
      }

      // Get entitlements (purchased photos)
      const { data: entitlements, error } = await supabase
        .from('entitlements')
        .select(`
          id,
          created_at,
          expires_at,
          media:media_id (
            id,
            thumbnail_path,
            storage_path,
            event:event_id (
              name
            )
          )
        `)
        .eq('attendee_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading vault:', error);
        setErrorMessage('Unable to load your vault right now.');
        return;
      }

      // Build raw list first
      const rawPhotos = (entitlements || [])
        .filter((e: any) => e.media)
        .map((e: any) => ({
          id: e.media.id,
          thumbnailPath: e.media.thumbnail_path || '',
          storagePath: e.media.storage_path || '',
          eventName: e.media.event?.name || 'Unknown Event',
          purchasedAt: e.created_at,
          expiresAt: e.expires_at,
        }));

      if (rawPhotos.length === 0) {
        await Promise.all([loadVaultUsageAndSubscription(), loadStoragePlans()]);
        setPhotos([]);
        return;
      }

      // Generate signed URLs in batches (private bucket)
      const vaultPhotos: VaultPhoto[] = [];
      const batchSize = 20;
      for (let i = 0; i < rawPhotos.length; i += batchSize) {
        const batch = rawPhotos.slice(i, i + batchSize);
        const thumbPaths = batch
          .map((p) => (p.thumbnailPath || p.storagePath).replace(/^\/?(media\/)?/, ''))
          .filter(Boolean);
        const fullPaths = batch
          .map((p) => p.storagePath.replace(/^\/?(media\/)?/, ''))
          .filter(Boolean);

        const [thumbResult, fullResult] = await Promise.all([
          thumbPaths.length > 0
            ? supabase.storage.from('media').createSignedUrls(thumbPaths, 3600)
            : { data: null },
          fullPaths.length > 0
            ? supabase.storage.from('media').createSignedUrls(fullPaths, 3600)
            : { data: null },
        ]);

        if ((thumbResult as any).error || (fullResult as any).error) {
          console.error('Vault signed URL error:', (thumbResult as any).error || (fullResult as any).error);
          setErrorMessage('Some photos could not be loaded. Please refresh.');
        }

        const thumbUrls = new Map<string, string>();
        const fullUrls = new Map<string, string>();
        (thumbResult.data || []).forEach((item: any) => {
          if (item.signedUrl) thumbUrls.set(item.path, item.signedUrl);
        });
        (fullResult.data || []).forEach((item: any) => {
          if (item.signedUrl) fullUrls.set(item.path, item.signedUrl);
        });

        for (const raw of batch) {
          const thumbKey = (raw.thumbnailPath || raw.storagePath).replace(/^\/?(media\/)?/, '');
          const fullKey = raw.storagePath.replace(/^\/?(media\/)?/, '');
          vaultPhotos.push({
            id: raw.id,
            thumbnailUrl: thumbUrls.get(thumbKey) || '',
            fullUrl: fullUrls.get(fullKey) || '',
            storagePath: raw.storagePath,
            eventName: raw.eventName,
            purchasedAt: raw.purchasedAt,
            expiresAt: raw.expiresAt,
          });
        }
      }

      setPhotos(vaultPhotos);
      await Promise.all([loadVaultUsageAndSubscription(), loadStoragePlans()]);
    } catch (err) {
      console.error('Failed to load vault:', err);
      setErrorMessage('Failed to load your vault.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadVaultUsageAndSubscription = async () => {
    try {
      const response = await fetch('/api/vault?limit=1', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (data?.usage) setUsage(data.usage);
      if (data?.subscription) setSubscription(data.subscription);
    } catch {
      // non-fatal
    }
  };

  const loadStoragePlans = async () => {
    try {
      const response = await fetch('/api/storage/plans', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data?.plans)) {
        setStoragePlans(data.plans);
      }
    } catch {
      // non-fatal
    }
  };

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exponent);
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
  };

  const handleUpgradeStorage = async (planSlug: string) => {
    try {
      setSubscribingPlan(planSlug);
      const response = await fetch('/api/vault/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug, billingCycle: 'monthly' }),
      });
      const data = await response.json();
      if (!response.ok || !data?.checkoutUrl) {
        throw new Error(data?.error || 'Unable to start storage checkout');
      }
      window.location.href = data.checkoutUrl;
    } catch (error: any) {
      toast.error('Upgrade failed', error?.message || 'Unable to upgrade storage right now');
    } finally {
      setSubscribingPlan(null);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedPhotos(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const downloadSelected = async () => {
    if (selectedPhotos.size === 0) {
      toast.error('No Photos Selected', 'Please select photos to download.');
      return;
    }

    toast.success('Download Started', `Downloading ${selectedPhotos.size} photos...`);
    const supabase = createClient();
    
    for (const photoId of selectedPhotos) {
      const photo = photos.find(p => p.id === photoId);
      if (photo) {
        const path = photo.storagePath.replace(/^\/?(media\/)?/, '');
        const { data } = await supabase.storage.from('media').createSignedUrl(path, 3600, { download: true });
        if (data?.signedUrl) {
          const a = document.createElement('a');
          a.href = data.signedUrl;
          a.download = `photo-${photoId}.jpg`;
          a.click();
        }
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-muted-foreground">Loading vault...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Photo Vault</h1>
          <p className="text-secondary mt-1">Your purchased photos, securely stored</p>
        </div>
        {photos.length > 0 && (
          <Button onClick={downloadSelected} disabled={selectedPhotos.size === 0}>
            <Download className="h-4 w-4 mr-2" />
            Download ({selectedPhotos.size})
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-accent/10 p-2">
              <ImageIcon className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{photos.length}</p>
              <p className="text-sm text-secondary">Total Photos</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-success/10 p-2">
              <Shield className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{photos.filter(p => !p.expiresAt).length}</p>
              <p className="text-sm text-secondary">Permanent</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-warning/10 p-2">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{photos.filter(p => p.expiresAt).length}</p>
              <p className="text-sm text-secondary">Expiring</p>
            </div>
          </div>
        </div>
      </div>

      {/* Storage Usage + Upgrade */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Vault Storage</h2>
            <p className="text-sm text-secondary">
              {subscription?.planName || 'Free'} plan
            </p>
          </div>
          {usage && (
            <p className="text-sm text-secondary">
              {formatBytes(usage.totalSizeBytes)} /{' '}
              {usage.storageLimitBytes === -1 ? 'Unlimited' : formatBytes(usage.storageLimitBytes)}
            </p>
          )}
        </div>
        {usage && usage.storageLimitBytes > 0 && (
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${Math.max(0, Math.min(100, usage.usagePercent || 0))}%` }}
            />
          </div>
        )}

        {storagePlans.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {storagePlans
              .filter((plan) => plan.slug !== 'free')
              .slice(0, 3)
              .map((plan) => {
                const currency = String(plan.currency || 'USD').toUpperCase();
                const priceMonthly = Math.round(Number(plan.price_monthly || 0) * 100);
                return (
                  <div
                    key={plan.id}
                    className={`rounded-xl border p-4 ${
                      plan.is_popular ? 'border-accent bg-accent/5' : 'border-border bg-background'
                    }`}
                  >
                    <p className="font-semibold text-foreground">{plan.name}</p>
                    <p className="mt-1 text-sm text-secondary">
                      {plan.storage_limit_mb === -1 ? 'Unlimited' : `${Math.round((plan.storage_limit_mb || 0) / 1024)} GB`} storage
                    </p>
                    <p className="mt-2 text-lg font-bold text-foreground">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency,
                      }).format((priceMonthly || 0) / 100)}
                      <span className="ml-1 text-xs font-normal text-secondary">/month</span>
                    </p>
                    <Button
                      className="mt-3 w-full"
                      variant={plan.is_popular ? 'primary' : 'outline'}
                      disabled={subscribingPlan === plan.slug}
                      onClick={() => handleUpgradeStorage(plan.slug)}
                    >
                      {subscribingPlan === plan.slug ? 'Starting...' : 'Upgrade'}
                    </Button>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {errorMessage}
        </div>
      )}

      {/* Photo Grid */}
      {photos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <Lock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Your vault is empty</h3>
          <p className="text-secondary mb-4">
            Photos you purchase will appear here for easy access and download.
          </p>
          <Button asChild>
            <a href="/gallery/scan">Find Your Photos</a>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className={`group relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                selectedPhotos.has(photo.id) ? 'border-accent' : 'border-transparent hover:border-border'
              }`}
              onClick={() => toggleSelection(photo.id)}
            >
              {photo.thumbnailUrl ? (
                <Image
                  src={photo.thumbnailUrl}
                  alt="Vault photo"
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full bg-muted">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              
              {/* Selection checkbox */}
              <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                selectedPhotos.has(photo.id) 
                  ? 'bg-accent border-accent' 
                  : 'bg-black/50 border-white group-hover:bg-black/70'
              }`}>
                {selectedPhotos.has(photo.id) && (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              {/* Event name overlay */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <p className="text-white text-xs truncate">{photo.eventName}</p>
                <p className="text-white/70 text-[10px]">
                  {new Date(photo.purchasedAt).toLocaleDateString()}
                </p>
              </div>

              {/* Expiry warning */}
              {photo.expiresAt && (
                <div className="absolute top-2 left-2 bg-warning/90 text-warning-foreground text-[10px] px-2 py-0.5 rounded-full">
                  Expires soon
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
