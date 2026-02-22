'use client';

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
  Users,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { Logo } from '@/components/ui/logo';
import { useConfirm } from '@/components/ui/toast';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

interface SidebarUser {
  email: string;
  displayName: string;
  profilePhotoUrl?: string | null;
  faceTag?: string | null;
  plan: 'free' | 'starter' | 'pro' | 'studio';
  advancedAnalyticsEnabled?: boolean;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  exact?: boolean;
  badge?: string;
  locked?: boolean;
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
  { name: 'Collaborations', href: '/dashboard/collaborations', icon: Users },
  { name: 'Upload', href: '/dashboard/upload', icon: Upload },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'Followers', href: '/dashboard/followers', icon: Users },
  { name: 'Connections', href: '/dashboard/connections', icon: UserPlus },
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
  const router = useRouter();
  const safePathname = pathname ?? '';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();
  const toast = useToast();

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out? Any unsaved changes will be lost.',
      confirmLabel: 'Sign Out',
      cancelLabel: 'Stay',
      variant: 'destructive',
    });
    
    if (confirmed) {
      setIsLoggingOut(true);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let redirectTo = '/login';
      try {
        const response = await fetch('/api/auth/logout', { method: 'POST', signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        redirectTo = data?.redirectTo || '/login';
        toast.success('Signed out', 'You have been signed out.');
      } catch (error) {
        console.error('Logout error:', error);
        toast.info('Signed out', 'Session ended. Redirecting to login.');
      } finally {
        clearTimeout(timeout);
        try {
          const channel = new BroadcastChannel('auth');
          channel.postMessage({ type: 'signed_out' });
          channel.close();
        } catch {}
        router.replace(redirectTo);
        router.refresh();
        setIsLoggingOut(false);
      }
    }
  };

  // Check if a nav item is active
  const isActive = (item: NavItem) => {
    if (item.exact) {
      return safePathname === item.href;
    }
    return safePathname === item.href || safePathname.startsWith(`${item.href}/`);
  };

  const resolvedMainNavigation: NavItem[] = mainNavigation.map((item) => {
    if (item.href === '/dashboard/analytics' && user.advancedAnalyticsEnabled === false) {
      return {
        ...item,
        badge: 'Locked',
        locked: true,
      };
    }
    return item;
  });

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
            : 'text-secondary hover:bg-muted hover:text-foreground',
          item.locked && !active ? 'opacity-80' : ''
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

  const renderSidebarContent = () => (
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
            {user.faceTag && (
              <p className="truncate text-xs font-mono text-accent">{user.faceTag}</p>
            )}
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
          {resolvedMainNavigation.map((item) => (
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
          disabled={isLoggingOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-secondary transition-all duration-200 hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-5 w-5" />
          {isLoggingOut ? 'Signing out...' : 'Sign out'}
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
        {renderSidebarContent()}
      </aside>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-border bg-card lg:block">
        {renderSidebarContent()}
      </aside>

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog />
    </>
  );
}
