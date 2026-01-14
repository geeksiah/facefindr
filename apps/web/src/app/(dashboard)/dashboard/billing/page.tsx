'use client';

import { useState, useEffect } from 'react';
import { Check, CreditCard, Download, Sparkles, Loader2, ExternalLink } from 'lucide-react';
import { Button, Switch, CurrencySwitcher } from '@/components/ui';
import { useCurrency } from '@/components/providers';
import { PaymentMethodsManager } from '@/components/payments';
import { DashboardBanner } from '@/components/notifications';

interface PlanPricing {
  planCode: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  formattedMonthly: string;
  formattedAnnual: string;
  features?: {
    maxActiveEvents: number;
    maxPhotosPerEvent: number;
    maxFaceOpsPerEvent: number;
    platformFeePercent: number;
    customWatermark: boolean;
    liveEventMode: boolean;
    apiAccess: boolean;
  };
}

interface Subscription {
  planCode: string;
  status: string;
  currentPeriodEnd: string;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export default function BillingPage() {
  const { currencyCode, formatPrice } = useCurrency();
  const [plans, setPlans] = useState<PlanPricing[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [usage, setUsage] = useState({ events: 0, photos: 0, faceOps: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  // Load subscription data
  useEffect(() => {
    async function loadData() {
      try {
        // Load subscription pricing
        const pricingRes = await fetch(`/api/subscriptions/pricing?currency=${currencyCode}`);
        if (pricingRes.ok) {
          const data = await pricingRes.json();
          setPlans(data.plans || []);
        }

        // Load current subscription
        const subRes = await fetch('/api/photographer/subscription');
        if (subRes.ok) {
          const data = await subRes.json();
          setSubscription(data.subscription);
          setPaymentMethod(data.paymentMethod);
          setUsage(data.usage || { events: 0, photos: 0, faceOps: 0 });
        }
      } catch (error) {
        console.error('Failed to load billing data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [currencyCode]);

  // Add payment method
  const handleAddPaymentMethod = async () => {
    setIsAddingPayment(true);
    try {
      const response = await fetch('/api/wallet/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'stripe' }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.onboardingUrl) {
          window.location.href = data.onboardingUrl;
        }
      }
    } catch (error) {
      console.error('Failed to add payment method:', error);
    } finally {
      setIsAddingPayment(false);
    }
  };

  // Upgrade plan
  const handleUpgrade = async (planCode: string) => {
    setIsUpgrading(planCode);
    try {
      const response = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          planCode, 
          billingCycle,
          currency: currencyCode,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        }
      }
    } catch (error) {
      console.error('Failed to start checkout:', error);
    } finally {
      setIsUpgrading(null);
    }
  };

  const currentPlan = subscription?.planCode || 'free';
  const currentPlanData = plans.find(p => p.planCode === currentPlan);
  const limits = currentPlanData?.features || {
    maxActiveEvents: 3,
    maxPhotosPerEvent: 100,
    maxFaceOpsPerEvent: 500,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
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
                {currentPlan}
              </span>
            </div>
            <p className="mt-1 text-sm text-secondary">
              {currentPlan === 'free' 
                ? "You're on the free plan. Upgrade to unlock more features."
                : `Platform fee: ${currentPlanData?.features?.platformFeePercent || 20}%`
              }
            </p>
          </div>
          {currentPlan === 'free' && (
            <Button variant="primary" size="sm" onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })}>
              <Sparkles className="h-4 w-4" />
              Upgrade
            </Button>
          )}
        </div>

        {/* Usage */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-secondary">Events</p>
            <p className="text-lg font-semibold text-foreground">
              {usage.events} / {limits.maxActiveEvents === -1 ? '∞' : limits.maxActiveEvents}
            </p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div 
                className="h-full rounded-full bg-accent transition-all" 
                style={{ 
                  width: limits.maxActiveEvents === -1 
                    ? '10%' 
                    : `${Math.min((usage.events / limits.maxActiveEvents) * 100, 100)}%` 
                }}
              />
            </div>
          </div>
          <div>
            <p className="text-sm text-secondary">Photos (per event)</p>
            <p className="text-lg font-semibold text-foreground">
              {usage.photos} / {limits.maxPhotosPerEvent}
            </p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div 
                className="h-full rounded-full bg-accent transition-all" 
                style={{ width: `${Math.min((usage.photos / limits.maxPhotosPerEvent) * 100, 100)}%` }}
              />
            </div>
          </div>
          <div>
            <p className="text-sm text-secondary">Face Operations</p>
            <p className="text-lg font-semibold text-foreground">
              {usage.faceOps} / {limits.maxFaceOpsPerEvent}
            </p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div 
                className="h-full rounded-full bg-accent transition-all" 
                style={{ width: `${Math.min((usage.faceOps / limits.maxFaceOpsPerEvent) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
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

      {/* Plans */}
      <div className="grid gap-6 md:grid-cols-4">
        {plans.map((plan) => {
          const isCurrentPlan = plan.planCode === currentPlan;
          const isPopular = plan.planCode === 'pro';
          const price = billingCycle === 'monthly' ? plan.formattedMonthly : plan.formattedAnnual;
          const features = plan.features;

          return (
            <div
              key={plan.planCode}
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
                  {features.customWatermark && (
                    <li className="flex items-start gap-2">
                      <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-accent' : 'text-success'}`} />
                      <span className={`text-sm ${isPopular ? 'text-background/90' : 'text-foreground'}`}>
                        Custom watermark
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
                  {features.apiAccess && (
                    <li className="flex items-start gap-2">
                      <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-accent' : 'text-success'}`} />
                      <span className={`text-sm ${isPopular ? 'text-background/90' : 'text-foreground'}`}>
                        API access
                      </span>
                    </li>
                  )}
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
        <div className="p-12 text-center">
          <Download className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No invoices yet.
          </p>
        </div>
      </div>
    </div>
  );
}
