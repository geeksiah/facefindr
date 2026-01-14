'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  Share2,
  Link2,
  QrCode,
  Code,
  Copy,
  Check,
  Download,
  Lock,
  Unlock,
  Globe,
  Twitter,
  Facebook,
  MessageCircle,
  Mail,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  Scan,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface ShareInfo {
  event: {
    id: string;
    name: string;
    publicSlug: string;
    shortLink: string;
    isPubliclyListed: boolean;
    allowAnonymousScan: boolean;
    requireAccessCode: boolean;
    accessCode: string;
    status: string;
  };
  urls: {
    directUrl: string;
    shortUrl: string;
    embedUrl: string;
    scanUrl: string;
  };
  qrCode: string;
  embedCode: string;
  shareLinks: any[];
}

interface EventSharePanelProps {
  eventId: string;
  onClose?: () => void;
}

export function EventSharePanel({ eventId, onClose }: EventSharePanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'link' | 'qr' | 'embed' | 'advanced'>('link');
  const [copied, setCopied] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    loadShareInfo();
  }, [eventId]);

  async function loadShareInfo() {
    try {
      const res = await fetch(`/api/events/${eventId}/share`);
      const data = await res.json();
      if (res.ok) {
        setShareInfo(data);
      }
    } catch (err) {
      console.error('Failed to load share info:', err);
    } finally {
      setLoading(false);
    }
  }

  async function updateSettings(updates: Record<string, any>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/share`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await loadShareInfo();
      }
    } catch (err) {
      console.error('Failed to update settings:', err);
    } finally {
      setSaving(false);
    }
  }

  async function copyToClipboard(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  async function downloadQR() {
    if (!shareInfo?.qrCode) return;
    
    const link = document.createElement('a');
    link.href = shareInfo.qrCode;
    link.download = `${shareInfo.event.name.replace(/\s+/g, '-')}-qr-code.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function shareToSocial(platform: string) {
    if (!shareInfo) return;
    
    const url = shareInfo.urls.directUrl;
    const text = `Find your photos from "${shareInfo.event.name}" on FaceFindr`;
    
    const urls: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`,
      email: `mailto:?subject=${encodeURIComponent(`Photos from ${shareInfo.event.name}`)}&body=${encodeURIComponent(text + '\n\n' + url)}`,
    };
    
    if (urls[platform]) {
      window.open(urls[platform], '_blank');
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (!shareInfo) {
    return (
      <div className="p-8 text-center text-secondary">
        Failed to load sharing options
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Share Event</h2>
          <p className="text-sm text-secondary">{shareInfo.event.name}</p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <span className="sr-only">Close</span>
            &times;
          </Button>
        )}
      </div>

      {/* Quick share buttons */}
      <div className="flex items-center gap-2 mb-6 pb-6 border-b border-border">
        <Button
          variant="outline"
          size="sm"
          onClick={() => shareToSocial('twitter')}
          className="flex-1"
        >
          <Twitter className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => shareToSocial('facebook')}
          className="flex-1"
        >
          <Facebook className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => shareToSocial('whatsapp')}
          className="flex-1"
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => shareToSocial('email')}
          className="flex-1"
        >
          <Mail className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl mb-6">
        {[
          { id: 'link', label: 'Link', icon: Link2 },
          { id: 'qr', label: 'QR Code', icon: QrCode },
          { id: 'embed', label: 'Embed', icon: Code },
          { id: 'advanced', label: 'Settings', icon: Lock },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-secondary hover:text-foreground'
            )}
          >
            <tab.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-6">
        {/* Link Tab */}
        {activeTab === 'link' && (
          <>
            {/* Event URL */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Event Link
              </label>
              <div className="flex gap-2">
                <Input
                  value={shareInfo.urls.directUrl}
                  readOnly
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(shareInfo.urls.directUrl, 'direct')}
                >
                  {copied === 'direct' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open(shareInfo.urls.directUrl, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Short URL */}
            {shareInfo.urls.shortUrl && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Short Link
                </label>
                <div className="flex gap-2">
                  <Input
                    value={shareInfo.urls.shortUrl}
                    readOnly
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(shareInfo.urls.shortUrl, 'short')}
                  >
                    {copied === 'short' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            {/* Scan URL */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Direct to Scanner
              </label>
              <div className="flex gap-2">
                <Input
                  value={shareInfo.urls.scanUrl}
                  readOnly
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(shareInfo.urls.scanUrl, 'scan')}
                >
                  {copied === 'scan' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-secondary mt-1">
                Takes visitors directly to the face scanner
              </p>
            </div>
          </>
        )}

        {/* QR Code Tab */}
        {activeTab === 'qr' && (
          <div className="text-center">
            <div className="inline-block p-6 bg-white rounded-2xl shadow-lg mb-6">
              <img
                src={shareInfo.qrCode}
                alt="Event QR Code"
                className="w-64 h-64"
              />
            </div>
            
            <p className="text-sm text-secondary mb-6">
              Scan to view photos from {shareInfo.event.name}
            </p>

            <div className="flex justify-center gap-4">
              <Button onClick={downloadQR}>
                <Download className="h-4 w-4 mr-2" />
                Download PNG
              </Button>
              <Button
                variant="outline"
                onClick={() => copyToClipboard(shareInfo.urls.directUrl, 'qr-link')}
              >
                {copied === 'qr-link' ? <Check className="h-4 w-4 mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
                Copy Link
              </Button>
            </div>

            <div className="mt-8 p-4 bg-muted rounded-xl text-left">
              <h3 className="font-medium text-foreground mb-2">Tips for using QR codes</h3>
              <ul className="text-sm text-secondary space-y-1">
                <li>Print at least 2x2 inches for reliable scanning</li>
                <li>Display at event entrance or on photo booth</li>
                <li>Add to event programs or table cards</li>
                <li>Test scan before printing</li>
              </ul>
            </div>
          </div>
        )}

        {/* Embed Tab */}
        {activeTab === 'embed' && (
          <>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Embed Code
              </label>
              <div className="relative">
                <textarea
                  value={shareInfo.embedCode}
                  readOnly
                  rows={4}
                  className="w-full rounded-xl border border-border bg-muted p-4 font-mono text-xs text-foreground resize-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(shareInfo.embedCode, 'embed')}
                >
                  {copied === 'embed' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-secondary mt-2">
                Paste this code into your website to embed a gallery widget
              </p>
            </div>

            <div className="p-4 bg-muted rounded-xl">
              <h3 className="font-medium text-foreground mb-2">Preview</h3>
              <div className="bg-card rounded-lg border border-border p-4 min-h-[200px] flex items-center justify-center">
                <div className="text-center text-secondary">
                  <Scan className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Gallery embed preview</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Advanced Settings Tab */}
        {activeTab === 'advanced' && (
          <>
            {/* Access Code */}
            <div className="flex items-center justify-between py-4 border-b border-border">
              <div className="flex-1 mr-4">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-secondary" />
                  <span className="font-medium text-foreground">Require Access Code</span>
                </div>
                <p className="text-sm text-secondary mt-1">
                  Visitors must enter a code to view photos
                </p>
              </div>
              <Switch
                checked={shareInfo.event.requireAccessCode}
                onCheckedChange={(checked) => updateSettings({ requireAccessCode: checked })}
                disabled={saving}
              />
            </div>

            {shareInfo.event.requireAccessCode && (
              <div className="pl-6 pb-4 border-b border-border">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Access Code
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showCode ? 'text' : 'password'}
                      value={shareInfo.event.accessCode}
                      readOnly
                      className="font-mono uppercase tracking-widest pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCode(!showCode)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-foreground"
                    >
                      {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(shareInfo.event.accessCode, 'code')}
                  >
                    {copied === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => updateSettings({ accessCode: '' })}
                    disabled={saving}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Anonymous Scanning */}
            <div className="flex items-center justify-between py-4 border-b border-border">
              <div className="flex-1 mr-4">
                <div className="flex items-center gap-2">
                  <Scan className="h-4 w-4 text-secondary" />
                  <span className="font-medium text-foreground">Allow Anonymous Scanning</span>
                </div>
                <p className="text-sm text-secondary mt-1">
                  Visitors can scan faces without creating an account
                </p>
              </div>
              <Switch
                checked={shareInfo.event.allowAnonymousScan}
                onCheckedChange={(checked) => updateSettings({ allowAnonymousScan: checked })}
                disabled={saving}
              />
            </div>

            {/* Public Listing */}
            <div className="flex items-center justify-between py-4 border-b border-border">
              <div className="flex-1 mr-4">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-secondary" />
                  <span className="font-medium text-foreground">List Publicly</span>
                </div>
                <p className="text-sm text-secondary mt-1">
                  Show in public event directory (coming soon)
                </p>
              </div>
              <Switch
                checked={shareInfo.event.isPubliclyListed}
                onCheckedChange={(checked) => updateSettings({ isPubliclyListed: checked })}
                disabled={saving}
              />
            </div>

            {/* Custom Slug */}
            <div className="py-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                Custom URL Slug
              </label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-0 rounded-xl border border-border overflow-hidden bg-muted">
                  <span className="px-3 text-sm text-secondary whitespace-nowrap">
                    facefindr.com/e/
                  </span>
                  <input
                    type="text"
                    defaultValue={shareInfo.event.publicSlug}
                    placeholder="my-event"
                    className="flex-1 bg-card px-3 py-3 text-sm text-foreground border-none focus:outline-none"
                    onBlur={(e) => {
                      if (e.target.value !== shareInfo.event.publicSlug) {
                        updateSettings({ customSlug: e.target.value });
                      }
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-secondary mt-2">
                Create a memorable URL for your event
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
