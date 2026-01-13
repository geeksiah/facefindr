'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Globe,
  Lock,
  Scan,
  Radio,
  Users,
  AlertCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { createEventSchema, type CreateEventInput } from '@/lib/validations/event';
import { createEvent } from '../actions';
import { cn } from '@/lib/utils';

// ============================================
// TOGGLE SWITCH ROW COMPONENT
// ============================================

interface ToggleSwitchRowProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
  description: string;
  icon: React.ElementType;
}

function ToggleSwitchRow({ enabled, onChange, label, description, icon: Icon }: ToggleSwitchRowProps) {
  return (
    <div className="flex items-start gap-4">
      <div className={cn(
        'rounded-xl p-2.5 transition-colors',
        enabled ? 'bg-accent/10' : 'bg-muted'
      )}>
        <Icon className={cn(
          'h-5 w-5 transition-colors',
          enabled ? 'text-accent' : 'text-muted-foreground'
        )} />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="font-medium text-foreground">{label}</p>
          <Switch
            checked={enabled}
            onCheckedChange={onChange}
          />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ============================================
// CREATE EVENT PAGE
// ============================================

export default function CreateEventPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateEventInput>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      name: '',
      description: '',
      location: '',
      eventDate: '',
      isPublic: false,
      faceRecognitionEnabled: true,
      liveModeEnabled: false,
      attendeeAccessEnabled: true,
    },
  });

  const isPublic = watch('isPublic');
  const faceRecognitionEnabled = watch('faceRecognitionEnabled');
  const liveModeEnabled = watch('liveModeEnabled');
  const attendeeAccessEnabled = watch('attendeeAccessEnabled');

  const onSubmit = async (data: CreateEventInput) => {
    setIsLoading(true);
    setError(null);

    const result = await createEvent(data);

    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
    }
    // If successful, the action will redirect
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/events"
          className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Create New Event</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set up a new photo event for your attendees
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Basic Information</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell us about your event
          </p>

          <div className="mt-6 space-y-5">
            {/* Event Name */}
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-foreground">
                Event Name *
              </label>
              <Input
                {...register('name')}
                id="name"
                placeholder="e.g., Summer Wedding 2024"
                error={errors.name?.message}
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="description"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Description
              </label>
              <textarea
                {...register('description')}
                id="description"
                rows={3}
                placeholder="Add details about your event..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-colors"
              />
              {errors.description && (
                <p className="mt-1 text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>

            {/* Location */}
            <div>
              <label htmlFor="location" className="mb-1.5 block text-sm font-medium text-foreground">
                Location
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  {...register('location')}
                  id="location"
                  placeholder="e.g., Grand Ballroom, NYC"
                  className="pl-10"
                  error={errors.location?.message}
                />
              </div>
            </div>

            {/* Event Date */}
            <div>
              <label htmlFor="eventDate" className="mb-1.5 block text-sm font-medium text-foreground">
                Event Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  {...register('eventDate')}
                  id="eventDate"
                  type="date"
                  className="pl-10"
                  error={errors.eventDate?.message}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Privacy Settings */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Privacy & Access</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Control who can access your event
          </p>

          <div className="mt-6 space-y-6">
            {/* Public/Private Toggle */}
            <div className="flex items-start gap-4">
              <div className={cn(
                'rounded-xl p-2.5 transition-colors',
                isPublic ? 'bg-success/10' : 'bg-muted'
              )}>
                {isPublic ? (
                  <Globe className="h-5 w-5 text-success" />
                ) : (
                  <Lock className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">
                    {isPublic ? 'Public Event' : 'Private Event'}
                  </p>
                  <Switch
                    checked={isPublic}
                    onCheckedChange={(checked) => setValue('isPublic', checked)}
                  />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isPublic
                    ? 'Anyone with the link can view and access photos'
                    : 'Only people with an access link can view photos'}
                </p>
              </div>
            </div>

            <ToggleSwitchRow
              enabled={attendeeAccessEnabled}
              onChange={(v) => setValue('attendeeAccessEnabled', v)}
              label="Attendee Access"
              description="Allow attendees to find and view their photos"
              icon={Users}
            />
          </div>
        </div>

        {/* Feature Settings */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Features</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure event features
          </p>

          <div className="mt-6 space-y-6">
            <ToggleSwitchRow
              enabled={faceRecognitionEnabled}
              onChange={(v) => setValue('faceRecognitionEnabled', v)}
              label="Face Recognition"
              description="Enable AI face matching for attendees to find their photos"
              icon={Scan}
            />

            <ToggleSwitchRow
              enabled={liveModeEnabled}
              onChange={(v) => setValue('liveModeEnabled', v)}
              label="Live Mode"
              description="Allow real-time photo uploads during the event"
              icon={Radio}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/events">Cancel</Link>
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Create Event
          </Button>
        </div>
      </form>
    </div>
  );
}
