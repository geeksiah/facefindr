'use client';

import {
  MoreHorizontal,
  Eye,
  Ban,
  CheckCircle,
  Trash2,
  Download,
  UserX,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { formatDate, formatCurrency, getInitials } from '@/lib/utils';

interface Attendee {
  id: string;
  email: string | null;
  display_name: string | null;
  face_tag: string;
  profile_photo_url: string | null;
  status: string;
  email_verified: boolean;
  created_at: string;
  entitlements: Array<{ id: string }>;
  transactions: Array<{ id: string; gross_amount: number }>;
}

interface AttendeeListProps {
  attendees: Attendee[];
  total: number;
  page: number;
  limit: number;
}

interface MenuState {
  id: string;
  top: number;
  right: number;
}

export function AttendeeList({ attendees, total, page, limit }: AttendeeListProps) {
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
  const openMenu = (attendeeId: string) => {
    const button = buttonRefs.current[attendeeId];
    if (button) {
      const rect = button.getBoundingClientRect();
      setActiveMenu({
        id: attendeeId,
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
  };

  const closeMenu = () => setActiveMenu(null);

  const handleAction = async (attendeeId: string, action: string) => {
    setIsLoading(attendeeId);
    closeMenu();

    try {
      const response = await fetch(`/api/attendees/${attendeeId}/${action}`, {
        method: 'POST',
      });

      if (response.ok) {
        if (action === 'export-data') {
          // Download the exported data
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `attendee-data-${attendeeId}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          router.refresh();
        }
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

  if (attendees.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">No attendees found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-visible">
        <div className="overflow-x-auto overflow-y-visible">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">
                Attendee
              </th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">
                FaceTag
              </th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">
                Status
              </th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">
                Purchases
              </th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">
                Spent
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
            {attendees.map((attendee) => {
              const totalSpent = attendee.transactions?.reduce(
                (sum, t) => sum + (t.gross_amount || 0), 
                0
              ) || 0;

              return (
                <tr 
                  key={attendee.id} 
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={(e) => {
                    // Don't navigate if clicking on action button
                    if ((e.target as HTMLElement).closest('button, a')) return;
                    window.location.href = `/attendees/${attendee.id}`;
                  }}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {attendee.profile_photo_url ? (
                        <img
                          src={attendee.profile_photo_url}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-foreground">
                          {getInitials(attendee.display_name || attendee.email || 'A')}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-foreground">
                          {attendee.display_name || 'Anonymous'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {attendee.email || 'No email'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-foreground">
                      {attendee.face_tag}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                      statusColors[attendee.status]
                    }`}>
                      {attendee.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-foreground">
                    {attendee.entitlements?.length || 0}
                  </td>
                  <td className="px-6 py-4 text-foreground">
                    {formatCurrency(totalSpent)}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-sm">
                    {formatDate(attendee.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end">
                      <button
                        ref={(el) => {
                          buttonRefs.current[attendee.id] = el;
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (activeMenu?.id === attendee.id) {
                            closeMenu();
                          } else {
                            openMenu(attendee.id);
                          }
                        }}
                        className="p-2 rounded-lg hover:bg-muted transition-colors"
                        disabled={isLoading === attendee.id}
                      >
                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
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
                const attendee = attendees.find(a => a.id === activeMenu.id);
                if (!attendee) return null;
                return (
                  <>
                    <Link
                      href={`/attendees/${attendee.id}`}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                      View Details
                    </Link>
                    {attendee.status === 'suspended' ? (
                      <button
                        onClick={() => handleAction(attendee.id, 'unsuspend')}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Unsuspend
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAction(attendee.id, 'suspend')}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        <Ban className="h-4 w-4" />
                        Suspend
                      </button>
                    )}
                    <button
                      onClick={() => handleAction(attendee.id, 'export-data')}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Export Data (GDPR)
                    </button>
                    <button
                      onClick={() => handleAction(attendee.id, 'delete-face')}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-orange-500 hover:bg-muted transition-colors"
                    >
                      <UserX className="h-4 w-4" />
                      Delete Face Data
                    </button>
                    <hr className="my-1 border-border" />
                    <button
                      onClick={() => handleAction(attendee.id, 'delete')}
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
