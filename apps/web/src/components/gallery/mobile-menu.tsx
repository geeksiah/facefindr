'use client';

import {
  Menu,
  X,
  Search,
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
  LogOut,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

interface MobileMenuProps {
  profileInitial: string;
  profilePhotoUrl?: string | null;
  faceTag?: string | null;
  displayName?: string | null;
}

interface SearchResult {
  id: string;
  name?: string;
  display_name?: string;
  face_tag?: string;
  public_profile_slug?: string;
  profile_photo_url?: string;
  type: 'event' | 'photographer' | 'attendee';
}

const menuItems = [
  { href: '/gallery', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/gallery/photos', label: 'My Photos', icon: ImageIcon },
  { href: '/gallery/scan', label: 'Find Photos', icon: Scan },
  { href: '/gallery/events', label: 'My Events', icon: Camera },
  { href: '/gallery/vault', label: 'Photo Vault', icon: Lock },
  { href: '/gallery/drop-in', label: 'Drop-In', icon: Zap },
  { href: '/gallery/following', label: 'Following', icon: Users },
  { href: '/gallery/notifications', label: 'Notifications', icon: Bell },
  { href: '/gallery/billing', label: 'Billing', icon: CreditCard },
  { href: '/gallery/settings', label: 'Settings', icon: Settings },
  { href: '/gallery/profile', label: 'Profile', icon: User },
];

export function MobileMenu({ profileInitial, profilePhotoUrl, faceTag, displayName }: MobileMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [mounted, setMounted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Close menu on navigation
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setQuery('');
  }, [pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [menuOpen]);

  // Close search on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [searchOpen]);

  const performSearch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 1) {
      setResults([]);
      return;
    }

    const id = ++requestRef.current;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/social/search?q=${encodeURIComponent(trimmed.toLowerCase())}&type=all&limit=8`,
        { signal: controller.signal, cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      if (id === requestRef.current) {
        setResults([
          ...(data.photographers || []).map((p: any) => ({ ...p, type: 'photographer' as const })),
          ...(data.users || []).map((u: any) => ({ ...u, type: 'attendee' as const })),
        ]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (id === requestRef.current) setResults([]);
    } finally {
      if (id === requestRef.current) setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void performSearch(query); }, 300);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const handleResultClick = (result: SearchResult) => {
    setSearchOpen(false);
    setQuery('');
    if (result.type === 'attendee') {
      const slug = result.public_profile_slug || result.face_tag?.replace(/^@/, '') || result.id;
      router.push(`/u/${slug}`);
    } else {
      const slug = result.public_profile_slug || result.face_tag?.replace(/^@/, '') || result.id;
      router.push(`/c/${slug}`);
    }
  };

  // Render overlays via portal to escape header stacking context
  const searchOverlay = searchOpen && mounted ? createPortal(
    <div
      ref={searchContainerRef}
      className="fixed left-0 right-0 border-b border-border bg-card p-4 shadow-lg"
      style={{ top: '64px', zIndex: 9998 }}
    >
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          autoComplete="off"
          placeholder="Search people by name or @FaceTag"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-10 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          style={{ fontSize: '16px' }}
          autoFocus
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {query.trim().length >= 1 && (
        <div className="mt-2 bg-card border border-border rounded-xl overflow-hidden max-h-60 overflow-y-auto">
          {isSearching ? (
            <div className="p-4 text-center text-muted-foreground text-sm">Searching...</div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">No results found</div>
          ) : (
            results.map((result) => (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => handleResultClick(result)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-left transition-colors"
              >
                {result.profile_photo_url ? (
                  <img
                    src={result.profile_photo_url}
                    alt={result.display_name || ''}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    result.type === 'attendee'
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'bg-purple-500/10 text-purple-500'
                  }`}>
                    {result.type === 'attendee' ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {result.name || result.display_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {result.face_tag || (result.type === 'attendee' ? 'Attendee' : 'Creator')}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>,
    document.body
  ) : null;

  const menuOverlay = menuOpen && mounted ? createPortal(
    <div
      className="fixed left-0 right-0 bottom-0 bg-card overflow-y-auto"
      style={{ top: '64px', zIndex: 9998 }}
    >
      {/* User card */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        {profilePhotoUrl ? (
          <img
            src={profilePhotoUrl}
            alt={displayName || ''}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white font-semibold">
            {profileInitial}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{displayName || 'User'}</p>
          {faceTag && <p className="text-xs text-accent truncate">{faceTag}</p>}
        </div>
      </div>

      {/* Navigation items */}
      <nav className="p-2">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/gallery' && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-secondary hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-border">
        <button
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'GET' });
            router.push('/login');
          }}
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 w-full transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {/* Search icon */}
      <button
        onClick={() => { setSearchOpen(!searchOpen); setMenuOpen(false); }}
        className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Search className="h-5 w-5" />
      </button>

      {/* Menu toggle */}
      <button
        onClick={() => { setMenuOpen(!menuOpen); setSearchOpen(false); setQuery(''); }}
        className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {searchOverlay}
      {menuOverlay}
    </>
  );
}
