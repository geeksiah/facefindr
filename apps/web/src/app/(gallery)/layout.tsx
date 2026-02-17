import {
  User,
  Camera,
  Settings,
  Scan,
  Image as ImageIcon,
  Bell,
  Users,
  CreditCard,
  Lock,
  Zap,
  LayoutDashboard,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LogoutButton } from '@/components/auth/logout-button';
import { GallerySearch } from '@/components/gallery';
import { MobileMenu } from '@/components/gallery/mobile-menu';
import { Logo } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { normalizeUserType } from '@/lib/user-type';
import { createClient } from '@/lib/supabase/server';

export default async function GalleryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const userType = normalizeUserType(user.user_metadata?.user_type);
  
  // Redirect creators to dashboard
  if (userType === 'creator') {
    redirect('/dashboard');
  }

  // Get attendee profile
  const { data: profile } = await supabase
    .from('attendees')
    .select('*')
    .eq('id', user.id)
    .single();

  // Navigation items - desktop sidebar shows all, mobile bottom nav shows first 5
  // mobileLabel is the short label for the mobile bottom nav
  const navItems = [
    { href: '/gallery', label: 'Dashboard', mobileLabel: 'Home', icon: LayoutDashboard },
    { href: '/gallery/photos', label: 'My Photos', mobileLabel: 'Photos', icon: ImageIcon },
    { href: '/gallery/scan', label: 'Find Photos', mobileLabel: 'Scan', icon: Scan },
    { href: '/gallery/events', label: 'My Events', mobileLabel: 'Events', icon: Camera },
    { href: '/gallery/vault', label: 'Photo Vault', mobileLabel: 'Vault', icon: Lock },
    { href: '/gallery/drop-in', label: 'Drop-In', icon: Zap },
    { href: '/gallery/following', label: 'Following', icon: Users },
    { href: '/gallery/notifications', label: 'Notifications', icon: Bell },
    { href: '/gallery/billing', label: 'Billing', icon: CreditCard },
    { href: '/gallery/settings', label: 'Settings', icon: Settings },
    { href: '/gallery/profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      {/* Desktop Sidebar - Hidden on mobile */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-border bg-card lg:flex">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-6">
          <Logo variant="combo" size="sm" href="/gallery" />
        </div>

        {/* User Profile Card */}
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-3 mb-3">
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
          {/* Search */}
          <GallerySearch />
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
          <LogoutButton className="rounded-xl px-4 py-3 w-full" />
        </div>
      </aside>

      {/* Mobile Header - Hidden on desktop */}
      <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border bg-card/95 backdrop-blur-sm px-4 lg:hidden">
        <Logo variant="combo" size="sm" href="/gallery" />

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <MobileMenu
            profileInitial={profile?.display_name?.charAt(0).toUpperCase() || 'U'}
            profilePhotoUrl={profile?.profile_photo_url}
            faceTag={profile?.face_tag}
            displayName={profile?.display_name}
          />
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
              <span className="text-[10px] font-medium">{item.mobileLabel || item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="min-h-screen overflow-x-hidden overflow-y-auto pt-16 pb-20 lg:pl-64 lg:pt-0 lg:pb-0">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
