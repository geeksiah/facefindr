'use client';

/**
 * Currency Provider
 * 
 * Provides currency context for the application.
 * Auto-detects user location and manages currency preferences.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

import { useSSEWithPolling } from '@/hooks/use-sse-fallback';

// ============================================
// TYPES
// ============================================

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  symbolPosition: 'before' | 'after';
  decimalPlaces: number;
}

interface CurrencyContextValue {
  // Current state
  currency: Currency | null;
  currencyCode: string;
  isLoading: boolean;
  
  // All available currencies
  currencies: Currency[];
  
  // Actions
  setCurrency: (code: string) => Promise<void>;
  formatPrice: (amountCents: number, currencyCode?: string) => string;
  
  // Detection info
  detectedCountry: string | null;
  detectedCurrency: string | null;
}

// Default currency
const DEFAULT_CURRENCY: Currency = {
  code: 'USD',
  name: 'US Dollar',
  symbol: '$',
  symbolPosition: 'before',
  decimalPlaces: 2,
};

// ============================================
// CONTEXT
// ============================================

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: DEFAULT_CURRENCY,
  currencyCode: 'USD',
  isLoading: true,
  currencies: [],
  setCurrency: async () => {},
  formatPrice: () => '',
  detectedCountry: null,
  detectedCurrency: null,
});

// ============================================
// PROVIDER
// ============================================

interface CurrencyProviderProps {
  children: React.ReactNode;
}

export function CurrencyProvider({ children }: CurrencyProviderProps) {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [currency, setCurrencyObj] = useState<Currency | null>(DEFAULT_CURRENCY);
  const [isLoading, setIsLoading] = useState(true);
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [detectedCurrency, setDetectedCurrency] = useState<string | null>(null);
  const runtimeVersionRef = useRef(0);
  const loadInFlightRef = useRef(false);
  const loadQueuedRef = useRef(false);
  const loadAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const loadCurrencies = useCallback(async () => {
    if (loadInFlightRef.current) {
      loadQueuedRef.current = true;
      loadAbortRef.current?.abort();
      return;
    }

    loadInFlightRef.current = true;
    try {
      let shouldContinue = true;
      while (shouldContinue) {
        shouldContinue = false;
        loadQueuedRef.current = false;

        loadAbortRef.current?.abort();
        const controller = new AbortController();
        loadAbortRef.current = controller;

        try {
          const response = await fetch('/api/currency', {
            signal: controller.signal,
            cache: 'no-store',
          });
          if (!response.ok) throw new Error('Failed to load currencies');

          const data = await response.json();
          if (controller.signal.aborted || !mountedRef.current) {
            continue;
          }

          setCurrencies(data.currencies || []);
          setDetectedCountry(data.detectedCountry);
          setDetectedCurrency(data.detectedCurrency);

          const effectiveCode = data.effectiveCurrency || 'USD';
          setCurrencyCode(effectiveCode);

          const currencyObj = data.currencies?.find(
            (c: Currency) => c.code === effectiveCode
          ) || DEFAULT_CURRENCY;
          setCurrencyObj(currencyObj);
        } catch (error: any) {
          if (error?.name !== 'AbortError') {
            console.error('Failed to load currencies:', error);
          }
        } finally {
          if (loadAbortRef.current === controller) {
            loadAbortRef.current = null;
          }
        }

        if (loadQueuedRef.current) {
          shouldContinue = true;
        }
      }
    } finally {
      loadInFlightRef.current = false;
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Load currencies and user preference
  useEffect(() => {
    void loadCurrencies();
  }, [loadCurrencies]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, []);

  useSSEWithPolling<{ version?: string }>({
    url: '/api/stream/runtime-config',
    eventName: 'runtime-config',
    onPoll: loadCurrencies,
    pollIntervalMs: 30000,
    heartbeatTimeoutMs: 45000,
    onMessage: (payload) => {
      const version = Number(payload.version || 0);
      if (!version || version > runtimeVersionRef.current) {
        runtimeVersionRef.current = version || Date.now();
        void loadCurrencies();
      }
    },
  });

  // Set currency preference
  const setCurrency = useCallback(async (code: string) => {
    try {
      const response = await fetch('/api/currency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency: code }),
      });
      
      if (!response.ok) throw new Error('Failed to set currency');
      
      setCurrencyCode(code);
      const currencyObj = currencies.find(c => c.code === code) || DEFAULT_CURRENCY;
      setCurrencyObj(currencyObj);
      
    } catch (error) {
      console.error('Failed to set currency:', error);
      throw error;
    }
  }, [currencies]);

  // Format price helper
  const formatPrice = useCallback((amountCents: number, overrideCode?: string) => {
    const code = overrideCode || currencyCode;
    const curr = currencies.find(c => c.code === code) || currency || DEFAULT_CURRENCY;
    
    const amount = amountCents / 100;
    let formatted: string;
    
    if (curr.decimalPlaces === 0) {
      formatted = Math.round(amount).toLocaleString();
    } else {
      formatted = amount.toLocaleString(undefined, {
        minimumFractionDigits: curr.decimalPlaces,
        maximumFractionDigits: curr.decimalPlaces,
      });
    }
    
    if (curr.symbolPosition === 'before') {
      return `${curr.symbol}${formatted}`;
    } else {
      return `${formatted} ${curr.symbol}`;
    }
  }, [currencyCode, currencies, currency]);

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        currencyCode,
        isLoading,
        currencies,
        setCurrency,
        formatPrice,
        detectedCountry,
        detectedCurrency,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

// ============================================
// CURRENCY SELECTOR COMPONENT
// ============================================

interface CurrencySelectorProps {
  className?: string;
  size?: 'sm' | 'md';
}

export function CurrencySelector({ className = '', size = 'md' }: CurrencySelectorProps) {
  const { currencyCode, currencies, setCurrency, isLoading } = useCurrency();
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) {
    return (
      <div className={`animate-pulse bg-border rounded h-8 w-20 ${className}`} />
    );
  }

  const sizeClasses = size === 'sm' 
    ? 'text-xs px-2 py-1' 
    : 'text-sm px-3 py-2';

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 rounded-lg border border-border bg-card hover:bg-muted transition-colors ${sizeClasses}`}
      >
        <span className="font-medium">{currencyCode}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[180px] max-h-64 overflow-y-auto">
            {currencies.map(curr => (
              <button
                key={curr.code}
                onClick={() => {
                  setCurrency(curr.code);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors ${
                  curr.code === currencyCode ? 'bg-accent/10 text-accent' : ''
                }`}
              >
                <span className="font-medium w-12">{curr.code}</span>
                <span className="text-secondary truncate">{curr.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
