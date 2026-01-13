'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, Search, Plus, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';

export function DashboardHeader() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useState(() => {
    setMounted(true);
  });

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card/95 px-6 backdrop-blur-xl">
      {/* Left side */}
      <div className="flex items-center gap-4">
        {/* Mobile spacer for menu button */}
        <div className="w-12 lg:hidden" />
        
        {/* Search */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            name="dashboard-search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            placeholder="Search events, photos..."
            className="h-10 w-72 rounded-xl border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Mobile search toggle */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors sm:hidden"
        >
          <Search className="h-5 w-5" />
        </button>

        {/* Theme Toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>
        )}

        {/* Notifications */}
        <button className="relative rounded-xl p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
        </button>

        {/* Create Event Button */}
        <Button asChild size="sm" variant="primary" className="ml-1">
          <Link href="/dashboard/events/new">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Event</span>
          </Link>
        </Button>
      </div>

      {/* Mobile search bar (expandable) */}
      {searchOpen && (
        <div className="absolute inset-x-0 top-full border-b border-border bg-card p-4 sm:hidden">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              name="dashboard-search-mobile"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              placeholder="Search events, photos..."
              className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
            />
          </div>
        </div>
      )}
    </header>
  );
}
