'use client';

import { Star } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface RatingStats {
  average_rating: number;
  total_ratings: number;
  rating_breakdown?: Record<string, number>;
}

interface RatingsDisplayProps {
  photographerId: string;
  showRatingButton?: boolean;
  eventId?: string;
  variant?: 'compact' | 'full';
  className?: string;
}

export function RatingsDisplay({
  photographerId,
  showRatingButton = false,
  eventId,
  variant = 'compact',
  className,
}: RatingsDisplayProps) {
  const supabase = createClient();
  const [stats, setStats] = useState<RatingStats | null>(null);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);

  useEffect(() => {
    loadRatingStats();
    loadUserRating();
  }, [photographerId]);

  // Subscribe to real-time rating updates
  useRealtimeSubscription({
    table: 'photographer_ratings',
    filter: `photographer_id=eq.${photographerId}`,
    onChange: () => {
      loadRatingStats();
      loadUserRating();
    },
  });

  const loadRatingStats = async () => {
    try {
      const response = await fetch(`/api/creators/${photographerId}/ratings/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load rating stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserRating = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const response = await fetch(`/api/creators/${photographerId}/ratings/my`);
      if (response.ok) {
        const data = await response.json();
        setUserRating(data.rating || null);
      }
    } catch (error) {
      console.error('Failed to load user rating:', error);
    }
  };

  const handleRate = async (rating: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Redirect to login or show auth prompt
      return;
    }

    setRatingLoading(true);
    try {
      const response = await fetch(`/api/creators/${photographerId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          eventId,
          isPublic: true,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setUserRating(data.rating.rating);
        await loadRatingStats();
        setShowRatingModal(false);
      } else {
        const error = await response.json();
        console.error('Failed to rate:', error);
      }
    } catch (error) {
      console.error('Rate error:', error);
    } finally {
      setRatingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className="h-4 w-4 text-muted-foreground" />
        ))}
      </div>
    );
  }

  if (!stats || stats.total_ratings === 0) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} className="h-4 w-4 text-muted-foreground" />
          ))}
        </div>
        <span className="text-sm text-secondary">No ratings yet</span>
        {showRatingButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRatingModal(true)}
          >
            Rate
          </Button>
        )}
      </div>
    );
  }

  const displayRating = hoveredStar || userRating || Math.round(stats.average_rating);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Star Display */}
      <div
        className="flex items-center gap-0.5"
        onMouseLeave={() => setHoveredStar(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => showRatingButton && handleRate(star)}
            onMouseEnter={() => showRatingButton && setHoveredStar(star)}
            disabled={ratingLoading || !showRatingButton}
            className={cn(
              'transition-colors',
              showRatingButton && 'cursor-pointer hover:scale-110',
              (ratingLoading || !showRatingButton) && 'cursor-default'
            )}
          >
            <Star
              className={cn(
                'h-4 w-4',
                star <= displayRating
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-muted-foreground'
              )}
            />
          </button>
        ))}
      </div>

      {/* Stats */}
      {variant === 'full' && (
        <>
          <span className="text-sm font-medium text-foreground">
            {stats.average_rating.toFixed(1)}
          </span>
          <span className="text-sm text-secondary">
            ({stats.total_ratings} {stats.total_ratings === 1 ? 'rating' : 'ratings'})
          </span>
        </>
      )}

      {variant === 'compact' && (
        <span className="text-sm text-secondary">
          {stats.average_rating.toFixed(1)} ({stats.total_ratings})
        </span>
      )}

      {/* Rate Button */}
      {showRatingButton && !userRating && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRatingModal(true)}
        >
          Rate
        </Button>
      )}

      {/* Rating Modal */}
      {showRatingModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 max-w-md w-full mx-4">
            <h3 className="font-semibold text-foreground mb-4">Rate Creator</h3>
            <div className="flex items-center justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => handleRate(star)}
                  onMouseEnter={() => setHoveredStar(star)}
                  disabled={ratingLoading}
                  className="transition-transform hover:scale-125"
                >
                  <Star
                    className={cn(
                      'h-8 w-8',
                      star <= (hoveredStar || 0)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-muted-foreground'
                    )}
                  />
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setShowRatingModal(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
