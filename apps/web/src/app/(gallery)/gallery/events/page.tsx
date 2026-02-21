'use client';

import {
  Calendar,
  MapPin,
  Search,
  Camera,
  Users,
  ChevronRight,
  QrCode,
  ScanLine,
  X,
  AlertCircle,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Event {
  id: string;
  name: string;
  date: string;
  location?: string;
  coverImage?: string;
  photographerName: string;
  totalPhotos: number;
  matchedPhotos: number;
  status: 'active' | 'closed' | 'expired';
}

export default function MyEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrScannerError, setQrScannerError] = useState<string | null>(null);
  const [isInitializingScanner, setIsInitializingScanner] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanInFlightRef = useRef(false);

  const refreshEvents = useCallback(async () => {
    try {
      const response = await fetch('/api/attendee/events');
      if (response.ok) {
        const data = await response.json();
        setEvents(data.events || []);
      }
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  // Keep "My Events" registration-gated: search only within events the attendee already joined.

  const joinByCode = useCallback(async (rawCode: string) => {
    const normalizedCode = rawCode.trim().toUpperCase();
    if (!normalizedCode) return false;

    setIsJoining(true);
    setJoinError(null);

    try {
      const response = await fetch('/api/events/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: normalizedCode }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Invalid access code');
      }

      await refreshEvents();
      setAccessCode('');
      setShowCodeInput(false);
      return true;
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Failed to join event');
      return false;
    } finally {
      setIsJoining(false);
    }
  }, [refreshEvents]);

  const joinByEventIdentifier = useCallback(async (rawIdentifier: string) => {
    const normalizedIdentifier = rawIdentifier.trim();
    if (!normalizedIdentifier) return false;

    setIsJoining(true);
    setJoinError(null);

    try {
      const response = await fetch('/api/events/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventSlug: normalizedIdentifier }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to join event');
      }

      await refreshEvents();
      setAccessCode('');
      setShowCodeInput(false);
      return true;
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Failed to join event');
      return false;
    } finally {
      setIsJoining(false);
    }
  }, [refreshEvents]);

  const handleJoinEvent = async () => {
    if (!accessCode.trim()) return;
    await joinByCode(accessCode.trim());
  };

  const stopQrScanner = useCallback(() => {
    if (scanTimerRef.current !== null) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    scanInFlightRef.current = false;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const handleQrPayload = useCallback(
    async (rawValue: string) => {
      const trimmed = rawValue.trim();
      if (!trimmed) return;

      stopQrScanner();
      setShowQrScanner(false);
      setQrScannerError(null);

      const directCode = trimmed.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (/^[A-Z0-9]{4,12}$/.test(directCode)) {
        const joined = await joinByCode(directCode);
        if (joined) return;
        setShowCodeInput(true);
        setAccessCode(directCode);
        return;
      }

      try {
        const parsed = new URL(trimmed);
        const queryCode = (parsed.searchParams.get('code') || '').trim();
        if (/^[A-Z0-9]{4,64}$/i.test(queryCode)) {
          const joined = await joinByCode(queryCode);
          if (joined) return;
        }

        const pathParts = parsed.pathname.split('/').filter(Boolean);
        if (pathParts[0] === 'e' && pathParts[1]) {
          const eventIdentifier = decodeURIComponent(pathParts[1]).trim();
          const joinedByIdentifier = await joinByEventIdentifier(eventIdentifier);
          if (joinedByIdentifier) return;

          const eventToken = eventIdentifier.replace(/[^A-Z0-9]/gi, '').toUpperCase();
          if (/^[A-Z0-9]{6,64}$/.test(eventToken)) {
            const joined = await joinByCode(eventToken);
            if (joined) return;
          }
        }

        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          window.location.assign(trimmed);
          return;
        }
      } catch {
        // ignore URL parse errors and try app-link fallback
      }

      if (trimmed.startsWith('ferchr://') || trimmed.startsWith('facefindr://')) {
        try {
          const appUrl = new URL(trimmed);
          const path = appUrl.pathname.replace(/^\/+/, '');
          const host = appUrl.hostname.toLowerCase();

          if (host === 'event' && path) {
            const joinedByIdentifier = await joinByEventIdentifier(path);
            if (joinedByIdentifier) return;
            const eventToken = path.replace(/[^A-Z0-9]/gi, '').toUpperCase();
            if (/^[A-Z0-9]{6,64}$/.test(eventToken)) {
              const joined = await joinByCode(eventToken);
              if (joined) return;
            }
            window.location.assign(`/e/${path}`);
            return;
          }
          if ((host === 'e' || host === 's') && path) {
            window.location.assign(`/${host}/${path}`);
            return;
          }

          if (path) {
            window.location.assign(`/e/${path}`);
            return;
          }
        } catch (error) {
          console.error('Failed to parse app QR URL:', error);
        }
      }

      setShowCodeInput(true);
      setAccessCode(directCode);
    },
    [joinByCode, joinByEventIdentifier, stopQrScanner]
  );

  useEffect(() => {
    if (!showQrScanner) {
      stopQrScanner();
      return;
    }

    let isCancelled = false;
    setQrScannerError(null);
    setIsInitializingScanner(true);
    const originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const initScanner = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera is not supported in this browser.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) {
          throw new Error('Unable to initialize camera preview.');
        }
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();

        const jsQR = (await import('jsqr')).default;
        if (typeof jsQR !== 'function') {
          throw new Error('QR scanner engine failed to load.');
        }

        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          throw new Error('Unable to start QR scanner.');
        }

        const decodeFrame = async () => {
          if (isCancelled || scanInFlightRef.current) return;
          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth < 60 || video.videoHeight < 60) {
            return;
          }

          scanInFlightRef.current = true;
          try {
            const maxDimension = 960;
            const sourceWidth = video.videoWidth;
            const sourceHeight = video.videoHeight;
            const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
            const width = Math.max(320, Math.round(sourceWidth * scale));
            const height = Math.max(240, Math.round(sourceHeight * scale));

            if (canvas.width !== width || canvas.height !== height) {
              canvas.width = width;
              canvas.height = height;
            }

            context.drawImage(video, 0, 0, width, height);

            const tryDecode = (sx: number, sy: number, sw: number, sh: number): string | null => {
              if (sw < 80 || sh < 80) return null;
              const imageData = context.getImageData(sx, sy, sw, sh);
              const result = jsQR(imageData.data, sw, sh, { inversionAttempts: 'attemptBoth' });
              return result?.data || null;
            };

            let qrValue = tryDecode(0, 0, width, height);
            if (!qrValue) {
              const cropRatios = [0.85, 0.7, 0.55];
              for (const ratio of cropRatios) {
                const cropWidth = Math.floor(width * ratio);
                const cropHeight = Math.floor(height * ratio);
                const startX = Math.floor((width - cropWidth) / 2);
                const startY = Math.floor((height - cropHeight) / 2);
                qrValue = tryDecode(startX, startY, cropWidth, cropHeight);
                if (qrValue) break;
              }
            }

            if (qrValue) {
              await handleQrPayload(qrValue);
            }
          } finally {
            scanInFlightRef.current = false;
          }
        };

        await decodeFrame();
        scanTimerRef.current = setInterval(() => {
          void decodeFrame();
        }, 220);
      } catch (error: any) {
        console.error('QR scanner initialization failed:', error);
        setQrScannerError(error?.message || 'Failed to start QR scanner.');
      } finally {
        setIsInitializingScanner(false);
      }
    };

    initScanner();

    return () => {
      isCancelled = true;
      document.body.style.overflow = originalBodyOverflow;
      stopQrScanner();
    };
  }, [showQrScanner, handleQrPayload, stopQrScanner]);

  const filteredEvents = events.filter(
    (event) =>
      event.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.location?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const qrScannerOverlay =
    showQrScanner && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[120] bg-black/85"
            style={{ position: 'fixed', inset: 0, top: 0, left: 0, width: '100dvw', height: '100dvh', margin: 0 }}
          >
            <div className="mx-auto flex h-full w-full items-center justify-center p-3 sm:p-4">
              <div className="max-h-full w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <h3 className="font-semibold text-foreground">Scan Event QR Code</h3>
                    <p className="text-xs text-secondary">Point your camera at a Ferchr QR code.</p>
                  </div>
                  <button
                    onClick={() => {
                      stopQrScanner();
                      setShowQrScanner(false);
                    }}
                    className="rounded-lg p-2 hover:bg-muted"
                  >
                    <X className="h-4 w-4 text-foreground" />
                  </button>
                </div>

                <div className="relative bg-black">
                  <video
                    ref={videoRef}
                    className="h-[52vh] min-h-[260px] max-h-[420px] w-full object-cover"
                    autoPlay
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  {isInitializingScanner && (
                    <div className="absolute inset-0 flex items-center justify-center text-white">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    </div>
                  )}
                </div>

                {qrScannerError && (
                  <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span>{qrScannerError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const statusStyles = {
    active: 'bg-success/10 text-success',
    closed: 'bg-warning/10 text-warning',
    expired: 'bg-muted text-muted-foreground',
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Events</h1>
          <p className="text-secondary mt-1">Events where your photos were found</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex">
          <Button
            variant="secondary"
            onClick={() => setShowQrScanner(true)}
            className="w-full sm:w-auto"
          >
            <ScanLine className="mr-2 h-4 w-4" />
            Scan QR
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowCodeInput(!showCodeInput)}
            className="w-full sm:w-auto"
          >
            <QrCode className="mr-2 h-4 w-4" />
            Enter Event Code
          </Button>
        </div>
      </div>

      {qrScannerOverlay}

      {/* Join Event by Code */}
      {showCodeInput && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-foreground">Join an Event</h3>
            <p className="text-sm text-secondary mt-1">
              Enter the access code provided by the creator
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              placeholder="Enter access code"
              className="uppercase font-mono"
              maxLength={12}
            />
            <Button
              variant="primary"
              onClick={handleJoinEvent}
              isLoading={isJoining}
              className="w-full sm:w-auto"
            >
              Join
            </Button>
          </div>
          {joinError && <p className="text-sm text-destructive">{joinError}</p>}
        </div>
      )}

      {/* Search */}
      {events.length > 0 && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events..."
            className="pl-11"
          />
        </div>
      )}

      {/* Events List */}
      {filteredEvents.length > 0 ? (
        <div className="space-y-3">
          {filteredEvents.map((event) => (
            <Link
              key={event.id}
              href={`/gallery/events/${event.id}`}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 transition-all hover:border-accent/20 hover:shadow-soft sm:flex-row sm:items-center"
            >
              {/* Event Cover */}
              {event.coverImage ? (
                <Image
                  src={event.coverImage}
                  alt={event.name}
                  width={80}
                  height={80}
                  className="h-36 w-full rounded-xl object-cover sm:h-20 sm:w-20 sm:flex-shrink-0"
                />
              ) : (
                <div className="flex h-36 w-full items-center justify-center rounded-xl bg-muted sm:h-20 sm:w-20 sm:flex-shrink-0">
                  <Calendar className="h-8 w-8 text-muted-foreground" />
                </div>
              )}

              {/* Event Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="font-semibold text-foreground truncate">{event.name}</h3>
                  <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[event.status]}`}>
                    {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-secondary">
                  <span>{event.date}</span>
                  {event.location && (
                    <>
                      <span className="text-muted-foreground">|</span>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{event.location}</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                  <div className="flex items-center gap-1 text-secondary">
                    <Camera className="h-3.5 w-3.5" />
                    <span>{event.photographerName}</span>
                  </div>
                  <div className="flex items-center gap-1 text-accent">
                    <Users className="h-3.5 w-3.5" />
                    <span>{event.matchedPhotos}/{event.totalPhotos} matched</span>
                  </div>
                </div>
              </div>

              <ChevronRight className="hidden h-5 w-5 flex-shrink-0 self-center text-secondary sm:block" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-6">
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-3">No events yet</h2>
          <p className="text-secondary max-w-md mx-auto mb-6">
            {searchQuery
              ? 'No events match your search'
              : "You haven't joined any events yet. Enter an event code or scan your face to find photos."}
          </p>
          {!searchQuery && (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="secondary" onClick={() => setShowCodeInput(true)}>
                <QrCode className="mr-2 h-4 w-4" />
                Enter Code
              </Button>
              <Button asChild variant="primary">
                <Link href="/gallery/scan">Scan My Face</Link>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
