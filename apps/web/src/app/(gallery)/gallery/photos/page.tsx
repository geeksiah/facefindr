'use client';

import { useState, useEffect } from 'react';
import { 
  Image as ImageIcon, 
  Download, 
  Filter, 
  Grid, 
  List,
  Calendar,
  Camera,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Lightbox } from '@/components/ui/lightbox';
import { useToast } from '@/components/ui/toast';
import { formatEventDateDisplay } from '@/lib/events/time';
import { createClient } from '@/lib/supabase/client';

interface Photo {
  id: string;
  thumbnailUrl: string;
  fullUrl: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  eventStartAtUtc: string | null;
  eventTimezone: string | null;
  photographerName: string;
}

export default function PhotosPage() {
  const toast = useToast();
  const supabase = createClient();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);

  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all photos the user owns (via entitlements)
      const { data: entitlements, error } = await supabase
        .from('entitlements')
        .select(`
          media:media_id (
            id,
            thumbnail_path,
            storage_path,
            event:event_id (
              id,
              name,
              event_date,
              event_timezone,
              photographer:photographer_id (
                display_name
              )
            )
          )
        `)
        .eq('attendee_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading photos:', error);
        return;
      }

      const photoList: Photo[] = (entitlements || [])
        .filter((e: any) => e.media)
        .map((e: any) => ({
          id: e.media.id,
          thumbnailUrl: e.media.thumbnail_path 
            ? supabase.storage.from('media').getPublicUrl(e.media.thumbnail_path).data.publicUrl
            : '',
          fullUrl: e.media.storage_path,
          eventId: e.media.event?.id || '',
          eventName: e.media.event?.name || 'Unknown Event',
          eventDate: e.media.event?.event_date || '',
          eventStartAtUtc: e.media.event?.event_start_at_utc || null,
          eventTimezone: e.media.event?.event_timezone || null,
          photographerName: e.media.event?.photographer?.display_name || 'Unknown',
        }));

      setPhotos(photoList);
    } catch (err) {
      console.error('Failed to load photos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadPhoto = async (photo: Photo) => {
    try {
      const { data } = await supabase.storage.from('media').createSignedUrl(photo.fullUrl, 3600);
      if (data?.signedUrl) {
        const a = document.createElement('a');
        a.href = data.signedUrl;
        a.download = `${photo.eventName}-${photo.id}.jpg`;
        a.click();
        toast.success('Download Started', 'Your photo is downloading...');
      }
    } catch (err) {
      toast.error('Download Failed', 'Unable to download photo');
    }
  };

  // Group photos by event
  const groupedPhotos = photos.reduce((acc, photo) => {
    if (!acc[photo.eventId]) {
      acc[photo.eventId] = {
        eventName: photo.eventName,
        eventDate: photo.eventDate,
        eventStartAtUtc: photo.eventStartAtUtc,
        eventTimezone: photo.eventTimezone,
        photographerName: photo.photographerName,
        photos: [],
      };
    }
    acc[photo.eventId].photos.push(photo);
    return acc;
  }, {} as Record<string, {
    eventName: string;
    eventDate: string;
    eventStartAtUtc: string | null;
    eventTimezone: string | null;
    photographerName: string;
    photos: Photo[];
  }>);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-muted-foreground">Loading photos...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Photos</h1>
          <p className="text-secondary mt-1">{photos.length} photos from {Object.keys(groupedPhotos).length} events</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'grid' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setViewMode('grid')}
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Empty State */}
      {photos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No photos yet</h3>
          <p className="text-secondary mb-4">
            Find and purchase photos from events you've attended.
          </p>
          <Button asChild>
            <Link href="/gallery/scan">Find Your Photos</Link>
          </Button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View - Grouped by Event */
        Object.entries(groupedPhotos).map(([eventId, group]) => (
          <div key={eventId} className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-foreground">{group.eventName}</h2>
                <div className="flex items-center gap-3 text-sm text-secondary mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatEventDateDisplay(
                      {
                        event_date: group.eventDate,
                        event_start_at_utc: group.eventStartAtUtc,
                        event_timezone: group.eventTimezone,
                      },
                      'en-US'
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5" />
                    {group.photographerName}
                  </span>
                </div>
              </div>
              <Link 
                href={`/gallery/events/${eventId}`}
                className="text-sm text-accent hover:underline"
              >
                View Event
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {group.photos.map((photo, index) => (
                <div
                  key={photo.id}
                  className="group relative aspect-square rounded-xl overflow-hidden border border-border cursor-pointer"
                  onClick={() => setSelectedPhoto(photos.findIndex(p => p.id === photo.id))}
                >
                  {photo.thumbnailUrl ? (
                    <Image
                      src={photo.thumbnailUrl}
                      alt="Photo"
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full bg-muted">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="bg-white/90 hover:bg-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadPhoto(photo);
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        /* List View */
        <div className="space-y-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                {photo.thumbnailUrl ? (
                  <Image
                    src={photo.thumbnailUrl}
                    alt="Photo"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full bg-muted">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{photo.eventName}</p>
                <p className="text-sm text-secondary">
                  {formatEventDateDisplay(
                    {
                      event_date: photo.eventDate,
                      event_start_at_utc: photo.eventStartAtUtc,
                      event_timezone: photo.eventTimezone,
                    },
                    'en-US'
                  )} {' - '} {photo.photographerName}
                </p>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => downloadPhoto(photo)}
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selectedPhoto !== null && (
        <Lightbox
          images={photos.map((p) => ({ id: p.id, url: p.fullUrl, alt: p.eventName }))}
          initialIndex={selectedPhoto}
          isOpen={selectedPhoto !== null}
          onClose={() => setSelectedPhoto(null)}
        />
      )}
    </div>
  );
}
