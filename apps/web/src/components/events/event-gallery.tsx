'use client';

import { useState, useEffect } from 'react';
import { Image as ImageIcon, Trash2, Download, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { deletePhoto, getPhotoUrl } from './actions';
import { createClient } from '@/lib/supabase/client';

interface Photo {
  id: string;
  storage_path: string;
  thumbnail_path: string | null;
  original_filename: string | null;
  file_size: number;
  created_at: string;
}

interface EventGalleryProps {
  eventId: string;
  photos: Photo[];
}

export function EventGallery({ eventId, photos }: EventGalleryProps) {
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadPhotoUrls() {
      const supabase = createClient();
      const urls: Record<string, string> = {};

      for (const photo of photos) {
        const path = photo.thumbnail_path || photo.storage_path;
        const { data } = await supabase.storage
          .from('media')
          .createSignedUrl(path, 3600);
        
        if (data?.signedUrl) {
          urls[photo.id] = data.signedUrl;
        }
      }

      setPhotoUrls(urls);
      setLoading(false);
    }

    if (photos.length > 0) {
      loadPhotoUrls();
    } else {
      setLoading(false);
    }
  }, [photos]);

  const toggleSelect = (photoId: string) => {
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedPhotos.size === photos.length) {
      setSelectedPhotos(new Set());
    } else {
      setSelectedPhotos(new Set(photos.map((p) => p.id)));
    }
  };

  const handleDelete = async (photoId: string) => {
    setDeletingIds((prev) => new Set(prev).add(photoId));
    
    const result = await deletePhoto(photoId, eventId);
    
    if (result.error) {
      console.error('Delete failed:', result.error);
    }
    
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.delete(photoId);
      return next;
    });
    
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      next.delete(photoId);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    for (const photoId of selectedPhotos) {
      await handleDelete(photoId);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-2xl bg-muted p-4 mb-4">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold text-foreground">No photos yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload photos to get started.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk Actions */}
      {selectedPhotos.size > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-muted p-3">
          <p className="text-sm font-medium text-foreground">
            {selectedPhotos.size} photo{selectedPhotos.size !== 1 ? 's' : ''} selected
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedPhotos(new Set())}>
              Clear
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      {/* Photo Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {photos.map((photo) => {
          const isSelected = selectedPhotos.has(photo.id);
          const isDeleting = deletingIds.has(photo.id);
          const url = photoUrls[photo.id];

          return (
            <div
              key={photo.id}
              className={cn(
                'relative aspect-square rounded-xl overflow-hidden bg-muted group cursor-pointer transition-all',
                isSelected && 'ring-2 ring-accent ring-offset-2 ring-offset-background',
                isDeleting && 'opacity-50 pointer-events-none'
              )}
              onClick={() => toggleSelect(photo.id)}
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={photo.original_filename || 'Photo'}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}

              {/* Selection checkbox */}
              <div
                className={cn(
                  'absolute top-2 left-2 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all',
                  isSelected
                    ? 'bg-accent border-accent'
                    : 'border-white/70 bg-black/20 opacity-0 group-hover:opacity-100'
                )}
              >
                {isSelected && (
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              {/* Deleting overlay */}
              {isDeleting && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                  <Loader2 className="h-6 w-6 animate-spin text-destructive" />
                </div>
              )}

              {/* Hover actions */}
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end gap-1 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // View photo
                    window.open(url, '_blank');
                  }}
                  className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                >
                  <Eye className="h-4 w-4 text-white" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(photo.id);
                  }}
                  className="p-1.5 rounded-lg bg-white/20 hover:bg-destructive/80 transition-colors"
                >
                  <Trash2 className="h-4 w-4 text-white" />
                </button>
              </div>

              {/* File info on hover */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-xs text-white">
                  {formatFileSize(photo.file_size)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
