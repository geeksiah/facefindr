'use client';

import {
  MoreHorizontal,
  Eye,
  Ban,
  CheckCircle,
  Trash2,
  KeyRound,
  Mail,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { formatDate, getInitials } from '@/lib/utils';

interface Photographer {
  id: string;
  email: string;
  display_name: string | null;
  business_name: string | null;
  profile_photo_url: string | null;
  status: string;
  email_verified: boolean;
  created_at: string;
  subscriptions: {
    plan_code: string;
    status: string;
  } | null;
  wallets: Array<{ id: string; provider: string }>;
  events: Array<{ id: string }>;
}

interface PhotographerListProps {
  photographers: Photographer[];
  total: number;
  page: number;
  limit: number;
}

interface MenuState {
  id: string;
  top: number;
  right: number;
}

export function PhotographerList({ photographers, total, page, limit }: PhotographerListProps) {
  const router = useRouter();
  const [activeMenu, setActiveMenu] = useState<MenuState | null>(null);
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const totalPages = Math.ceil(total / limit);

  // Track if component is mounted (for portal)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Update menu position on scroll/resize
  useEffect(() => {
    if (activeMenu) {
      const updatePosition = () => {
        const button = buttonRefs.current[activeMenu.id];
        if (button) {
          const rect = button.getBoundingClientRect();
          setActiveMenu({
            id: activeMenu.id,
            top: rect.bottom + 4,
            right: window.innerWidth - rect.right,
          });
        }
      };
      
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [activeMenu?.id]);

  // Open menu and calculate position
  const openMenu = (photographerId: string) => {
    const button = buttonRefs.current[photographerId];
    if (button) {
      const rect = button.getBoundingClientRect();
      setActiveMenu({
        id: photographerId,
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
  };

  const closeMenu = () => setActiveMenu(null);

  const handleAction = async (photographerId: string, action: string) => {
    setIsLoading(photographerId);
    closeMenu();

    try {
      const response = await fetch(`/api/photographers/${photographerId}/${action}`, {
        method: 'POST',
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error(`Action ${action} failed:`, error);
    } finally {
      setIsLoading(null);
    }
  };

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/10 text-green-500',
    pending_verification: 'bg-yellow-500/10 text-yellow-500',
    suspended: 'bg-red-500/10 text-red-500',
  };

  const planColors: Record<string, string> = {
    free: 'bg-gray-500/10 text-gray-500',
    starter: 'bg-blue-500/10 text-blue-500',
    pro: 'bg-purple-500/10 text-purple-500',
    studio: 'bg-orange-500/10 text-orange-500',
  };

  if (photographers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">No photographers found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">
                Photographer
              </th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">
                Plan
              </th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">
                Status
              </th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">
                Events
              </th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">
                Joined
              </th>
              <th className="text-right px-6 py-3 text-sm font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {photographers.map((photographer) => (
              <tr 
                key={photographer.id} 
                className="hover:bg-muted/30 transition-colors cursor-pointer relative"
                onClick={(e) => {
                  // Don't navigate if clicking on action button
                  if ((e.target as HTMLElement).closest('button, a')) return;
                  window.location.href = `/photographers/${photographer.id}`;
                }}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {photographer.profile_photo_url ? (
                      <img
                        src={photographer.profile_photo_url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-foreground">
                        {getInitials(photographer.display_name || photographer.email)}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-foreground">
                        {photographer.display_name || 'No name'}
                      </p>
                      <p className="text-sm text-muted-foreground">{photographer.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                    planColors[photographer.subscriptions?.plan_code || 'free']
                  }`}>
                    {photographer.subscriptions?.plan_code || 'Free'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                    statusColors[photographer.status]
                  }`}>
                    {photographer.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 text-foreground">
                  {photographer.events?.length || 0}
                </td>
                <td className="px-6 py-4 text-muted-foreground text-sm">
                  {formatDate(photographer.created_at)}
                </td>
                <td className="px-6 py-4">
                  <div className="flex justify-end">
                    <button
                      ref={(el) => {
                        buttonRefs.current[photographer.id] = el;
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (activeMenu?.id === photographer.id) {
                          closeMenu();
                        } else {
                          openMenu(photographer.id);
                        }
                      }}
                      className="p-2 rounded-lg hover:bg-muted transition-colors"
                      disabled={isLoading === photographer.id}
                    >
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={`?page=${page - 1}`}
              className={`p-2 rounded-lg border border-border hover:bg-muted transition-colors ${
                page <= 1 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <Link
              href={`?page=${page + 1}`}
              className={`p-2 rounded-lg border border-border hover:bg-muted transition-colors ${
                page >= totalPages ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Dropdown Menu Portal */}
      {mounted && activeMenu && createPortal(
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-[9998]" 
            onClick={closeMenu}
          />
          {/* Menu */}
          <div 
            className="fixed w-48 rounded-lg border border-border bg-card shadow-xl z-[9999]"
            style={{ 
              top: activeMenu.top, 
              right: activeMenu.right,
            }}
          >
            <div className="py-1">
              {(() => {
                const photographer = photographers.find(p => p.id === activeMenu.id);
                if (!photographer) return null;
                return (
                  <>
                    <Link
                      href={`/photographers/${photographer.id}`}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                      View Details
                    </Link>
                    {photographer.status === 'suspended' ? (
                      <button
                        onClick={() => handleAction(photographer.id, 'unsuspend')}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Unsuspend
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAction(photographer.id, 'suspend')}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        <Ban className="h-4 w-4" />
                        Suspend
                      </button>
                    )}
                    <button
                      onClick={() => handleAction(photographer.id, 'reset-password')}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <KeyRound className="h-4 w-4" />
                      Reset Password
                    </button>
                    <button
                      onClick={() => handleAction(photographer.id, 'send-verification')}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Mail className="h-4 w-4" />
                      Send Verification
                    </button>
                    <hr className="my-1 border-border" />
                    <button
                      onClick={() => handleAction(photographer.id, 'delete')}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-muted transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Account
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
