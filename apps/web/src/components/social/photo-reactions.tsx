'use client';

import { Heart, Flame, Sparkles, Star } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface ReactionCounts {
  love: number;
  fire: number;
  amazing: number;
  beautiful: number;
}

interface PhotoReactionsProps {
  mediaId: string;
  variant?: 'compact' | 'full';
  className?: string;
}

export function PhotoReactions({ mediaId, variant = 'compact', className }: PhotoReactionsProps) {
  const supabase = createClient();
  const [counts, setCounts] = useState<ReactionCounts>({ love: 0, fire: 0, amazing: 0, beautiful: 0 });
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reacting, setReacting] = useState(false);

  useEffect(() => {
    loadReactions();
  }, [mediaId]);

  // Subscribe to real-time reaction updates
  useRealtimeSubscription({
    table: 'photo_reactions',
    filter: `media_id=eq.${mediaId}`,
    onUpdate: () => loadReactions(),
  });

  const loadReactions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const response = await fetch(`/api/media/${mediaId}/reactions`);
      if (response.ok) {
        const data = await response.json();
        setCounts(data.counts);
        if (user) {
          setUserReaction(data.userReaction);
        }
      }
    } catch (error) {
      console.error('Failed to load reactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReaction = async (reactionType: string) => {
    if (reacting) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Redirect to login or show auth prompt
      return;
    }

    setReacting(true);
    try {
      const isRemoving = userReaction === reactionType;

      const method = isRemoving ? 'DELETE' : 'POST';
      const body = isRemoving ? undefined : JSON.stringify({ reaction: reactionType });

      const response = await fetch(`/api/media/${mediaId}/reactions`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body,
      });

      if (response.ok) {
        const data = await response.json();
        setCounts(data.counts);
        setUserReaction(isRemoving ? null : reactionType);
      }
    } catch (error) {
      console.error('Failed to react:', error);
    } finally {
      setReacting(false);
    }
  };

  const reactions = [
    { type: 'love', icon: Heart, label: 'Love', color: 'text-red-500' },
    { type: 'fire', icon: Flame, label: 'Fire', color: 'text-orange-500' },
    { type: 'amazing', icon: Sparkles, label: 'Amazing', color: 'text-purple-500' },
    { type: 'beautiful', icon: Star, label: 'Beautiful', color: 'text-yellow-500' },
  ];

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {reactions.map(({ type, icon: Icon, color }) => (
          <Button
            key={type}
            variant="ghost"
            size="sm"
            className={cn('h-8 w-8 p-0', color)}
            disabled
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
      </div>
    );
  }

  if (variant === 'compact') {
    const totalReactions = counts.love + counts.fire + counts.amazing + counts.beautiful;
    if (totalReactions === 0 && !userReaction) {
      return null; // Don't show if no reactions and user hasn't reacted
    }

    return (
      <div className={cn('flex items-center gap-1', className)}>
        {reactions
          .filter(({ type }) => counts[type as keyof ReactionCounts] > 0 || userReaction === type)
          .map(({ type, icon: Icon, color }) => {
            const count = counts[type as keyof ReactionCounts];
            const isActive = userReaction === type;
            
            return (
              <Button
                key={type}
                variant="ghost"
                size="sm"
                onClick={() => handleReaction(type)}
                disabled={reacting}
                className={cn(
                  'h-8 px-2 gap-1',
                  isActive && 'bg-accent/10',
                  color
                )}
              >
                <Icon className={cn('h-4 w-4', isActive && 'fill-current')} />
                {count > 0 && <span className="text-xs">{count}</span>}
              </Button>
            );
          })}
      </div>
    );
  }

  // Full variant with all reactions
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {reactions.map(({ type, icon: Icon, label, color }) => {
        const count = counts[type as keyof ReactionCounts];
        const isActive = userReaction === type;

        return (
          <Button
            key={type}
            variant="ghost"
            size="sm"
            onClick={() => handleReaction(type)}
            disabled={reacting}
            className={cn(
              'flex items-center gap-2 h-9 px-3',
              isActive && 'bg-accent/10',
              color
            )}
            title={label}
          >
            <Icon className={cn('h-4 w-4', isActive && 'fill-current')} />
            {variant === 'full' && (
              <>
                <span className="text-sm font-medium">{label}</span>
                {count > 0 && <span className="text-xs text-secondary">({count})</span>}
              </>
            )}
          </Button>
        );
      })}
    </div>
  );
}
