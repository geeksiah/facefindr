'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Plus, Send, Loader2, Trash2 } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface Announcement {
  id: string;
  title: string;
  content: string;
  target: string;
  status: string;
  send_email: boolean;
  send_push: boolean;
  sent_count: number;
  created_at: string;
  sent_at: string | null;
}

export default function AnnouncementsPage() {
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    target: 'all',
    send_email: false,
    send_push: true,
  });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    const response = await fetch('/api/admin/announcements');
    if (response.ok) {
      const data = await response.json();
      setAnnouncements(data.announcements || []);
    }
    setIsLoading(false);
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
        setFormData({ title: '', content: '', target: 'all', send_email: false, send_push: true });
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
    sent: 'bg-green-500/10 text-green-500',
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

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg">
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
                  <option value="photographers">Photographers Only</option>
                  <option value="attendees">Attendees Only</option>
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
                    <span>Created: {formatDateTime(announcement.created_at)}</span>
                    {announcement.sent_at && (
                      <span>Sent: {formatDateTime(announcement.sent_at)} ({announcement.sent_count} users)</span>
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
