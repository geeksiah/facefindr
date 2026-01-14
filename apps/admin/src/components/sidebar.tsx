'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  UserCircle,
  CreditCard,
  Receipt,
  Calendar,
  Printer,
  Settings,
  FileText,
  Bell,
  AlertTriangle,
  BarChart3,
  LogOut,
  Shield,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navigation: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Analytics', href: '/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Users',
    items: [
      { label: 'Photographers', href: '/photographers', icon: Users },
      { label: 'Attendees', href: '/attendees', icon: UserCircle },
    ],
  },
  {
    label: 'Financial',
    items: [
      { label: 'Payouts', href: '/payouts', icon: CreditCard },
      { label: 'Transactions', href: '/transactions', icon: Receipt },
    ],
  },
  {
    label: 'Content',
    items: [
      { label: 'Events', href: '/events', icon: Calendar },
      { label: 'Print Products', href: '/print-products', icon: Printer },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Regions & Providers', href: '/regions', icon: Settings },
      { label: 'Platform Settings', href: '/settings', icon: Settings },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Announcements', href: '/announcements', icon: Bell },
      { label: 'Disputes', href: '/disputes', icon: AlertTriangle },
      { label: 'Audit Logs', href: '/audit-logs', icon: FileText },
    ],
  },
];

interface SidebarProps {
  admin: {
    name: string;
    email: string;
    role: string;
  };
}

export function Sidebar({ admin }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const roleLabels: Record<string, string> = {
    super_admin: 'Super Admin',
    finance_admin: 'Finance Admin',
    support_admin: 'Support Admin',
    readonly_admin: 'Read Only',
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-border">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-bold text-foreground">FaceFindr</h1>
          <p className="text-xs text-muted-foreground">Admin Portal</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navigation.map((group) => (
          <div key={group.label} className="mb-6">
            <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-destructive text-destructive-foreground">
                        {item.badge}
                      </span>
                    )}
                    {isActive && <ChevronRight className="w-4 h-4" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-foreground">
            {admin.name.split(' ').map(n => n[0]).join('').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{admin.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {roleLabels[admin.role] || admin.role}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
