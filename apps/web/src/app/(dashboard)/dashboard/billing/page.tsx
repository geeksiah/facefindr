'use client';

import { Check, Download, Sparkles, Loader2, ExternalLink } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';

import { DashboardBanner } from '@/components/notifications';
import { PaymentMethodsManager } from '@/components/payments';
import { useCurrency } from '@/components/providers';
import { Button, CurrencySwitcher } from '@/components/ui';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import { useSSEWithPolling } from '@/hooks/use-sse-fallback';

interface PlanPricing {
  planId: string;
  planCode: string;
  planType?: 'creator' | 'drop_in' | 'payg';
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  formattedMonthly: string;
  formattedAnnual: string;
  isPopular?: boolean;
  displayFeatures?: string[]; // Text features from admin
  features?: {
    maxActiveEvents: number;
    maxPhotosPerEvent: number;
    maxFaceOpsPerEvent: number;
    storageGb?: number;
    teamMembers?: number;
    platformFeePercent: number;
    customWatermark: boolean;
    customBranding?: boolean;
    liveEventMode: boolean;
    advancedAnalytics?: boolean;
    apiAccess: boolean;
    prioritySupport?: boolean;
    whiteLabel?: boolean;
    printProducts?: boolean;
  };
}

interface Subscription {
  planId?: string | null;
  planCode: string;
  status: string;
  currentPeriodEnd: string;
}

interface UsageData {
  usage: {
    activeEvents: number;
    totalPhotos: number;
    storageUsedGb: number;
    teamMembers: number;
    faceOpsUsed: number;
  };
  limits: {
    maxEvents?: number;
    maxActiveEvents?: number;
    maxPhotosPerEvent: number;
    maxStorageGb?: number;
    storageGb?: number;
    maxTeamMembers?: number;
    teamMembers?: number;
    maxFaceOps?: number;
    maxFaceOpsPerEvent?: number;
  };
  percentages: {
    events: number;
    storage: number;
    team: number;
  };
  planId?: string | null;
  planCode: string;
  platformFee: number;
}

interface BillingHistoryRow {
  id: string;
  occurredAt: string;
  type: string;
  provider?: string | null;
  currency: string;
  description?: string | null;
  amountMinor: number;
  providerFeeMinor?: number;
}

export default function BillingPage() {
  const { currencyCode } = useCurrency();
  const [plans, setPlans] = useState<PlanPricing[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [billingHistory, setBillingHistory] = useState<BillingHistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpgrading, setIsUpgrading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const lastSubscriptionVersionRef = useRef(0);
  const loadInFlightRef = useRef(false);
  const loadQueuedRef = useRef(false);
  const loadAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const upgradeInFlightRef = useRef(false);

  const createIdempotencyKey = useCallback((scope: string) => {
    const randomPart =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return `${scope}:${randomPart}`;
  }, []);

  const openCheckoutPopup = useCallback((checkoutUrl: string) => {
    const popup = window.open(
      checkoutUrl,
      'ferchrBillingCheckout',
      'popup=yes,width=520,height=760,menubar=no,toolbar=no,location=yes,status=no'
    );
    if (!popup) {
      window.location.href = checkoutUrl;
    }
  }, []);

  // Load subscription and usage data
  const loadData = useCallback(async () => {
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
          const pricingRes = await fetch(`/api/subscriptions/pricing?currency=${currencyCode}`, {
            signal: controller.signal,
            cache: 'no-store',
          });
          if (pricingRes.ok && !controller.signal.aborted && mountedRef.current) {
            const data = await pricingRes.json();
            setPlans(data.plans || []);
          }

          const subRes = await fetch('/api/creator/subscription', {
            signal: controller.signal,
            cache: 'no-store',
          });
          if (subRes.ok && !controller.signal.aborted && mountedRef.current) {
            const data = await subRes.json();
            setSubscription(data.subscription);
          }

          const usageRes = await fetch('/api/creator/usage', {
            signal: controller.signal,
            cache: 'no-store',
          });
          if (usageRes.ok && !controller.signal.aborted && mountedRef.current) {
            const data = await usageRes.json();
            setUsageData(data);
          }

          const historyRes = await fetch('/api/creator/billing/history?limit=25', {
            signal: controller.signal,
            cache: 'no-store',
          });
          if (historyRes.ok && !controller.signal.aborted && mountedRef.current) {
            const data = await historyRes.json();
            setBillingHistory((data.history || []) as BillingHistoryRow[]);
          }
        } catch (error: any) {
          if (error?.name !== 'AbortError') {
            console.error('Failed to load billing data:', error);
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
  }, [currencyCode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, []);

  // Subscribe to realtime updates for usage changes
  useRealtimeSubscription({
    table: 'events',
    onChange: () => loadData(),
  });

  useRealtimeSubscription({
    table: 'media',
    onChange: () => loadData(),
  });

  useSSEWithPolling<{ version?: string }>({
    url: '/api/stream/subscriptions',
    eventName: 'subscriptions',
    onPoll: loadData,
    pollIntervalMs: 20000,
    heartbeatTimeoutMs: 35000,
    onMessage: (payload) => {
      const version = Number(payload.version || 0);
      if (!version || version > lastSubscriptionVersionRef.current) {
        lastSubscriptionVersionRef.current = version || Date.now();
        void loadData();
      }
    },
  });

  // Upgrade plan
  const handleUpgrade = async (planCode: string) => {
    if (upgradeInFlightRef.current) return;
    upgradeInFlightRef.current = true;
    setIsUpgrading(planCode);
    setCheckoutError(null);
    const idempotencyKey = createIdempotencyKey('subscription_checkout');
    try {
      const response = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ 
          planCode, 
          billingCycle,
          currency: currencyCode,
          idempotencyKey,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCheckoutError(data?.error || 'Failed to start checkout');
        return;
      }

      if (data.checkoutUrl) {
        openCheckoutPopup(data.checkoutUrl);
      } else {
        setCheckoutError('Checkout session was created but no redirect URL was returned');
      }
    } catch (error) {
      console.error('Failed to start checkout:', error);
      setCheckoutError('Failed to start checkout');
    } finally {
      upgradeInFlightRef.current = false;
      setIsUpgrading(null);
    }
  };

  const currentPlanCode = usageData?.planCode || subscription?.planCode || 'free';
  const currentPlanId = usageData?.planId || subscription?.planId || null;
  const currentPlanData =
    plans.find((plan) => (currentPlanId ? plan.planId === currentPlanId : false)) ||
    plans.find((plan) => plan.planCode === currentPlanCode);
  
  // Use real usage data from the enforcement system
  const usage = usageData?.usage || { activeEvents: 0, totalPhotos: 0, storageUsedGb: 0, teamMembers: 1, faceOpsUsed: 0 };
  // Keep current-plan meters aligned with the same plan source used by cards.
  const limitsRaw: any = currentPlanData?.features || usageData?.limits || {
    maxActiveEvents: 1,
    maxPhotosPerEvent: 50,
    storageGb: 1,
    teamMembers: 1,
    maxFaceOpsPerEvent: 0,
  };
  const limits = {
    maxActiveEvents: limitsRaw.maxActiveEvents ?? limitsRaw.maxEvents ?? 1,
    maxPhotosPerEvent: limitsRaw.maxPhotosPerEvent ?? 50,
    maxStorageGb: limitsRaw.maxStorageGb ?? limitsRaw.storageGb ?? 1,
    maxTeamMembers: limitsRaw.maxTeamMembers ?? limitsRaw.teamMembers ?? 1,
    maxFaceOps: limitsRaw.maxFaceOps ?? limitsRaw.maxFaceOpsPerEvent ?? 0,
  };
  const percentages = usageData?.percentages || { events: 0, storage: 0, team: 0 };

  const formatHistoryAmount = (amountMinor: number, currency: string) => {
    const amount = Number(amountMinor || 0) / 100;
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: String(currency || 'USD').toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const mapHistoryLabel = (type: string) => {
    switch (type) {
      case 'photo_purchase':
        return 'Photo purchase';
      case 'tip':
        return 'Tip';
      case 'subscription_charge':
        return 'Subscription charge';
      case 'drop_in_credit_purchase':
        return 'Credit purchase';
      case 'drop_in_credit_consumption':
        return 'Credit consumption';
      case 'payout':
        return 'Payout';
      case 'refund':
        return 'Refund';
      default:
        return type.replace(/_/g, ' ');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-72 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-56 animate-pulse rounded-2xl border border-border bg-card" />
        <div className="h-10 w-72 animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-6 md:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-[34rem] animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
        <div className="h-56 animate-pulse rounded-2xl border border-border bg-card" />
        <div className="h-56 animate-pulse rounded-2xl border border-border bg-card" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Ad Placement */}
      <DashboardBanner />

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing</h1>
          <p className="mt-1 text-secondary">
            Manage your subscription and payment methods.
          </p>
        </div>
        <CurrencySwitcher variant="compact" />
      </div>

      {/* Current Plan */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-foreground">Current Plan</h2>
              <span className="rounded-full bg-accent/10 text-accent px-2.5 py-0.5 text-xs font-medium capitalize">
                {currentPlanData?.name || currentPlanCode}
              </span>
            </div>
            <p className="mt-1 text-sm text-secondary">
              {currentPlanCode === 'free'
                ? "You're on the free plan. Upgrade to unlock more features."
                : `Platform fee: ${currentPlanData?.features?.platformFeePercent ?? usageData?.platformFee ?? 20}%`
              }
            </p>
          </div>
          {currentPlanCode === 'free' && (
            <Button variant="primary" size="sm" onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })}>
              <Sparkles className="h-4 w-4" />
              Upgrade
            </Button>
          )}
        </div>

        {/* Usage - Real-time data from enforcement system */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-secondary">Active Events</p>
            <p className="text-lg font-semibold text-foreground">
              {usage.activeEvents} / {limits.maxActiveEvents === -1 ? 'Unlimited' : limits.maxActiveEvents}
            </p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${percentages.events >= 90 ? 'bg-destructive' : percentages.events >= 70 ? 'bg-warning' : 'bg-accent'}`}
                style={{ 
                  width: limits.maxActiveEvents === -1 
                    ? '10%' 
                    : `${Math.min(percentages.events, 100)}%` 
                }}
              />
            </div>
            {percentages.events >= 80 && (
              <p className="text-xs text-warning mt-1">Approaching limit</p>
            )}
          </div>
          <div>
            <p className="text-sm text-secondary">Storage Used</p>
            <p className="text-lg font-semibold text-foreground">
              {usage.storageUsedGb.toFixed(2)} GB / {limits.maxStorageGb === -1 ? 'Unlimited' : `${limits.maxStorageGb} GB`}
            </p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${percentages.storage >= 90 ? 'bg-destructive' : percentages.storage >= 70 ? 'bg-warning' : 'bg-accent'}`}
                style={{ width: limits.maxStorageGb === -1 ? '10%' : `${Math.min(percentages.storage, 100)}%` }}
              />
            </div>
            {percentages.storage >= 80 && (
              <p className="text-xs text-warning mt-1">Storage almost full</p>
            )}
          </div>
          <div>
            <p className="text-sm text-secondary">Team Members</p>
            <p className="text-lg font-semibold text-foreground">
              {usage.teamMembers} / {limits.maxTeamMembers === -1 ? 'Unlimited' : limits.maxTeamMembers}
            </p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${percentages.team >= 90 ? 'bg-destructive' : percentages.team >= 70 ? 'bg-warning' : 'bg-accent'}`}
                style={{ width: limits.maxTeamMembers === -1 ? '10%' : `${Math.min(percentages.team, 100)}%` }}
              />
            </div>
          </div>
          <div>
            <p className="text-sm text-secondary">Total Photos</p>
            <p className="text-lg font-semibold text-foreground">
              {usage.totalPhotos.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Max {limits.maxPhotosPerEvent} per event
            </p>
          </div>
        </div>

        {/* Warning Banner if approaching limits */}
        {(percentages.events >= 80 || percentages.storage >= 80) && (
          <div className="mt-4 p-4 rounded-xl bg-warning/10 border border-warning/20">
            <p className="text-sm text-warning font-medium">
              You&apos;re approaching your plan limits. Consider upgrading to avoid interruptions.
            </p>
          </div>
        )}
      </div>

      {/* Billing Cycle Toggle */}
      <div id="plans" className="flex items-center justify-center gap-4">
        <button
          onClick={() => setBillingCycle('monthly')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            billingCycle === 'monthly' 
              ? 'bg-foreground text-background' 
              : 'bg-muted text-foreground hover:bg-muted/80'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setBillingCycle('annual')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            billingCycle === 'annual' 
              ? 'bg-foreground text-background' 
              : 'bg-muted text-foreground hover:bg-muted/80'
          }`}
        >
          Annual
          <span className="ml-2 text-xs text-success">Save 2 months</span>
        </button>
      </div>

      {checkoutError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {checkoutError}
        </div>
      )}

      {/* Plans */}
      <div className={`grid gap-6 ${plans.length <= 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
        {plans.map((plan) => {
          const isCurrentPlan = currentPlanId
            ? plan.planId === currentPlanId
            : plan.planCode === currentPlanCode;
          const isPopular = Boolean(plan.isPopular);
          const price = billingCycle === 'monthly' ? plan.formattedMonthly : plan.formattedAnnual;
          const features = plan.features;

          return (
            <div
              key={plan.planId || plan.planCode}
              className={`relative rounded-2xl p-6 transition-all duration-300 ${
                isPopular
                  ? 'bg-foreground text-background ring-1 ring-foreground'
                  : 'bg-card border border-border'
              }`}
            >
              {isPopular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1 text-xs font-semibold text-white">
                  Most Popular
                </span>
              )}
              <h3 className={`text-lg font-semibold ${isPopular ? 'text-background' : 'text-foreground'}`}>
                {plan.name}
              </h3>
              <p className={`mt-1 text-sm ${isPopular ? 'text-background/70' : 'text-secondary'}`}>
                {plan.description}
              </p>
              <div className="mt-4">
                <span className={`text-3xl font-bold ${isPopular ? 'text-background' : 'text-foreground'}`}>
                  {price}
                </span>
                <span className={isPopular ? 'text-background/70' : 'text-secondary'}>
                  /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                </span>
              </div>

              {/* Structured limits/capabilities are authoritative */}
              {features && (
                <ul className="mt-6 space-y-2">
                  <li className="flex items-start gap-2">
                    <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-accent' : 'text-success'}`} />
                    <span className={`text-sm ${isPopular ? 'text-background/90' : 'text-foreground'}`}>
                      {features.maxActiveEvents === -1 ? 'Unlimited' : features.maxActiveEvents} events
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-accent' : 'text-success'}`} />
                    <span className={`text-sm ${isPopular ? 'text-background/90' : 'text-foreground'}`}>
                      {features.maxPhotosPerEvent.toLocaleString()} photos/event
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-accent' : 'text-success'}`} />
                    <span className={`text-sm ${isPopular ? 'text-background/90' : 'text-foreground'}`}>
                      {features.platformFeePercent}% platform fee
                    </span>
                  </li>
                  {features.teamMembers && features.teamMembers > 1 && (
                    <li className="flex items-start gap-2">
                      <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-accent' : 'text-success'}`} />
                      <span className={`text-sm ${isPopular ? 'text-background/90' : 'text-foreground'}`}>
                        {features.teamMembers} team members
                      </span>
                    </li>
                  )}
                  {features.customWatermark && (
                    <li className="flex items-start gap-2">
                      <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-accent' : 'text-success'}`} />
                      <span className={`text-sm ${isPopular ? 'text-background/90' : 'text-foreground'}`}>
                        Custom watermark
                      </span>
                    </li>
                  )}
                  {features.customBranding && (
                    <li className="flex items-start gap-2">
                      <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-accent' : 'text-success'}`} />
                      <span className={`text-sm ${isPopular ? 'text-background/90' : 'text-foreground'}`}>
                        Custom branding
                      </span>
                    </li>
                  )}
                  {features.liveEventMode && (
                    <li className="flex items-start gap-2">
                      <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-accent' : 'text-success'}`} />
                      <span className={`text-sm ${isPopular ? 'text-background/90' : 'text-foreground'}`}>
                        Live Event mode
                      </span>
                    </li>
                  )}
                  {features.advancedAnalytics && (
                    <li className="flex items-start gap-2">
                      <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-accent' : 'text-success'}`} />
                      <span className={`text-sm ${isPopular ? 'text-background/90' : 'text-foreground'}`}>
                        Advanced analytics
                      </span>
                    </li>
                  )}
                  {features.apiAccess && (
                    <li className="flex items-start gap-2">
                      <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-accent' : 'text-success'}`} />
                      <span className={`text-sm ${isPopular ? 'text-background/90' : 'text-foreground'}`}>
                        API access
                      </span>
                    </li>
                  )}
                  {features.prioritySupport && (
                    <li className="flex items-start gap-2">
                      <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-accent' : 'text-success'}`} />
                      <span className={`text-sm ${isPopular ? 'text-background/90' : 'text-foreground'}`}>
                        Priority support
                      </span>
                    </li>
                  )}
                  {features.whiteLabel && (
                    <li className="flex items-start gap-2">
                      <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-accent' : 'text-success'}`} />
                      <span className={`text-sm ${isPopular ? 'text-background/90' : 'text-foreground'}`}>
                        White-label options
                      </span>
                    </li>
                  )}
                </ul>
              )}

              {/* Optional marketing highlights from admin; non-authoritative */}
              {plan.displayFeatures && plan.displayFeatures.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {plan.displayFeatures.slice(0, 3).map((feature, idx) => (
                    <li key={`${plan.planId}-highlight-${idx}`} className="flex items-start gap-2">
                      <Check className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${isPopular ? 'text-background/70' : 'text-muted-foreground'}`} />
                      <span className={`text-xs ${isPopular ? 'text-background/70' : 'text-muted-foreground'}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              
              <Button
                className="w-full mt-6"
                variant={isPopular ? 'primary' : 'outline'}
                disabled={isCurrentPlan || plan.planCode === 'free' || isUpgrading === plan.planCode}
                onClick={() => handleUpgrade(plan.planCode)}
              >
                {isUpgrading === plan.planCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isCurrentPlan ? (
                  'Current Plan'
                ) : plan.planCode === 'free' ? (
                  'Free'
                ) : (
                  'Upgrade'
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Payment Methods */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Payment Methods</h2>
        <p className="text-sm text-secondary mb-6">
          Add payment methods for subscriptions. You can use cards, mobile money, or PayPal.
        </p>
        <PaymentMethodsManager />
      </div>

      {/* Payout Settings Link */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Payout Settings</h2>
            <p className="text-sm text-secondary mt-1">
              Configure how and when you receive payments for photo sales.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href="/dashboard/settings?tab=payments">
              <ExternalLink className="h-4 w-4 mr-2" />
              Manage Payouts
            </a>
          </Button>
        </div>
      </div>

      {/* Billing History */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">Billing History</h2>
        </div>
        {billingHistory.length === 0 ? (
          <div className="p-12 text-center">
            <Download className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No billing history yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {billingHistory.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between px-6 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground capitalize">
                    {entry.description || mapHistoryLabel(entry.type)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.occurredAt).toLocaleString()} {entry.provider ? `• ${entry.provider}` : ''}
                  </p>
                </div>
                <p className={`text-sm font-semibold ${entry.amountMinor >= 0 ? 'text-foreground' : 'text-warning'}`}>
                  {formatHistoryAmount(entry.amountMinor, entry.currency)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

