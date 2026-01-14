import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  User,
  Camera,
  Settings,
  Scan,
  Image as ImageIcon,
  Bell,
  LogOut,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { Logo } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export default async function GalleryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const userType = user.user_metadata?.user_type;
  
  // Redirect photographers to dashboard
  if (userType === 'photographer') {
    redirect('/dashboard');
  }

  // Get attendee profile
  const { data: profile } = await supabase
    .from('attendees')
    .select('*')
    .eq('id', user.id)
    .single();

  const navItems = [
    { href: '/gallery', label: 'My Photos', icon: ImageIcon },
    { href: '/gallery/scan', label: 'Find Photos', icon: Scan },
    { href: '/gallery/events', label: 'My Events', icon: Camera },
    { href: '/gallery/notifications', label: 'Notifications', icon: Bell },
    { href: '/gallery/profile', label: 'Profile', icon: User },
    { href: '/gallery/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar - Hidden on mobile */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-border bg-card lg:flex">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-6">
          <Logo variant="combo" size="sm" href="/gallery" />
        </div>

        {/* User Profile Card */}
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white font-semibold">
              {profile?.display_name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">
                {profile?.display_name || 'User'}
              </p>
              {profile?.face_tag && (
                <p className="text-xs text-accent truncate">{profile.face_tag}</p>
              )}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-secondary transition-colors hover:bg-muted hover:text-foreground"
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Bottom Actions */}
        <div className="border-t border-border p-4 space-y-2">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-sm text-secondary">Theme</span>
            <ThemeToggle />
          </div>
          <Link
            href="/api/auth/logout"
            className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-secondary transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </Link>
        </div>
      </aside>

      {/* Mobile Header - Hidden on desktop */}
      <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border bg-card/95 backdrop-blur-sm px-4 lg:hidden">
        <Logo variant="combo" size="sm" href="/gallery" />
        
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/gallery/profile"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white font-medium text-sm"
          >
            {profile?.display_name?.charAt(0).toUpperCase() || 'U'}
          </Link>
        </div>
      </header>

      {/* Mobile Bottom Navigation - Hidden on desktop */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card lg:hidden">
        <div className="flex h-16 items-center justify-around">
          {navItems.slice(0, 5).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 p-2 text-secondary transition-colors hover:text-accent"
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label.split(' ')[0]}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-16 pb-20 lg:pl-64 lg:pt-0 lg:pb-0 min-h-screen overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
