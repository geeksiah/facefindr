'use client';

/**
 * Currency Switcher Component
 * 
 * Allows users to select their preferred currency.
 */

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Loader2, Globe } from 'lucide-react';
import { useCurrency } from '@/components/providers';
import { cn } from '@/lib/utils';

interface Currency {
  code: string;
  name: string;
  symbol: string;
}

interface CurrencySwitcherProps {
  className?: string;
  variant?: 'default' | 'compact' | 'inline';
}

export function CurrencySwitcher({ className, variant = 'default' }: CurrencySwitcherProps) {
  const { currencyCode, setCurrency, isLoading, currencies: contextCurrencies } = useCurrency();
  const [isOpen, setIsOpen] = useState(false);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Use currencies from context or fetch them
  useEffect(() => {
    if (contextCurrencies && contextCurrencies.length > 0) {
      setCurrencies(contextCurrencies.map(c => ({
        code: c.code,
        name: c.name,
        symbol: c.symbol,
      })));
      return;
    }

    async function fetchCurrencies() {
      setIsFetching(true);
      try {
        const response = await fetch('/api/currency');
        if (response.ok) {
          const data = await response.json();
          setCurrencies((data.currencies || []).map((c: Currency) => ({
            code: c.code,
            name: c.name,
            symbol: c.symbol,
          })));
        }
      } catch (error) {
        console.error('Failed to fetch currencies:', error);
        // Default currencies if API fails
        setCurrencies([
          { code: 'USD', name: 'US Dollar', symbol: '$' },
          { code: 'EUR', name: 'Euro', symbol: '€' },
          { code: 'GBP', name: 'British Pound', symbol: '£' },
          { code: 'GHS', name: 'Ghana Cedi', symbol: '₵' },
          { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
        ]);
      } finally {
        setIsFetching(false);
      }
    }

    fetchCurrencies();
  }, [contextCurrencies]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (code: string) => {
    setCurrency(code);
    setIsOpen(false);
  };

  const currentCurrency = currencies.find(c => c.code === currencyCode) || {
    code: currencyCode,
    name: currencyCode,
    symbol: currencyCode,
  };

  if (variant === 'compact') {
    return (
      <div className={cn('relative', className)} ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
            'border border-border bg-card hover:bg-muted transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isOpen && 'ring-2 ring-accent/20'
          )}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span>{currentCurrency.symbol}</span>
          )}
          <span>{currencyCode}</span>
          <ChevronDown className={cn(
            'h-3.5 w-3.5 text-secondary transition-transform duration-200',
            isOpen && 'rotate-180'
          )} />
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-2 z-50 min-w-[180px] rounded-xl border border-border bg-card shadow-xl overflow-hidden animate-dropdown-open">
            <div className="max-h-64 overflow-y-auto py-1">
              {isFetching ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-accent" />
                </div>
              ) : (
                currencies.map((curr) => (
                  <button
                    key={curr.code}
                    onClick={() => handleSelect(curr.code)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                      currencyCode === curr.code
                        ? 'bg-accent/10 text-accent'
                        : 'hover:bg-muted'
                    )}
                  >
                    <span className="w-6 text-center font-medium">{curr.symbol}</span>
                    <span className="flex-1 text-sm">{curr.code}</span>
                    {currencyCode === curr.code && (
                      <Check className="h-4 w-4 text-accent" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Globe className="h-4 w-4 text-secondary" />
        <select
          value={currencyCode}
          onChange={(e) => setCurrency(e.target.value)}
          disabled={isLoading}
          className={cn(
            'appearance-none bg-transparent text-sm font-medium cursor-pointer',
            'focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {currencies.map((curr) => (
            <option key={curr.code} value={curr.code}>
              {curr.symbol} {curr.code}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Default variant - full width
  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      <label className="block text-sm font-medium text-foreground mb-2">
        Display Currency
      </label>
      
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl',
          'border border-border bg-card hover:bg-muted transition-all duration-200',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          isOpen && 'ring-2 ring-accent/20 border-accent'
        )}
      >
        <div className="flex items-center gap-3">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-lg font-semibold">
              {currentCurrency.symbol}
            </span>
          )}
          <div className="text-left">
            <p className="font-medium text-foreground">{currentCurrency.code}</p>
            <p className="text-sm text-secondary">{currentCurrency.name}</p>
          </div>
        </div>
        <ChevronDown className={cn(
          'h-5 w-5 text-secondary transition-transform duration-200',
          isOpen && 'rotate-180'
        )} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-border bg-card shadow-xl overflow-hidden animate-dropdown-open">
          <div className="p-2 border-b border-border">
            <p className="text-xs text-secondary px-2">Select your preferred currency</p>
          </div>
          <div className="max-h-72 overflow-y-auto py-2">
            {isFetching ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            ) : (
              currencies.map((curr) => (
                <button
                  key={curr.code}
                  onClick={() => handleSelect(curr.code)}
                  className={cn(
                    'w-full flex items-center gap-4 px-4 py-3 text-left transition-all duration-200',
                    currencyCode === curr.code
                      ? 'bg-accent/10'
                      : 'hover:bg-muted'
                  )}
                >
                  <span className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl text-lg font-semibold',
                    currencyCode === curr.code
                      ? 'bg-accent text-white'
                      : 'bg-muted'
                  )}>
                    {curr.symbol}
                  </span>
                  <div className="flex-1">
                    <p className={cn(
                      'font-medium',
                      currencyCode === curr.code ? 'text-accent' : 'text-foreground'
                    )}>
                      {curr.code}
                    </p>
                    <p className="text-sm text-secondary">{curr.name}</p>
                  </div>
                  {currencyCode === curr.code && (
                    <Check className="h-5 w-5 text-accent animate-bounce-in" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
