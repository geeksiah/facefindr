'use client';

import { Image as ImageIcon, Trash2, Download, Eye, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Lightbox } from '@/components/ui/lightbox';
import { useToast, useConfirm } from '@/components/ui/toast';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

import { deletePhoto, getPhotoUrl } from './actions';


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

export function EventGallery({ eventId, photos: initialPhotos }: EventGalleryProps) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Update photos when initialPhotos changes
  useEffect(() => {
    setPhotos(initialPhotos);
  }, [initialPhotos]);

  // Subscribe to real-time photo updates
  useRealtimeSubscription({
    table: 'media',
    filter: `event_id=eq.${eventId}`,
    onInsert: (newPhoto) => {
      setPhotos(prev => [newPhoto as Photo, ...prev]);
    },
    onUpdate: (updatedPhoto) => {
      const photo = updatedPhoto as Photo;
      setPhotos(prev => prev.map(p => p.id === photo.id ? photo : p));
    },
    onDelete: (deletedPhoto) => {
      const photo = deletedPhoto as { id: string };
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
    },
  });

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    async function loadPhotoUrls() {
      try {
        const supabase = createClient();
        const existingUrls: Record<string, string> = {};
        const missingPhotos = photos.filter((photo) => !photoUrls[photo.id]);

        if (missingPhotos.length === 0) {
          setLoading(false);
          return;
        }

        setLoading(true);

        // Process photos in batches to avoid overwhelming the API
        const batchSize = 10;
        for (let i = 0; i < missingPhotos.length; i += batchSize) {
          if (!isMounted) break;
          
          const batch = missingPhotos.slice(i, i + batchSize);
          await Promise.all(
            batch.map(async (photo) => {
              try {
                const path = photo.thumbnail_path || photo.storage_path;
                
                // Skip if no path available
                if (!path) {
                  console.warn(`Photo ${photo.id} has no storage path`);
                  return;
                }
                
                // Clean path (remove leading slash if present)
                const cleanPath = path.startsWith('/') ? path.slice(1) : path;
                
                const { data, error: urlError } = await supabase.storage
                  .from('media')
                  .createSignedUrl(cleanPath, 3600);
                
                if (urlError) {
                  console.error(`Failed to create signed URL for photo ${photo.id}:`, urlError);
                  return;
                }
                
                if (data?.signedUrl && isMounted) {
                  existingUrls[photo.id] = data.signedUrl;
                }
              } catch (error) {
                // Silently ignore individual photo errors
                if (error instanceof Error && error.name === 'AbortError') {
                  return;
                }
                console.error(`Failed to load photo ${photo.id}:`, error);
              }
            })
          );

          if (isMounted) {
            setPhotoUrls((prev) => ({ ...prev, ...existingUrls }));
            if (i === 0) {
              setLoading(false);
            }
          }
        }

        if (isMounted) {
          setPhotoUrls((prev) => ({ ...prev, ...existingUrls }));
          setLoading(false);
        }
      } catch (error) {
        // Silently ignore AbortError
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        console.error('Error loading photo URLs:', error);
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    if (photos.length > 0) {
      loadPhotoUrls();
    } else {
      setLoading(false);
    }

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [photos, photoUrls]);

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
    const confirmed = await confirm({
      title: 'Delete Photo',
      message: 'Are you sure you want to delete this photo? This action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    
    if (!confirmed) return;
    
    setDeletingIds((prev) => new Set(prev).add(photoId));
    
    const result = await deletePhoto(photoId, eventId);
    
    if (result.error) {
      toast.error('Delete Failed', result.error);
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
    } else {
      toast.success('Photo Deleted', 'The photo has been successfully deleted.');
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
      router.refresh();
    }
  };

  const handleBulkDelete = async () => {
    const confirmed = await confirm({
      title: `Delete ${selectedPhotos.size} Photos`,
      message: `Are you sure you want to delete ${selectedPhotos.size} photo${selectedPhotos.size !== 1 ? 's' : ''}? This action cannot be undone.`,
      confirmLabel: 'Delete All',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    
    if (!confirmed) return;
    
    const photoIds = Array.from(selectedPhotos);
    let successCount = 0;
    let errorCount = 0;
    
    for (const photoId of photoIds) {
      setDeletingIds((prev) => new Set(prev).add(photoId));
      
      const result = await deletePhoto(photoId, eventId);
      
      if (result.error) {
        errorCount++;
        toast.error('Delete Failed', result.error);
      } else {
        successCount++;
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
    }
    
    if (successCount > 0) {
      toast.success('Photos Deleted', `${successCount} photo${successCount !== 1 ? 's' : ''} deleted successfully.`);
    }
    
    if (errorCount > 0 && successCount === 0) {
      toast.error('Delete Failed', `Failed to delete ${errorCount} photo${errorCount !== 1 ? 's' : ''}.`);
    }
    
    router.refresh();
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
    <>
      <ConfirmDialog />
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
              onClick={() => {
                // Open in lightbox on click
                const photoIndex = photos.findIndex((p) => p.id === photo.id);
                setLightboxIndex(photoIndex);
                setLightboxOpen(true);
              }}
              onContextMenu={(e) => {
                // Right-click for selection
                e.preventDefault();
                toggleSelect(photo.id);
              }}
            >
              {url ? (
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
                    // Open in lightbox
                    const photoIndex = photos.findIndex((p) => p.id === photo.id);
                    setLightboxIndex(photoIndex);
                    setLightboxOpen(true);
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
                  disabled={isDeleting}
                  className="p-1.5 rounded-lg bg-white/20 hover:bg-destructive/80 transition-colors disabled:opacity-50"
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

      {/* Lightbox */}
      <Lightbox
        images={photos.map((photo, index) => ({
          id: photo.id,
          url: photoUrls[photo.id] || '',
          alt: photo.original_filename || `Photo ${index + 1}`,
        }))}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
    </>
  );
}
