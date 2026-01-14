'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Camera, Scan, ChevronRight, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Photo {
  id: string;
  thumbnail_path: string;
}

/**
 * Embeddable gallery widget for external websites
 */
export default function EmbedGalleryPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  
  // Get customization params
  const theme = searchParams.get('theme') || 'auto';
  const color = searchParams.get('color') || '#0A84FF';
  const type = searchParams.get('type') || 'gallery';
  const columns = parseInt(searchParams.get('columns') || '3');
  const maxPhotos = parseInt(searchParams.get('max') || '12');

  const [event, setEvent] = useState<any>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEvent();
  }, [slug]);

  async function loadEvent() {
    try {
      const res = await fetch(`/api/events/public/${slug}`);
      const data = await res.json();
      
      if (res.ok) {
        setEvent(data.event);
        setPhotos(data.photos?.slice(0, maxPhotos) || []);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }

  // Determine theme colors
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Scanner only widget
  if (type === 'scanner') {
    return (
      <div 
        className={cn(
          "p-6 rounded-xl text-center",
          isDark ? "bg-[#1C1C1E] text-white" : "bg-white text-gray-900"
        )}
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        <Scan className="h-12 w-12 mx-auto mb-4 opacity-60" />
        <h3 className="text-lg font-semibold mb-2">
          {event?.name || 'Find Your Photos'}
        </h3>
        <p className={cn("text-sm mb-4", isDark ? "text-gray-400" : "text-gray-600")}>
          Use face recognition to find all photos of you
        </p>
        <a
          href={`/e/${slug}/scan`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: color }}
        >
          <Camera className="h-5 w-5" />
          Scan Your Face
          <ExternalLink className="h-4 w-4 ml-1" />
        </a>
      </div>
    );
  }

  // Button only widget
  if (type === 'button') {
    return (
      <a
        href={`/e/${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: color, fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        <Scan className="h-5 w-5" />
        Find Your Photos
      </a>
    );
  }

  if (loading) {
    return (
      <div 
        className={cn(
          "p-8 rounded-xl text-center",
          isDark ? "bg-[#1C1C1E]" : "bg-white"
        )}
      >
        <div 
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto"
          style={{ borderColor: color, borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className={cn(
          "p-8 rounded-xl text-center",
          isDark ? "bg-[#1C1C1E] text-gray-400" : "bg-white text-gray-600"
        )}
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        <p>Unable to load gallery</p>
      </div>
    );
  }

  // Gallery widget
  return (
    <div 
      className={cn(
        "rounded-xl overflow-hidden",
        isDark ? "bg-[#1C1C1E]" : "bg-white"
      )}
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Header */}
      <div className={cn(
        "px-4 py-3 flex items-center justify-between border-b",
        isDark ? "border-gray-800" : "border-gray-100"
      )}>
        <div>
          <h3 className={cn(
            "font-semibold text-sm",
            isDark ? "text-white" : "text-gray-900"
          )}>
            {event?.name}
          </h3>
          <p className={cn(
            "text-xs",
            isDark ? "text-gray-400" : "text-gray-500"
          )}>
            {event?.photo_count || photos.length} photos
          </p>
        </div>
        <a
          href={`/e/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium flex items-center gap-1 transition-opacity hover:opacity-80"
          style={{ color }}
        >
          View All
          <ChevronRight className="h-4 w-4" />
        </a>
      </div>

      {/* Photo Grid */}
      {photos.length > 0 ? (
        <div 
          className="grid gap-1 p-1"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {photos.map((photo) => (
            <a
              key={photo.id}
              href={`/e/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="relative aspect-square group overflow-hidden"
            >
              <Image
                src={photo.thumbnail_path}
                alt="Event photo"
                fill
                className="object-cover transition-transform group-hover:scale-105"
              />
              {/* Watermark */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-black/50 rounded-lg px-2 py-1">
                  <span className="text-white text-xs">View on FaceFindr</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className={cn(
          "p-8 text-center",
          isDark ? "text-gray-400" : "text-gray-500"
        )}>
          <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Photos coming soon</p>
        </div>
      )}

      {/* CTA */}
      <div className={cn(
        "p-3 border-t",
        isDark ? "border-gray-800" : "border-gray-100"
      )}>
        <a
          href={`/e/${slug}/scan`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: color }}
        >
          <Scan className="h-4 w-4" />
          Find Your Photos
        </a>
      </div>

      {/* Branding */}
      <div className={cn(
        "px-3 py-2 text-center text-xs",
        isDark ? "text-gray-500" : "text-gray-400"
      )}>
        Powered by{' '}
        <a
          href="https://facefindr.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:underline"
          style={{ color }}
        >
          FaceFindr
        </a>
      </div>
    </div>
  );
}
