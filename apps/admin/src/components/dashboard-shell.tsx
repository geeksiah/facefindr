'use client';

import { Menu, X } from 'lucide-react';
import { useState } from 'react';

import { Sidebar } from '@/components/sidebar';

interface DashboardShellProps {
  admin: {
    name: string;
    email: string;
    role: string;
  };
  children: React.ReactNode;
}

export function DashboardShell({ admin, children }: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <div className="hidden lg:block fixed left-0 top-0 z-40">
        <Sidebar admin={admin} className="h-screen w-64" />
      </div>

      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-card/95 backdrop-blur">
        <div className="h-full px-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="p-2 rounded-lg hover:bg-muted"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <p className="text-sm font-semibold text-foreground">Admin Portal</p>
          <div className="w-9" />
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu overlay"
          />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[85vw]">
            <Sidebar
              admin={admin}
              className="h-full w-full"
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      <main className="lg:pl-64 pt-14 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
