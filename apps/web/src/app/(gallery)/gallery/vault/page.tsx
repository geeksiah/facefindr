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

export default function VaultPage() {
  const toast = useToast();
  const supabase = createClient();
  const [photos, setPhotos] = useState<VaultPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadVaultPhotos();
  }, []);

  const loadVaultPhotos = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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
    } catch (err) {
      console.error('Failed to load vault:', err);
    } finally {
      setIsLoading(false);
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
