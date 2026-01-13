'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  Upload,
  BarChart3,
  CreditCard,
  Settings,
  HelpCircle,
  LogOut,
  X,
  Menu,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';
import { logout } from '@/app/(auth)/actions';
import { Logo } from '@/components/ui/logo';

// ============================================
// TYPES
// ============================================

interface SidebarUser {
  email: string;
  displayName: string;
  profilePhotoUrl?: string | null;
  plan: 'free' | 'starter' | 'pro' | 'studio';
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  exact?: boolean;
  badge?: string;
}

interface DashboardSidebarProps {
  user: SidebarUser;
}

// ============================================
// NAVIGATION CONFIG
// ============================================

const mainNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, exact: true },
  { name: 'Events', href: '/dashboard/events', icon: Calendar },
  { name: 'Upload', href: '/dashboard/upload', icon: Upload },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
];

const accountNavigation: NavItem[] = [
  { name: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  { name: 'Help', href: '/dashboard/help', icon: HelpCircle },
];

// ============================================
// PLAN BADGE COMPONENT
// ============================================

function PlanBadge({ plan }: { plan: string }) {
  const planConfig = {
    free: { label: 'Free', variant: 'default' as const },
    starter: { label: 'Starter', variant: 'starter' as const },
    pro: { label: 'Pro', variant: 'pro' as const },
    studio: { label: 'Studio', variant: 'studio' as const },
  };

  const config = planConfig[plan as keyof typeof planConfig] || planConfig.free;

  const variantStyles = {
    default: 'bg-muted text-muted-foreground',
    starter: 'bg-accent/10 text-accent',
    pro: 'bg-accent/10 text-accent',
    studio: 'bg-accent/10 text-accent',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantStyles[config.variant]
      )}
    >
      {plan !== 'free' && <Sparkles className="h-3 w-3" />}
      {config.label}
    </span>
  );
}

// ============================================
// SIDEBAR COMPONENT
// ============================================

export function DashboardSidebar({ user }: DashboardSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  // Check if a nav item is active
  const isActive = (item: NavItem) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = isActive(item);

    return (
      <Link
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
          active
            ? 'bg-foreground text-background'
            : 'text-secondary hover:bg-muted hover:text-foreground'
        )}
      >
        <item.icon
          className={cn(
            'h-5 w-5 transition-colors',
            active ? 'text-background' : 'text-secondary group-hover:text-foreground'
          )}
        />
        {item.name}
        {item.badge && (
          <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <Logo variant="combo" size="sm" href="/dashboard" showText={true} />
      </div>

      {/* User Profile */}
      <div className="border-b border-border px-4 pb-4">
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent flex-shrink-0">
            {user.profilePhotoUrl ? (
              <img
                src={user.profilePhotoUrl}
                alt={user.displayName}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <span className="text-sm font-semibold">
                {user.displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{user.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <PlanBadge plan={user.plan} />
          {user.plan === 'free' && (
            <Link
              href="/dashboard/billing"
              className="text-xs font-medium text-accent hover:text-accent/80 transition-colors"
            >
              Upgrade
            </Link>
          )}
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-6">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Main
        </p>
        <div className="space-y-1">
          {mainNavigation.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>

        <div className="my-6 h-px bg-border" />

        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Account
        </p>
        <div className="space-y-1">
          {accountNavigation.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
      </nav>

      {/* Logout */}
      <div className="border-t border-border p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-secondary transition-all duration-200 hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-xl bg-card p-2.5 shadow-soft border border-border lg:hidden"
      >
        <Menu className="h-5 w-5 text-foreground" />
      </button>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 transform bg-card border-r border-border transition-transform duration-300 ease-out lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-border bg-card lg:block">
        <SidebarContent />
      </aside>
    </>
  );
}
