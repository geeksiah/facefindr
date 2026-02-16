'use client';

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
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';


import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QRCodeWithLogo, downloadQRCodeWithLogo } from '@/components/ui/qr-code-with-logo';
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
  qrCodeTransparent?: string;
  embedCode: string;
  shareLinks: any[];
}

// Monochrome social icons as inline SVGs
const XIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const EmailIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
);

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
  const qrCodeRef = useRef<HTMLDivElement>(null);

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
    
    try {
      // Use the transparent QR code if available, otherwise use the regular one
      const qrUrl = shareInfo.qrCodeTransparent || shareInfo.qrCode;
      
      // Fetch the image and convert to blob for download
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Determine file extension based on content type
      const issvg = blob.type.includes('svg') || qrUrl.includes('format=svg');
      const extension = issvg ? 'svg' : 'png';
      link.download = `${shareInfo.event.name.replace(/\s+/g, '-')}-qr-code.${extension}`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the URL object
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download QR code:', error);
      // Fallback to opening in new tab if download fails
      window.open(shareInfo.qrCode, '_blank');
    }
  }

  function shareToSocial(platform: string) {
    if (!shareInfo) return;
    
    const url = shareInfo.urls.directUrl;
    const text = `Find your photos from "${shareInfo.event.name}" on Ferchr`;
    
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
          title="Share on X (Twitter)"
        >
          <XIcon />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => shareToSocial('facebook')}
          className="flex-1"
          title="Share on Facebook"
        >
          <FacebookIcon />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => shareToSocial('whatsapp')}
          className="flex-1"
          title="Share on WhatsApp"
        >
          <WhatsAppIcon />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => shareToSocial('email')}
          className="flex-1"
          title="Share via Email"
        >
          <EmailIcon />
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
            {/* Original Event URL */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Original Link
                <span className="ml-2 text-xs text-secondary font-normal">
                  (Used in QR code)
                </span>
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
              <p className="text-xs text-secondary mt-1">
                This is the original event link. It's automatically generated when you create an event.
              </p>
            </div>

            {/* Short URL */}
            {shareInfo.urls.shortUrl && shareInfo.urls.shortUrl !== shareInfo.urls.directUrl && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Shortened Link
                  <span className="ml-2 text-xs text-secondary font-normal">
                    (via TinyURL)
                  </span>
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
                <p className="text-xs text-secondary mt-1">
                  A shortened version for easier sharing. Alternative to the original link.
                </p>
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
            <div 
              ref={qrCodeRef}
              className="inline-block p-6 bg-white rounded-2xl shadow-lg mb-6"
              data-qr-container
            >
              {/* Client-side QR code with logo matching mobile app style */}
              <QRCodeWithLogo
                value={shareInfo.urls.directUrl}
                size={256}
                className="mx-auto"
              />
            </div>
            
            <p className="text-sm text-secondary mb-6">
              Scan to view photos from {shareInfo.event.name}
            </p>

            <div className="flex justify-center gap-4">
              <Button 
                onClick={async () => {
                  // Download QR code with logo using html2canvas
                  try {
                    if (!qrCodeRef.current) {
                      // Fallback to API-generated QR if component not found
                      downloadQR();
                      return;
                    }
                    
                    await downloadQRCodeWithLogo(
                      qrCodeRef.current,
                      `${shareInfo.event.name.replace(/\s+/g, '-')}-qr-code`,
                      'png'
                    );
                  } catch (error) {
                    console.error('Download error:', error);
                    // Fallback to API-generated QR
                    downloadQR();
                  }
                }}
              >
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
                    {typeof window !== 'undefined' ? window.location.hostname : ''}/e/
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
