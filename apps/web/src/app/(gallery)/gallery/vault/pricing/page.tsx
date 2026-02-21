'use client';

import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { openPaystackInlineCheckout } from '@/lib/payments/paystack-inline';

interface StoragePlan {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price_monthly?: number | null;
  price_yearly?: number | null;
  currency?: string | null;
  storage_limit_mb?: number | null;
  features?: string[] | null;
  is_popular?: boolean | null;
  is_active?: boolean | null;
  sort_order?: number | null;
}

interface SubscriptionSummary {
  planSlug?: string;
  billingCycle?: string;
}

function formatStorage(storageLimitMb: number | null | undefined) {
  if (storageLimitMb === -1) return 'Unlimited storage';
  const mb = Number(storageLimitMb || 0);
  if (mb <= 0) return 'Storage not set';
  if (mb >= 1024) return `${Math.round(mb / 1024)} GB storage`;
  return `${mb} MB storage`;
}

export default function VaultPricingPage() {
  const toast = useToast();
  const [plans, setPlans] = useState<StoragePlan[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [subscribingPlan, setSubscribingPlan] = useState<string | null>(null);
  const [paymentChannel, setPaymentChannel] = useState<'auto' | 'card' | 'mobile_money'>('auto');

  const activePlans = useMemo(
    () =>
      plans
        .filter((plan) => plan.is_active !== false)
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
    [plans]
  );

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const [plansRes, vaultRes] = await Promise.all([
          fetch('/api/storage/plans', { cache: 'no-store' }),
          fetch('/api/vault?limit=1', { cache: 'no-store' }),
        ]);
        const plansPayload = await plansRes.json().catch(() => ({}));
        const vaultPayload = await vaultRes.json().catch(() => ({}));
        if (!plansRes.ok) throw new Error(plansPayload?.error || 'Failed to load plans');
        setPlans(Array.isArray(plansPayload?.plans) ? plansPayload.plans : []);
        setSubscription(vaultPayload?.subscription || null);
      } catch (error: any) {
        toast.error('Load failed', error?.message || 'Unable to load storage plans');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const handleUpgradeStorage = async (planSlug: string) => {
    const openCheckoutPopup = (checkoutUrl: string) => {
      const popup = window.open(
        checkoutUrl,
        'ferchrVaultCheckout',
        'popup=yes,width=520,height=760,menubar=no,toolbar=no,location=yes,status=no'
      );
      if (!popup) {
        window.location.href = checkoutUrl;
      }
    };

    try {
      setSubscribingPlan(planSlug);
      const response = await fetch('/api/vault/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug, billingCycle: 'monthly', paymentChannel }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.checkoutUrl) {
        throw new Error(data?.error || 'Unable to start storage checkout');
      }

      if (data?.gateway === 'paystack' && data?.paystack?.publicKey) {
        await openPaystackInlineCheckout({
          publicKey: String(data.paystack.publicKey),
          email: String(data.paystack.email || ''),
          amount: Number(data.paystack.amount || 0),
          currency: String(data.paystack.currency || 'USD'),
          reference: String(data.paystack.reference || ''),
          accessCode: data.paystack.accessCode ? String(data.paystack.accessCode) : null,
          metadata: {
            type: 'vault_subscription',
            plan_slug: planSlug,
          },
          onSuccess: (reference) => {
            window.location.assign(
              `/gallery/vault?subscription=success&provider=paystack&reference=${encodeURIComponent(reference)}`
            );
          },
        });
        return;
      }

      openCheckoutPopup(data.checkoutUrl);
    } catch (error: any) {
      toast.error('Upgrade failed', error?.message || 'Unable to upgrade storage right now');
    } finally {
      setSubscribingPlan(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="w-fit px-0 text-muted-foreground hover:text-foreground">
        <Link href="/gallery/vault">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Vault
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Vault Pricing</h1>
        <p className="mt-1 text-sm text-secondary">
          Upgrade your vault plan. Current: {subscription?.planSlug || 'free'} ({subscription?.billingCycle || 'monthly'})
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <label className="mb-2 block text-sm font-medium text-foreground">Payment Channel</label>
        <select
          value={paymentChannel}
          onChange={(event) =>
            setPaymentChannel(event.target.value as 'auto' | 'card' | 'mobile_money')
          }
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="auto">Auto (recommended)</option>
          <option value="card">Card</option>
          <option value="mobile_money">Mobile Money (force manual renewal)</option>
        </select>
        <p className="mt-2 text-xs text-muted-foreground">
          For Paystack vault subscriptions, Mobile Money forces manual renewal.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {activePlans.map((plan) => {
          const currency = String(plan.currency || 'USD').toUpperCase();
          const monthlyCents = Math.round(Number(plan.price_monthly || 0) * 100);
          const isCurrent = (subscription?.planSlug || 'free') === plan.slug;
          return (
            <div
              key={plan.id}
              className={`relative rounded-xl border p-5 ${
                plan.is_popular ? 'border-accent bg-accent/5' : 'border-border bg-card'
              }`}
            >
              {plan.is_popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
                  Most Popular
                </div>
              )}
              <h2 className="text-lg font-semibold text-foreground">{plan.name}</h2>
              <p className="mt-1 text-sm text-secondary">{plan.description || 'Storage plan'}</p>
              <p className="mt-3 text-sm font-medium text-foreground">{formatStorage(plan.storage_limit_mb)}</p>
              <p className="mt-2 text-3xl font-bold text-foreground">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency,
                }).format(monthlyCents / 100)}
                <span className="ml-1 text-sm font-normal text-secondary">/month</span>
              </p>

              <ul className="mt-4 space-y-2">
                {(Array.isArray(plan.features) ? plan.features : []).map((feature, index) => (
                  <li key={`${plan.id}-feature-${index}`} className="flex items-center gap-2 text-sm text-secondary">
                    <Check className="h-4 w-4 text-success" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                className="mt-5 w-full"
                variant={isCurrent ? 'outline' : 'primary'}
                disabled={isCurrent || subscribingPlan === plan.slug}
                onClick={() => handleUpgradeStorage(plan.slug)}
              >
                {isCurrent ? 'Current Plan' : subscribingPlan === plan.slug ? 'Starting...' : 'Upgrade'}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
