'use client';

import {
  Clock,
  Download,
  Folder,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  Lock,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

interface VaultPhoto {
  id: string;
  thumbnailUrl: string | null;
  fileUrl: string | null;
  filePath: string | null;
  eventName: string;
  uploadedAt: string;
  albumId: string | null;
  isFavorite: boolean;
}

interface VaultAlbum {
  id: string;
  name: string;
  description?: string | null;
  photo_count: number;
}

interface VaultUsage {
  totalPhotos: number;
  totalSizeBytes: number;
  storageLimitBytes: number;
  usagePercent: number;
}

interface VaultSubscription {
  planName?: string;
  planSlug?: string;
  billingCycle?: string;
}

interface StoragePlan {
  id: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

export default function VaultPage() {
  const toast = useToast();
  const [photos, setPhotos] = useState<VaultPhoto[]>([]);
  const [albums, setAlbums] = useState<VaultAlbum[]>([]);
  const [usage, setUsage] = useState<VaultUsage | null>(null);
  const [subscription, setSubscription] = useState<VaultSubscription | null>(null);
  const [storagePlans, setStoragePlans] = useState<StoragePlan[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [activeAlbumFilter, setActiveAlbumFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredPhotos = useMemo(() => {
    if (activeAlbumFilter === 'all') return photos;
    if (activeAlbumFilter === 'unassigned') return photos.filter((photo) => !photo.albumId);
    return photos.filter((photo) => photo.albumId === activeAlbumFilter);
  }, [photos, activeAlbumFilter]);

  const selectedCount = selectedPhotos.size;
  const activePlans = useMemo(
    () => storagePlans.filter((plan) => plan.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [storagePlans]
  );
  const isOnTopPlan = useMemo(() => {
    if (!activePlans.length) return true;
    const currentSlug = subscription?.planSlug || 'free';
    const currentIndex = activePlans.findIndex((plan) => plan.slug === currentSlug);
    const lastIndex = activePlans.length - 1;
    if (currentIndex < 0) return false;
    return currentIndex >= lastIndex;
  }, [activePlans, subscription?.planSlug]);

  const loadVaultData = async (showLoader = true) => {
    try {
      if (showLoader) setIsLoading(true);
      const [vaultRes, plansRes] = await Promise.all([
        fetch('/api/vault?limit=200', { cache: 'no-store' }),
        fetch('/api/storage/plans', { cache: 'no-store' }),
      ]);

      const vaultPayload = await vaultRes.json().catch(() => ({}));
      const plansPayload = await plansRes.json().catch(() => ({}));

      if (!vaultRes.ok) {
        throw new Error(vaultPayload?.error || 'Failed to load vault');
      }

      const nextPhotos: VaultPhoto[] = (Array.isArray(vaultPayload?.photos) ? vaultPayload.photos : []).map((row: any) => ({
        id: row.id,
        thumbnailUrl: row.thumbnailUrl || row.fileUrl || null,
        fileUrl: row.fileUrl || null,
        filePath: row.file_path || null,
        eventName: row?.events?.name || 'Vault Photo',
        uploadedAt: row.uploaded_at || row.created_at || new Date().toISOString(),
        albumId: row.album_id || null,
        isFavorite: Boolean(row.is_favorite),
      }));

      setPhotos(nextPhotos);
      setUsage(vaultPayload?.usage || null);
      setSubscription(vaultPayload?.subscription || null);
      setAlbums(Array.isArray(vaultPayload?.albums) ? vaultPayload.albums : []);
      setStoragePlans(Array.isArray(plansPayload?.plans) ? plansPayload.plans : []);
      setErrorMessage(null);
    } catch (error: any) {
      console.error('Vault load error:', error);
      setErrorMessage(error?.message || 'Failed to load vault');
    } finally {
      if (showLoader) setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadVaultData(true);

    const usageInterval = setInterval(() => {
      void loadVaultData(false);
    }, 30000);

    return () => clearInterval(usageInterval);
  }, []);

  const toggleSelection = (photoId: string) => {
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const clearSelection = () => setSelectedPhotos(new Set());

  const createAlbum = async () => {
    const name = window.prompt('Folder name');
    if (!name || !name.trim()) return;
    setIsMutating(true);
    try {
      const res = await fetch('/api/vault/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to create folder');
      toast.success('Folder created', `${name.trim()} is ready.`);
      await loadVaultData(false);
    } catch (error: any) {
      toast.error('Create folder failed', error?.message || 'Unable to create folder');
    } finally {
      setIsMutating(false);
    }
  };

  const deleteAlbum = async (album: VaultAlbum) => {
    const confirmed = window.confirm(
      `Delete folder "${album.name}"? Photos will remain in vault but be moved out of this folder.`
    );
    if (!confirmed) return;
    setIsMutating(true);
    try {
      const res = await fetch(`/api/vault/albums?id=${encodeURIComponent(album.id)}`, {
        method: 'DELETE',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to delete folder');
      toast.success('Folder deleted', `"${album.name}" was removed.`);
      if (activeAlbumFilter === album.id) setActiveAlbumFilter('all');
      await loadVaultData(false);
    } catch (error: any) {
      toast.error('Delete folder failed', error?.message || 'Unable to delete folder');
    } finally {
      setIsMutating(false);
    }
  };

  const moveSelectedToAlbum = async (albumId: string | null) => {
    if (!selectedCount) {
      toast.error('No photos selected', 'Select photos first.');
      return;
    }
    setIsMutating(true);
    try {
      const res = await fetch('/api/vault', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign_album',
          photoIds: Array.from(selectedPhotos),
          albumId,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to move photos');
      toast.success('Photos moved', `${selectedCount} photo(s) updated.`);
      clearSelection();
      await loadVaultData(false);
    } catch (error: any) {
      toast.error('Move failed', error?.message || 'Unable to move selected photos');
    } finally {
      setIsMutating(false);
    }
  };

  const deleteSelectedPhotos = async () => {
    if (!selectedCount) {
      toast.error('No photos selected', 'Select photos to remove.');
      return;
    }
    const confirmed = window.confirm(`Remove ${selectedCount} selected photo(s) from vault?`);
    if (!confirmed) return;

    setIsMutating(true);
    try {
      const res = await fetch('/api/vault', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoIds: Array.from(selectedPhotos),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to remove photos');
      toast.success('Removed from vault', `${selectedCount} photo(s) removed.`);
      clearSelection();
      await loadVaultData(false);
    } catch (error: any) {
      toast.error('Remove failed', error?.message || 'Unable to remove selected photos');
    } finally {
      setIsMutating(false);
    }
  };

  const downloadSelected = async () => {
    if (!selectedCount) {
      toast.error('No photos selected', 'Select photos to download.');
      return;
    }

    for (const photoId of selectedPhotos) {
      const photo = photos.find((item) => item.id === photoId);
      if (!photo?.fileUrl) continue;
      const anchor = document.createElement('a');
      anchor.href = photo.fileUrl;
      anchor.download = photo.filePath?.split('/').pop() || `vault-${photo.id}.jpg`;
      anchor.click();
    }

    toast.success('Download started', `${selectedCount} photo(s) download queued.`);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading vault...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Photo Vault</h1>
          <p className="mt-1 text-sm text-secondary">Secure storage for your saved photos.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={createAlbum} disabled={isMutating}>
            <FolderPlus className="mr-2 h-4 w-4" />
            New Folder
          </Button>
          <Button onClick={downloadSelected} disabled={!selectedCount}>
            <Download className="mr-2 h-4 w-4" />
            Download ({selectedCount})
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Storage Usage</h2>
            <p className="text-sm text-secondary">{subscription?.planName || 'Free'} plan</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-secondary">
              {usage ? formatBytes(usage.totalSizeBytes) : '0 B'} /{' '}
              {usage && usage.storageLimitBytes === -1
                ? 'Unlimited'
                : usage
                  ? formatBytes(usage.storageLimitBytes)
                  : '0 B'}
            </p>
            {!isOnTopPlan && (
              <Button asChild size="sm" className="mt-2">
                <Link href="/gallery/vault/pricing">Upgrade Storage</Link>
              </Button>
            )}
          </div>
        </div>
        {usage && usage.storageLimitBytes > 0 && (
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${Math.max(0, Math.min(100, usage.usagePercent || 0))}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={activeAlbumFilter === 'all' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setActiveAlbumFilter('all')}
        >
          All ({photos.length})
        </Button>
        <Button
          variant={activeAlbumFilter === 'unassigned' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setActiveAlbumFilter('unassigned')}
        >
          Unassigned
        </Button>
        {albums.map((album) => (
          <div key={album.id} className="flex items-center gap-1">
            <Button
              variant={activeAlbumFilter === album.id ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setActiveAlbumFilter(album.id)}
            >
              <Folder className="mr-1 h-3.5 w-3.5" />
              {album.name} ({album.photo_count || 0})
            </Button>
            <button
              onClick={() => deleteAlbum(album)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
              title={`Delete folder ${album.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-sm text-foreground">{selectedCount} photo(s) selected</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => moveSelectedToAlbum(null)} disabled={isMutating}>
              Remove Folder
            </Button>
            <select
              className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              defaultValue=""
              onChange={(event) => {
                const next = event.target.value;
                if (!next) return;
                void moveSelectedToAlbum(next);
                event.currentTarget.value = '';
              }}
              disabled={isMutating}
            >
              <option value="">Move to folder...</option>
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="destructive" onClick={deleteSelectedPhotos} disabled={isMutating}>
              Remove From Vault
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {errorMessage}
        </div>
      )}

      {filteredPhotos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <Lock className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium text-foreground">No photos in this view</h3>
          <p className="mb-4 text-secondary">
            Save photos to vault, then organize them in folders.
          </p>
          <Button asChild>
            <Link href="/gallery/scan">Find Your Photos</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {filteredPhotos.map((photo) => (
            <div
              key={photo.id}
              className={`group relative aspect-square cursor-pointer overflow-hidden rounded-xl border-2 transition-all ${
                selectedPhotos.has(photo.id) ? 'border-accent' : 'border-transparent hover:border-border'
              }`}
              onClick={() => toggleSelection(photo.id)}
            >
              {photo.thumbnailUrl ? (
                <Image src={photo.thumbnailUrl} alt="Vault photo" fill className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-muted">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}

              <div className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white">
                {photo.isFavorite ? 'Favorite' : 'Photo'}
              </div>

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <p className="truncate text-xs text-white">{photo.eventName}</p>
                <p className="text-[10px] text-white/70">{new Date(photo.uploadedAt).toLocaleDateString()}</p>
              </div>

              <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedPhotos(new Set([photo.id]));
                    void deleteSelectedPhotos();
                  }}
                  className="rounded-md bg-black/60 p-1.5 text-white hover:bg-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {usage && usage.storageLimitBytes > 0 && (
                <div className="absolute left-2 top-8 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">
                  <HardDrive className="mr-1 inline h-3 w-3" />
                  {formatBytes(usage.totalSizeBytes)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-secondary">Total Photos</p>
          <p className="text-2xl font-bold text-foreground">{photos.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-secondary">Folders</p>
          <p className="text-2xl font-bold text-foreground">{albums.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-secondary">Expiring</p>
          <p className="text-2xl font-bold text-foreground">
            <Clock className="mr-1 inline h-5 w-5 text-warning" />
            0
          </p>
        </div>
      </div>
    </div>
  );
}
