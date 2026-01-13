import { Check, CreditCard, Download, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

const plans = [
  {
    name: 'Starter',
    price: '$15',
    description: 'Perfect for hobbyists and small events',
    features: [
      '1,000 photos per event',
      '5 active events',
      '2,000 face operations',
      '30-day retention',
      'Email support',
    ],
    current: false,
  },
  {
    name: 'Pro',
    price: '$39',
    description: 'For professional photographers',
    popular: true,
    features: [
      '5,000 photos per event',
      '20 active events',
      '10,000 face operations',
      '90-day retention',
      'Priority support',
      'Photo Passport',
    ],
    current: false,
  },
  {
    name: 'Studio',
    price: '$99',
    description: 'For studios and agencies',
    features: [
      '20,000 photos per event',
      'Unlimited events',
      '50,000 face operations',
      '365-day retention',
      'Dedicated support',
      'API access',
    ],
    current: false,
  },
];

export default function BillingPage() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="mt-1 text-secondary">
          Manage your subscription and payment methods.
        </p>
      </div>

      {/* Current Plan */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-foreground">Current Plan</h2>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Free
              </span>
            </div>
            <p className="mt-1 text-sm text-secondary">
              You&apos;re on the free plan. Upgrade to unlock more features.
            </p>
          </div>
          <Button variant="primary" size="sm">
            <Sparkles className="h-4 w-4" />
            Upgrade
          </Button>
        </div>

        {/* Usage */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-secondary">Events</p>
            <p className="text-lg font-semibold text-foreground">0 / 2</p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full w-0 rounded-full bg-accent" />
            </div>
          </div>
          <div>
            <p className="text-sm text-secondary">Photos</p>
            <p className="text-lg font-semibold text-foreground">0 / 100</p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full w-0 rounded-full bg-accent" />
            </div>
          </div>
          <div>
            <p className="text-sm text-secondary">Face Operations</p>
            <p className="text-lg font-semibold text-foreground">0 / 500</p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full w-0 rounded-full bg-accent" />
            </div>
          </div>
        </div>
      </div>

      {/* Plans */}
      <div>
        <h2 className="font-semibold text-foreground mb-4">Available Plans</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-6 transition-all duration-300 ${
                plan.popular
                  ? 'bg-foreground text-background ring-1 ring-foreground'
                  : 'bg-card border border-border'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1 text-xs font-semibold text-white">
                  Most Popular
                </span>
              )}
              <h3 className={`text-lg font-semibold ${plan.popular ? 'text-background' : 'text-foreground'}`}>
                {plan.name}
              </h3>
              <p className={`mt-1 text-sm ${plan.popular ? 'text-background/70' : 'text-secondary'}`}>
                {plan.description}
              </p>
              <div className="mt-4">
                <span className={`text-3xl font-bold ${plan.popular ? 'text-background' : 'text-foreground'}`}>
                  {plan.price}
                </span>
                <span className={plan.popular ? 'text-background/70' : 'text-secondary'}>
                  /month
                </span>
              </div>
              <ul className="mt-6 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${plan.popular ? 'text-accent' : 'text-success'}`} />
                    <span className={`text-sm ${plan.popular ? 'text-background/90' : 'text-foreground'}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full mt-6"
                variant={plan.popular ? 'primary' : 'outline'}
              >
                {plan.current ? 'Current Plan' : 'Upgrade'}
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Method */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Payment Method</h2>
        <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            No payment method on file
          </p>
        </div>
        <Button variant="outline" size="sm" className="mt-4">
          Add Payment Method
        </Button>
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
