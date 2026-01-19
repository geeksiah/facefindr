'use client';

/**
 * Ad Placement Component
 * 
 * Invisible strategic ad spot that only shows when admin has an active campaign.
 * Tracks impressions and clicks automatically.
 */

import { X } from 'lucide-react';
import { useState, useEffect } from 'react';

interface AdCampaign {
  id: string;
  headline: string | null;
  bodyText: string | null;
  imageUrl: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  accentColor: string | null;
}

interface AdPlacementProps {
  placement: string;
  className?: string;
  dismissible?: boolean;
  variant?: 'banner' | 'sidebar' | 'inline' | 'bottom-sheet';
}

export function AdPlacement({
  placement,
  className = '',
  dismissible = true,
  variant = 'banner',
}: AdPlacementProps) {
  const [ad, setAd] = useState<AdCampaign | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch ad for this placement
  useEffect(() => {
    async function fetchAd() {
      try {
        // Check if dismissed in session
        const dismissedKey = `ad_dismissed_${placement}`;
        if (sessionStorage.getItem(dismissedKey)) {
          setIsDismissed(true);
          setIsLoading(false);
          return;
        }

        const response = await fetch(`/api/ads?placement=${placement}`);
        if (response.ok) {
          const data = await response.json();
          setAd(data.ad);
        }
      } catch (error) {
        console.error('Failed to fetch ad:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAd();
  }, [placement]);

  // Track click
  const handleClick = async () => {
    if (!ad) return;

    try {
      await fetch('/api/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: ad.id }),
      });
    } catch (error) {
      console.error('Failed to track click:', error);
    }

    // Navigate to CTA URL
    if (ad.ctaUrl) {
      window.open(ad.ctaUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Dismiss ad
  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDismissed(true);
    sessionStorage.setItem(`ad_dismissed_${placement}`, 'true');
  };

  // Don't render if no ad, dismissed, or still loading
  if (isLoading || !ad || isDismissed) {
    return null;
  }

  // Variant-specific styles
  const variantStyles = {
    banner: 'w-full py-3 px-4',
    sidebar: 'w-full p-4 rounded-2xl',
    inline: 'w-full py-3 px-4 rounded-xl my-4',
    'bottom-sheet': 'fixed bottom-0 left-0 right-0 z-50 py-3 px-4 safe-area-inset-bottom',
  };

  const baseStyles = variantStyles[variant] || variantStyles.banner;

  return (
    <div
      className={`relative transition-all duration-300 ${baseStyles} ${className}`}
      style={{
        backgroundColor: ad.backgroundColor || 'var(--accent)',
        color: ad.textColor || 'white',
      }}
    >
      <div 
        className="flex items-center gap-4 cursor-pointer"
        onClick={handleClick}
      >
        {/* Image (if provided) */}
        {ad.imageUrl && (
          <div className="flex-shrink-0">
            <img
              src={ad.imageUrl}
              alt=""
              className="h-10 w-10 rounded-lg object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {ad.headline && (
            <p className="font-semibold text-sm truncate">
              {ad.headline}
            </p>
          )}
          {ad.bodyText && (
            <p className="text-sm opacity-90 truncate">
              {ad.bodyText}
            </p>
          )}
        </div>

        {/* CTA Button */}
        {ad.ctaText && (
          <button
            className="flex-shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
            style={{
              backgroundColor: ad.accentColor || 'rgba(255,255,255,0.2)',
              color: ad.textColor || 'white',
            }}
          >
            {ad.ctaText}
          </button>
        )}

        {/* Dismiss Button */}
        {dismissible && (
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 rounded-lg opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Small "Ad" label */}
      <span className="absolute top-1 right-1 text-[9px] opacity-50 uppercase tracking-wider">
        Ad
      </span>
    </div>
  );
}

// Specific placement components for convenience
export function DashboardBanner({ className }: { className?: string }) {
  return <AdPlacement placement="dashboard_banner" variant="banner" className={className} />;
}

export function DashboardSidebar({ className }: { className?: string }) {
  return <AdPlacement placement="dashboard_sidebar" variant="sidebar" className={className} />;
}

export function GalleryBanner({ className }: { className?: string }) {
  return <AdPlacement placement="gallery_banner" variant="banner" className={className} />;
}

export function GalleryInline({ className }: { className?: string }) {
  return <AdPlacement placement="gallery_inline" variant="inline" className={className} />;
}

export function CheckoutSidebar({ className }: { className?: string }) {
  return <AdPlacement placement="checkout_sidebar" variant="sidebar" className={className} />;
}

export function EventPageBanner({ className }: { className?: string }) {
  return <AdPlacement placement="event_page_banner" variant="banner" className={className} />;
}

export function SettingsInline({ className }: { className?: string }) {
  return <AdPlacement placement="settings_inline" variant="inline" className={className} />;
}

export function MobileBottomSheet({ className }: { className?: string }) {
  return (
    <div className="lg:hidden">
      <AdPlacement placement="mobile_bottom_sheet" variant="bottom-sheet" className={className} />
    </div>
  );
}
