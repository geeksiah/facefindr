'use client';

import { Heart, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TipCreatorProps {
  photographerId: string;
  photographerName: string;
  eventId?: string;
  mediaId?: string;
  currency?: string | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  className?: string;
}

const PRESET_AMOUNTS = [200, 500, 1000]; // $2, $5, $10 in cents

export function TipCreator({
  photographerId,
  photographerName,
  eventId,
  mediaId,
  currency,
  onSuccess,
  onCancel,
  className,
}: TipCreatorProps) {
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedCurrency, setResolvedCurrency] = useState(
    typeof currency === 'string' && currency.trim()
      ? currency.trim().toUpperCase()
      : 'USD'
  );

  useEffect(() => {
    let active = true;

    const explicitCurrency =
      typeof currency === 'string' && currency.trim()
        ? currency.trim().toUpperCase()
        : null;

    if (explicitCurrency) {
      setResolvedCurrency(explicitCurrency);
      return () => {
        active = false;
      };
    }

    const loadEffectiveCurrency = async () => {
      try {
        const response = await fetch('/api/currency', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const effectiveCurrency =
          typeof data?.effectiveCurrency === 'string' && data.effectiveCurrency.trim()
            ? data.effectiveCurrency.trim().toUpperCase()
            : null;
        if (active && effectiveCurrency) {
          setResolvedCurrency(effectiveCurrency);
        }
      } catch {
        // keep default currency fallback
      }
    };

    void loadEffectiveCurrency();

    return () => {
      active = false;
    };
  }, [currency]);

  const formatAmount = (cents: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: resolvedCurrency,
    }).format(cents / 100);

  const handlePresetAmount = (cents: number) => {
    setAmount(cents);
    setCustomAmount('');
  };

  const handleCustomAmount = (value: string) => {
    setCustomAmount(value);
    const dollars = parseFloat(value);
    if (!isNaN(dollars) && dollars >= 2) {
      setAmount(Math.round(dollars * 100));
    } else {
      setAmount(null);
    }
  };

  const handleTip = async () => {
    if (!amount || amount < 200) {
      setError(`Minimum tip amount is ${formatAmount(200)}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create tip checkout session
      const response = await fetch(`/api/creators/${photographerId}/tip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          currency: resolvedCurrency || undefined,
          eventId,
          mediaId,
          message: message.trim() || null,
          isAnonymous,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create tip');
      }

      // Redirect to Stripe Checkout
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('Tip error:', err);
      setError(err.message || 'Failed to process tip');
      setLoading(false);
    }
  };

  const selectedAmount = amount || (customAmount ? parseFloat(customAmount) * 100 : null);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Tip {photographerName}</h3>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-secondary hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <p className="text-sm text-secondary">
        Show your appreciation with a tip. All tips go directly to the photographer.
      </p>

      {/* Preset Amounts */}
      <div className="flex gap-2">
        {PRESET_AMOUNTS.map((cents) => {
          const isSelected = amount === cents;
          return (
            <Button
              key={cents}
              variant={isSelected ? 'primary' : 'outline'}
              size="sm"
              onClick={() => handlePresetAmount(cents)}
              className="flex-1"
            >
              {formatAmount(cents)}
            </Button>
          );
        })}
      </div>

      {/* Custom Amount */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Custom Amount (minimum {formatAmount(200)})
        </label>
        <Input
          type="number"
          min="2"
          step="0.01"
          placeholder="0.00"
          value={customAmount}
          onChange={(e) => handleCustomAmount(e.target.value)}
          className="font-mono"
        />
      </div>

      {/* Message (optional) */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Message (optional)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a message for the photographer..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-secondary resize-none"
          rows={3}
          maxLength={200}
        />
        <p className="text-xs text-secondary mt-1">{message.length}/200</p>
      </div>

      {/* Anonymous Toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isAnonymous}
          onChange={(e) => setIsAnonymous(e.target.checked)}
          className="rounded border-border"
        />
        <span className="text-sm text-secondary">Send tip anonymously</span>
      </label>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Submit Button */}
      <Button
        onClick={handleTip}
        disabled={!selectedAmount || selectedAmount < 200 || loading}
        className="w-full gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Heart className="h-4 w-4" />
            Tip {formatAmount(selectedAmount || 0)}
          </>
        )}
      </Button>

      <p className="text-xs text-secondary text-center">
        Platform fee: {formatAmount(Math.round((selectedAmount || 0) * 0.10))} (10%)
      </p>
    </div>
  );
}
