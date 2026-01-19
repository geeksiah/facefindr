'use client';

import { Home, ArrowLeft, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

export default function NotFound() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        setIsLoggedIn(!!user);
      } catch (e) {
        setIsLoggedIn(false);
      } finally {
        setChecking(false);
      }
    }
    
    checkAuth();
  }, []);

  const homeUrl = isLoggedIn ? '/dashboard' : '/';
  const homeLabel = isLoggedIn ? 'Go to Dashboard' : 'Go Home';
  const HomeIcon = isLoggedIn ? LayoutDashboard : Home;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Illustration */}
        <div className="relative mx-auto w-48 h-48 mb-8">
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Camera body */}
            <rect
              x="40"
              y="70"
              width="120"
              height="80"
              rx="12"
              className="fill-muted stroke-border"
              strokeWidth="2"
            />
            {/* Lens */}
            <circle
              cx="100"
              cy="110"
              r="30"
              className="fill-background stroke-border"
              strokeWidth="3"
            />
            <circle
              cx="100"
              cy="110"
              r="20"
              className="fill-muted"
            />
            <circle
              cx="100"
              cy="110"
              r="8"
              className="fill-foreground/20"
            />
            {/* Flash */}
            <rect
              x="55"
              y="55"
              width="30"
              height="15"
              rx="4"
              className="fill-muted stroke-border"
              strokeWidth="1.5"
            />
            {/* Question marks */}
            <text
              x="145"
              y="55"
              className="fill-accent text-2xl font-bold"
              fontSize="28"
            >
              ?
            </text>
            <text
              x="35"
              y="170"
              className="fill-accent/50 text-xl font-bold"
              fontSize="20"
            >
              ?
            </text>
            <text
              x="155"
              y="175"
              className="fill-accent/30 text-lg font-bold"
              fontSize="16"
            >
              ?
            </text>
          </svg>
        </div>

        {/* Content */}
        <h1 className="text-6xl font-bold text-foreground mb-2">404</h1>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          Page Not Found
        </h2>
        <p className="text-secondary mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Let&apos;s get you back on track.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {!checking && (
            <Link
              href={homeUrl}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
            >
              <HomeIcon className="h-4 w-4" />
              {homeLabel}
            </Link>
          )}
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
        </div>

        {/* Help text */}
        <p className="mt-8 text-sm text-muted-foreground">
          Looking for something specific?{' '}
          <Link href="/gallery/events" className="text-accent hover:underline">
            Browse events
          </Link>
        </p>
      </div>
    </div>
  );
}
