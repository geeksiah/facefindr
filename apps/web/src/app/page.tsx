'use client';

import { ArrowRight, Scan, Camera, Shield, Zap, Check, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';

interface CreatorPlanCard {
  planId: string;
  planCode: string;
  name: string;
  description: string;
  monthlyPrice: number;
  formattedMonthly: string;
  isPopular?: boolean;
  displayFeatures?: string[];
  features?: {
    maxActiveEvents?: number;
    maxPhotosPerEvent?: number;
    platformFeePercent?: number;
    teamMembers?: number;
  };
}

export default function HomePage() {
  const [pricingCurrency, setPricingCurrency] = useState('USD');
  const [pricingPlans, setPricingPlans] = useState<CreatorPlanCard[]>([]);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadPricing = async () => {
      setPricingLoading(true);
      try {
        const response = await fetch('/api/subscriptions/pricing?type=creator', {
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to load pricing');
        }

        if (cancelled) return;
        setPricingCurrency(String(payload?.currency || 'USD').toUpperCase());
        setPricingPlans(
          Array.isArray(payload?.plans)
            ? [...payload.plans].sort((a: CreatorPlanCard, b: CreatorPlanCard) => a.monthlyPrice - b.monthlyPrice)
            : []
        );
        setPricingError(null);
      } catch (error: any) {
        if (cancelled) return;
        setPricingPlans([]);
        setPricingError(error?.message || 'Unable to load pricing');
      } finally {
        if (!cancelled) {
          setPricingLoading(false);
        }
      }
    };

    void loadPricing();

    return () => {
      cancelled = true;
    };
  }, []);

  const renderedPricingPlans = useMemo(() => {
    return pricingPlans.map((plan) => {
      const fallbackFeatures: string[] = [];
      if (Number.isFinite(Number(plan.features?.maxPhotosPerEvent))) {
        fallbackFeatures.push(`${Number(plan.features?.maxPhotosPerEvent).toLocaleString()} photos/event`);
      }
      if (Number.isFinite(Number(plan.features?.maxActiveEvents))) {
        const maxEvents = Number(plan.features?.maxActiveEvents);
        fallbackFeatures.push(maxEvents === -1 ? 'Unlimited events' : `${maxEvents} active events`);
      }
      if (Number.isFinite(Number(plan.features?.platformFeePercent))) {
        fallbackFeatures.push(`${Number(plan.features?.platformFeePercent)}% platform fee`);
      }
      if (Number.isFinite(Number(plan.features?.teamMembers)) && Number(plan.features?.teamMembers) > 1) {
        fallbackFeatures.push(`${Number(plan.features?.teamMembers)} team members`);
      }

      return {
        ...plan,
        renderedFeatures:
          Array.isArray(plan.displayFeatures) && plan.displayFeatures.length > 0
            ? plan.displayFeatures.slice(0, 6)
            : fallbackFeatures.slice(0, 6),
      };
    });
  }, [pricingPlans]);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo variant="combo" size="sm" href="/" />
          <div className="flex items-center gap-3">
          <Link
            href="/login"
              className="text-sm font-medium text-secondary hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
            <Button size="sm" variant="primary" asChild>
              <Link href="/register">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            {/* Badge */}
            <div className="animate-fade-in inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent mb-8">
              <Zap className="h-3.5 w-3.5" />
              AI-Powered Photo Delivery
            </div>
            
            {/* Headline */}
            <h1 className="animate-slide-up text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
              Find your photos
              <br />
              <span className="text-accent">in seconds</span>
        </h1>
            
            {/* Subheadline */}
            <p className="animate-slide-up delay-100 mt-6 text-lg sm:text-xl text-secondary max-w-xl mx-auto">
              Facial recognition technology that instantly matches you 
              with your event photos. No more endless scrolling.
        </p>

            {/* CTA Buttons */}
            <div className="animate-slide-up delay-200 mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="xl" variant="primary" asChild>
                <Link href="/register">
            Start Free Trial
                  <ArrowRight className="h-4 w-4" />
          </Link>
              </Button>
              <Button size="xl" variant="outline" asChild>
                <Link href="/register">Start Free Trial</Link>
              </Button>
            </div>

            {/* Trust indicators */}
            <p className="animate-fade-in delay-300 mt-8 text-sm text-muted-foreground">
              Free 14-day trial · No credit card required
            </p>
          </div>

          {/* Hero Visual */}
          <div className="animate-scale-in delay-200 mt-20 mx-auto max-w-4xl">
            <div className="relative aspect-[16/10] rounded-2xl bg-gradient-to-br from-muted to-background border border-border overflow-hidden shadow-soft-xl">
              {/* Placeholder for product screenshot */}
              <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
                  <div className="mx-auto h-20 w-20 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                    <Scan className="h-10 w-10 text-accent" />
                  </div>
                  <p className="text-muted-foreground text-sm">Product Preview</p>
                </div>
              </div>
            </div>
          </div>
            </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-6 bg-card">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              How it works
            </h2>
            <p className="mt-4 text-lg text-secondary max-w-xl mx-auto">
              Three simple steps to find all your event photos instantly
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {[
              {
                step: '01',
                title: 'Scan Your Face',
                description: 'Take a quick selfie or upload a photo. Our AI creates a secure facial signature.',
                icon: Scan,
              },
              {
                step: '02',
                title: 'Instant Matching',
                description: 'Our technology searches through thousands of event photos in seconds.',
                icon: Zap,
              },
              {
                step: '03',
                title: 'Get Your Photos',
                description: 'View, download, or purchase all photos featuring you from the event.',
                icon: Camera,
              },
            ].map((item, index) => (
              <div
                key={item.step}
                className="relative group"
              >
                <div className="p-8 rounded-2xl bg-background border border-border transition-all duration-300 hover:shadow-soft-lg hover:border-border/80">
                  <span className="text-xs font-semibold text-accent tracking-wider">
                    STEP {item.step}
                  </span>
                  <div className="mt-4 h-14 w-14 rounded-xl bg-accent/10 flex items-center justify-center">
                    <item.icon className="h-7 w-7 text-accent" />
            </div>
                  <h3 className="mt-6 text-xl font-semibold text-foreground">
                    {item.title}
            </h3>
                  <p className="mt-3 text-secondary leading-relaxed">
                    {item.description}
                  </p>
                </div>
                {index < 2 && (
                  <ChevronRight className="hidden md:block absolute top-1/2 -right-6 h-5 w-5 text-border" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Creators */}
      <section className="py-24 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-sm font-semibold text-accent uppercase tracking-wider">
                For Creators
              </span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-foreground">
                Deliver photos effortlessly
              </h2>
              <p className="mt-6 text-lg text-secondary leading-relaxed">
                Upload your event photos once. Our AI handles face detection and 
                matching so attendees find their photos instantly. Focus on 
                capturing moments, not managing delivery.
              </p>

              <ul className="mt-10 space-y-4">
                {[
                  'Bulk upload thousands of photos',
                  'Automatic face detection and indexing',
                  'Set your own pricing or offer free downloads',
                  'Get paid directly via Stripe',
                  'Real-time analytics dashboard',
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <div className="mt-0.5 h-5 w-5 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-success" />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-10">
                <Button size="lg" variant="primary" asChild>
                  <Link href="/register">
                Start Your Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
                </Button>
              </div>
            </div>

            <div className="relative">
              <div className="aspect-square rounded-3xl bg-gradient-to-br from-accent/5 to-accent/10 border border-border" />
            </div>
          </div>
        </div>
      </section>

      {/* Privacy Section */}
      <section className="py-24 px-6 bg-card">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl mx-auto text-center">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-6">
              <Shield className="h-8 w-8 text-accent" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Privacy first, always
            </h2>
            <p className="mt-6 text-lg text-secondary leading-relaxed">
              Your biometric data is encrypted, event-scoped, and never shared. 
              We're fully compliant with GDPR, CCPA, and BIPA. You control 
              your data — delete it anytime.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success" />
                GDPR Compliant
              </span>
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success" />
                CCPA Compliant
              </span>
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success" />
                BIPA Compliant
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Simple pricing
        </h2>
            <p className="mt-4 text-lg text-secondary max-w-xl mx-auto">
              Start free, scale as you grow. No hidden fees.
        </p>
          </div>

          {pricingLoading ? (
            <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
              {[0, 1, 2].map((placeholder) => (
                <div key={placeholder} className="rounded-2xl border border-border bg-card p-8">
                  <div className="h-5 w-24 rounded bg-muted animate-pulse" />
                  <div className="mt-3 h-4 w-48 rounded bg-muted animate-pulse" />
                  <div className="mt-6 h-10 w-32 rounded bg-muted animate-pulse" />
                  <div className="mt-8 space-y-3">
                    <div className="h-4 w-full rounded bg-muted animate-pulse" />
                    <div className="h-4 w-full rounded bg-muted animate-pulse" />
                    <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : pricingError ? (
            <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-foreground font-medium">Pricing is temporarily unavailable</p>
              <p className="mt-1 text-sm text-secondary">{pricingError}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">
                Showing live creator pricing in {pricingCurrency}.
              </p>
              <div className={`grid gap-6 lg:gap-8 max-w-5xl mx-auto ${renderedPricingPlans.length <= 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
                {renderedPricingPlans.map((plan) => (
                  <div
                    key={plan.planId || plan.planCode}
                    className={`relative rounded-2xl p-8 transition-all duration-300 ${
                      plan.isPopular
                        ? 'bg-foreground text-background ring-1 ring-foreground'
                        : 'bg-card border border-border hover:shadow-soft-lg'
                    }`}
                  >
                    {plan.isPopular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1 text-xs font-semibold text-white">
                        Most Popular
                      </span>
                    )}
                    <h3 className={`text-lg font-semibold ${plan.isPopular ? 'text-background' : 'text-foreground'}`}>
                      {plan.name}
                    </h3>
                    <p className={`mt-1 text-sm ${plan.isPopular ? 'text-background/70' : 'text-secondary'}`}>
                      {plan.description}
                    </p>
                    <div className="mt-6">
                      <span className={`text-4xl font-bold ${plan.isPopular ? 'text-background' : 'text-foreground'}`}>
                        {plan.formattedMonthly}
                      </span>
                      <span className={plan.isPopular ? 'text-background/70' : 'text-secondary'}>/month</span>
                    </div>
                    <ul className="mt-8 space-y-3">
                      {(plan.renderedFeatures || []).map((feature) => (
                        <li key={`${plan.planCode}-${feature}`} className="flex items-start gap-3">
                          <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${plan.isPopular ? 'text-accent' : 'text-success'}`} />
                          <span className={`text-sm ${plan.isPopular ? 'text-background/90' : 'text-foreground'}`}>
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Button className="w-full mt-8" variant={plan.isPopular ? 'primary' : 'outline'} asChild>
                      <Link href="/register">Get Started</Link>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 bg-card">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Ready to get started?
          </h2>
          <p className="mt-4 text-lg text-secondary">
            Join thousands of photographers delivering photos the modern way.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="xl" variant="primary" asChild>
              <Link href="/register">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="xl" variant="outline" asChild>
              <Link href="/contact">Contact Sales</Link>
            </Button>
            </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Logo variant="combo" size="sm" href="/" />
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-secondary">
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <Link href="/contact" className="hover:text-foreground transition-colors">
                Contact
              </Link>
              <Link href="/help" className="hover:text-foreground transition-colors">
                Help
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Ferchr
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
