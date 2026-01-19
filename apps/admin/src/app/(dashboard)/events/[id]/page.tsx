import {
  ArrowLeft,
  Calendar,
  MapPin,
  Globe,
  Lock,
  Settings,
  Image,
  Users,
  Scan,
  Radio,
  Eye,
  DollarSign,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { supabaseAdmin } from '@/lib/supabase';
import { formatDate, formatCurrency, formatNumber } from '@/lib/utils';

interface EventPageProps {
  params: { id: string };
}

export default async function EventDetailPage({ params }: EventPageProps) {
  const { data: event, error } = await supabaseAdmin
    .from('events')
    .select(`
      *,
      photographers (id, display_name, email, business_name),
      event_pricing (*),
      media (id, storage_path, thumbnail_path, original_filename, file_size, created_at),
      transactions (id, gross_amount, status, created_at)
    `)
    .eq('id', params.id)
    .single();

  if (error || !event) {
    return notFound();
  }

  const pricing = event.event_pricing?.[0];
  const mediaCount = event.media?.length || 0;
  const revenue = event.transactions
    ?.filter((t: any) => t.status === 'succeeded')
    .reduce((sum: number, t: any) => sum + (t.gross_amount || 0), 0) || 0;

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-500/10 text-gray-500',
    active: 'bg-green-500/10 text-green-500',
    closed: 'bg-blue-500/10 text-blue-500',
    archived: 'bg-yellow-500/10 text-yellow-500',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/events"
            className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{event.name}</h1>
            <p className="text-muted-foreground mt-1">
              Event details and management
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/events/${event.id}/settings`}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Link>
          </Button>
        </div>
      </div>

      {/* Event Info */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="font-semibold text-foreground mb-4">Event Information</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium capitalize mt-1 ${
                  statusColors[event.status]
                }`}>
                  {event.status}
                </span>
              </div>
              {event.description && (
                <div>
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p className="text-foreground mt-1">{event.description}</p>
                </div>
              )}
              {event.event_date && (
                <div>
                  <p className="text-sm text-muted-foreground">Event Date</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-foreground">{formatDate(event.event_date)}</span>
                  </div>
                </div>
              )}
              {event.location && (
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-foreground">{event.location}</span>
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Visibility</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {event.is_public ? (
                    <>
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">Public</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">Private</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="font-semibold text-foreground mb-4">Photographer</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="text-foreground mt-1">
                  {event.photographers?.display_name || event.photographers?.business_name || 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="text-foreground mt-1">{event.photographers?.email || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-accent/10 p-2.5">
              <Image className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Photos</p>
              <p className="text-2xl font-bold text-foreground">{formatNumber(mediaCount)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2.5">
              <DollarSign className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Revenue</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(revenue)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2.5">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Transactions</p>
              <p className="text-2xl font-bold text-foreground">
                {formatNumber(event.transactions?.length || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2.5">
              <Scan className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Face Recognition</p>
              <p className="text-2xl font-bold text-foreground">
                {event.face_recognition_enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing */}
      {pricing && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground mb-4">Pricing</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Type</p>
              <p className="text-foreground mt-1 capitalize">
                {pricing.pricing_type || (pricing.is_free ? 'free' : 'per_photo')}
              </p>
            </div>
            {!pricing.is_free && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Price per Photo</p>
                  <p className="text-foreground mt-1">
                    {formatCurrency(pricing.price_per_media || 0)}
                  </p>
                </div>
                {pricing.unlock_all_price && (
                  <div>
                    <p className="text-sm text-muted-foreground">Unlock All Price</p>
                    <p className="text-foreground mt-1">
                      {formatCurrency(pricing.unlock_all_price)}
                    </p>
                  </div>
                )}
              </>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Currency</p>
              <p className="text-foreground mt-1">{pricing.currency || 'USD'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Features */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Features</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3">
            <Scan className={`h-5 w-5 ${event.face_recognition_enabled ? 'text-green-500' : 'text-muted-foreground'}`} />
            <div>
              <p className="text-sm font-medium text-foreground">Face Recognition</p>
              <p className="text-xs text-muted-foreground">
                {event.face_recognition_enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Radio className={`h-5 w-5 ${event.live_mode_enabled ? 'text-green-500' : 'text-muted-foreground'}`} />
            <div>
              <p className="text-sm font-medium text-foreground">Live Mode</p>
              <p className="text-xs text-muted-foreground">
                {event.live_mode_enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Users className={`h-5 w-5 ${event.attendee_access_enabled ? 'text-green-500' : 'text-muted-foreground'}`} />
            <div>
              <p className="text-sm font-medium text-foreground">Attendee Access</p>
              <p className="text-xs text-muted-foreground">
                {event.attendee_access_enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Photos Section */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">Photos</h2>
          <p className="text-sm text-muted-foreground">
            {formatNumber(mediaCount)} {mediaCount === 1 ? 'photo' : 'photos'}
          </p>
        </div>
        
        {mediaCount === 0 ? (
          <div className="text-center py-12">
            <Image className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground">No photos uploaded yet</p>
          </div>
        ) : (
          <PhotosGrid photos={event.media || []} />
        )}
      </div>
    </div>
  );
}

// Photos Grid Component
async function PhotosGrid({ photos }: { photos: any[] }) {
  // Generate signed URLs for photos with error handling
  // Process in batches to avoid overwhelming the storage API
  const batchSize = 20;
  const photosWithUrls: Array<{ id: string; url: string | null; original_filename: string | null }> = [];
  
  for (let i = 0; i < photos.length; i += batchSize) {
    const batch = photos.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async (photo) => {
        try {
          const path = photo.thumbnail_path || photo.storage_path;
          if (!path) {
            return { id: photo.id, url: null, original_filename: photo.original_filename };
          }
          
          const { data, error } = await supabaseAdmin.storage
            .from('media')
            .createSignedUrl(path, 3600); // 1 hour expiry
          
          if (error) {
            console.error(`Error creating signed URL for photo ${photo.id}:`, error);
            return { id: photo.id, url: null, original_filename: photo.original_filename };
          }
          
          return {
            id: photo.id,
            url: data?.signedUrl || null,
            original_filename: photo.original_filename,
          };
        } catch (error) {
          console.error(`Error processing photo ${photo.id}:`, error);
          return { id: photo.id, url: null, original_filename: photo.original_filename };
        }
      })
    );
    
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        photosWithUrls.push(result.value);
      } else {
        console.error('Photo processing failed:', result.reason);
      }
    });
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {photosWithUrls.map((photo) => (
        <div
          key={photo.id}
          className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted"
        >
          {photo.url ? (
            <img
              src={photo.url}
              alt={photo.original_filename || 'Photo'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Image className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <Eye className="h-5 w-5 text-white" />
          </div>
        </div>
      ))}
    </div>
  );
}
