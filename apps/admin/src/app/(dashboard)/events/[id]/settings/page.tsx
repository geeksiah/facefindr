import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { supabaseAdmin } from '@/lib/supabase';

import { EventSettingsForm } from './settings-form';

interface EventSettingsPageProps {
  params: { id: string };
}

export default async function EventSettingsPage({ params }: EventSettingsPageProps) {
  const { data: event, error } = await supabaseAdmin
    .from('events')
    .select(`
      *,
      event_pricing (*)
    `)
    .eq('id', params.id)
    .single();

  if (error || !event) {
    return notFound();
  }

  const pricing = event.event_pricing?.[0];

  // Transform event data to match EventSettingsForm interface
  const eventData = {
    id: event.id,
    name: event.name,
    description: event.description || '',
    location: event.location || '',
    event_date: event.event_date || '',
    end_date: event.end_date || '',
    cover_image_url: event.cover_image_url || '',
    status: event.status,
    is_public: event.is_public,
    is_publicly_listed: event.is_publicly_listed || false,
    allow_anonymous_scan: event.allow_anonymous_scan || false,
    require_access_code: event.require_access_code || false,
    public_access_code: event.public_access_code || '',
    face_recognition_enabled: event.face_recognition_enabled || false,
    live_mode_enabled: event.live_mode_enabled || false,
    watermark_enabled: event.watermark_enabled || false,
    pricing_type: pricing?.is_free ? 'free' : (pricing?.bulk_tiers && pricing.bulk_tiers.length > 0 ? 'bulk' : 'per_photo'),
    price_per_photo: pricing?.price_per_media || 0,
    unlock_all_price: pricing?.unlock_all_price || null,
    bulk_tiers: pricing?.bulk_tiers || [],
    currency_code: pricing?.currency || event.currency_code || 'USD',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/events/${event.id}`}
          className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Event Settings</h1>
          <p className="text-sm text-muted-foreground">{event.name}</p>
        </div>
      </div>

      {/* Settings Form */}
      <EventSettingsForm event={eventData} />
    </div>
  );
}
