'use client';

import { Image as ImageIcon, Trash2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast, useConfirm } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

import { deletePhoto } from './actions';

interface Photo {
  id: string;
  storage_path: string;
  thumbnail_path: string | null;
  original_filename: string | null;
  file_size: number;
  created_at: string;
}

interface EventGalleryClientProps {
  eventId: string;
  photos: Photo[];
  photoUrls: Record<string, string>;
}

export function EventGalleryClient({ eventId, photos, photoUrls: initialPhotoUrls }: EventGalleryClientProps) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

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
    
    try {
      const result = await deletePhoto(photoId, eventId);
      
      if (result.error) {
        toast.error('Delete Failed', result.error);
      } else {
        toast.success('Photo Deleted', 'The photo has been successfully deleted.');
        router.refresh();
      }
    } catch (error) {
      toast.error('Delete Failed', 'An unexpected error occurred.');
    } finally {
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
  };

  const handleBulkDelete = async () => {
    const confirmed = await confirm({
      title: `Delete ${selectedPhotos.size} Photos`,
      message: `Are you sure you want to delete ${selectedPhotos.size} photo${selectedPhotos.size > 1 ? 's' : ''}? This action cannot be undone.`,
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
      
      try {
        const result = await deletePhoto(photoId, eventId);
        
        if (result.error) {
          errorCount++;
        } else {
          successCount++;
        }
      } catch {
        errorCount++;
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(photoId);
          return next;
        });
      }
    }

    setSelectedPhotos(new Set());
    router.refresh();

    if (errorCount === 0) {
      toast.success('Photos Deleted', `${successCount} photo${successCount > 1 ? 's' : ''} deleted successfully.`);
    } else if (successCount > 0) {
      toast.warning('Partial Success', `${successCount} deleted, ${errorCount} failed.`);
    } else {
      toast.error('Delete Failed', 'Failed to delete photos. Please try again.');
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
                disabled={deletingIds.size > 0}
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
            const url = initialPhotoUrls[photo.id];

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
                      window.open(url, '_blank');
                    }}
                    className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                  >
                    <ImageIcon className="h-4 w-4 text-white" />
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
      </div>
    </>
  );
}
