'use client';

import { Bell, Plus, Send, Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

import { formatDateTime } from '@/lib/utils';

interface Announcement {
  id: string;
  title: string;
  content: string;
  target: string;
  status: string;
  send_email: boolean;
  send_push: boolean;
  send_sms: boolean;
  country_code: string | null;
  sent_count: number;
  queued_count?: number;
  delivered_count?: number;
  failed_count?: number;
  delivery_summary?: {
    total?: number;
    pending?: number;
    successful?: number;
    failed?: number;
    updated_at?: string;
  } | null;
  created_at: string;
  sent_at: string | null;
  delivery_synced_at?: string | null;
}

interface RegionOption {
  region_code: string;
  region_name: string;
  is_active: boolean;
}

export default function AnnouncementsPage() {
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    target: 'all',
    send_email: false,
    send_push: true,
    send_sms: false,
    country_code: '',
  });

  useEffect(() => {
    fetchAnnouncements();
    fetchRegions();
  }, []);

  const fetchAnnouncements = async () => {
    const response = await fetch('/api/admin/announcements');
    if (response.ok) {
      const data = await response.json();
      setAnnouncements(data.announcements || []);
    }
    setIsLoading(false);
  };

  const fetchRegions = async () => {
    const response = await fetch('/api/admin/regions');
    if (response.ok) {
      const data = await response.json();
      setRegions(data.regions || []);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending('create');
    
    try {
      const response = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setShowForm(false);
        setFormData({
          title: '',
          content: '',
          target: 'all',
          send_email: false,
          send_push: true,
          send_sms: false,
          country_code: '',
        });
        fetchAnnouncements();
      }
    } catch (error) {
      console.error('Create failed:', error);
    } finally {
      setSending(null);
    }
  };

  const handleSend = async (id: string) => {
    setSending(id);
    try {
      const response = await fetch(`/api/admin/announcements/${id}/send`, {
        method: 'POST',
      });
      if (response.ok) {
        fetchAnnouncements();
      }
    } catch (error) {
      console.error('Send failed:', error);
    } finally {
      setSending(null);
    }
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-500/10 text-gray-500',
    scheduled: 'bg-yellow-500/10 text-yellow-500',
    queued: 'bg-blue-500/10 text-blue-500',
    sending: 'bg-indigo-500/10 text-indigo-500',
    sent: 'bg-green-500/10 text-green-500',
    delivered: 'bg-green-500/10 text-green-500',
    partially_delivered: 'bg-orange-500/10 text-orange-500',
    failed: 'bg-red-500/10 text-red-500',
    cancelled: 'bg-red-500/10 text-red-500',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Announcements</h1>
          <p className="text-muted-foreground mt-1">
            Send platform announcements to users
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Announcement
        </button>
      </div>

      {/* Info notice */}
      <div className="rounded-xl border border-border bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Note:</strong> Sent announcements are automatically deleted after 24 hours. 
          Push notifications require FCM/APN configuration, and email notifications require an email provider to be set up in the Regions & Providers settings.
        </p>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div 
          className="fixed bg-black/50 flex items-center justify-center z-50"
          style={{
            position: 'fixed',
            inset: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100dvw',
            height: '100dvh',
            margin: 0,
            padding: 0,
          }}
        >
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg mx-4 my-4">
            <h2 className="text-xl font-bold text-foreground mb-4">Create Announcement</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Content</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  required
                  rows={4}
                  className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Target Audience</label>
                <select
                  value={formData.target}
                  onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                  className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                >
                  <option value="all">All Users</option>
                  <option value="photographers">Creators Only</option>
                  <option value="attendees">Attendees Only</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Country</label>
                <select
                  value={formData.country_code}
                  onChange={(e) => setFormData({ ...formData, country_code: e.target.value })}
                  className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                >
                  <option value="">All Countries</option>
                  {regions.map((region) => (
                    <option key={region.region_code} value={region.region_code}>
                      {region.region_name} ({region.region_code}){region.is_active ? '' : ' - Inactive'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.send_push}
                    onChange={(e) => setFormData({ ...formData, send_push: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-foreground">Push Notification</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.send_email}
                    onChange={(e) => setFormData({ ...formData, send_email: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-foreground">Email</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.send_sms}
                    onChange={(e) => setFormData({ ...formData, send_sms: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-foreground">SMS</span>
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending === 'create'}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {sending === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Announcements List */}
      {announcements.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No announcements yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-foreground">{announcement.title}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColors[announcement.status]}`}>
                      {announcement.status}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-2">{announcement.content}</p>
                  <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                    <span>Target: {announcement.target}</span>
                    <span>
                      Country: {announcement.country_code ? announcement.country_code : 'All'}
                    </span>
                    <span>
                      Channels:{' '}
                      {[
                        announcement.send_push && 'Push',
                        announcement.send_email && 'Email',
                        announcement.send_sms && 'SMS',
                      ]
                        .filter(Boolean)
                        .join(', ') || 'None'}
                    </span>
                    <span>Created: {formatDateTime(announcement.created_at)}</span>
                    <span>Queued: {announcement.queued_count ?? 0}</span>
                    <span>Delivered: {announcement.delivered_count ?? announcement.sent_count ?? 0}</span>
                    <span>Failed: {announcement.failed_count ?? 0}</span>
                    {announcement.delivery_synced_at && (
                      <span>Last Sync: {formatDateTime(announcement.delivery_synced_at)}</span>
                    )}
                    {announcement.sent_at && (
                      <span>Completed: {formatDateTime(announcement.sent_at)}</span>
                    )}
                  </div>
                </div>
                {announcement.status === 'draft' && (
                  <button
                    onClick={() => handleSend(announcement.id)}
                    disabled={sending === announcement.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 text-white font-medium hover:bg-green-400 disabled:opacity-50"
                  >
                    {sending === announcement.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send Now
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

