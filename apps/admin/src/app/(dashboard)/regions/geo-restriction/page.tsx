'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Loader2,
  Globe,
  Check,
  Plus,
  X,
  Shield,
  Users,
  MapPin,
} from 'lucide-react';

interface GeoRestriction {
  id: string;
  restriction_mode: 'allowlist' | 'blocklist';
  allowed_countries: string[];
  blocked_countries: string[];
  web_enabled: boolean;
  mobile_enabled: boolean;
  allow_vpn: boolean;
  strict_mode: boolean;
  restriction_message: string;
  waitlist_enabled: boolean;
}

interface WaitlistStats {
  total: number;
  byCountry: Array<{ country_code: string; count: number }>;
}

const ALL_COUNTRIES = [
  { code: 'GH', name: 'Ghana' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KE', name: 'Kenya' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'UG', name: 'Uganda' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AE', name: 'UAE' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'IN', name: 'India' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'CO', name: 'Colombia' },
  { code: 'AR', name: 'Argentina' },
];

export default function GeoRestrictionPage() {
  const router = useRouter();
  const [config, setConfig] = useState<GeoRestriction | null>(null);
  const [waitlistStats, setWaitlistStats] = useState<WaitlistStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newCountry, setNewCountry] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const [configRes, waitlistRes] = await Promise.all([
        fetch('/api/admin/regions/geo-restriction'),
        fetch('/api/admin/regions/waitlist-stats'),
      ]);

      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data.config);
      }

      if (waitlistRes.ok) {
        const data = await waitlistRes.json();
        setWaitlistStats(data.stats);
      }

      setIsLoading(false);
    };

    fetchData();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);

    try {
      const response = await fetch('/api/admin/regions/geo-restriction', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const addCountry = () => {
    if (!newCountry || !config) return;
    
    const countryList = config.restriction_mode === 'allowlist' 
      ? 'allowed_countries' 
      : 'blocked_countries';
    
    if (!config[countryList].includes(newCountry)) {
      setConfig({
        ...config,
        [countryList]: [...config[countryList], newCountry],
      });
    }
    setNewCountry('');
  };

  const removeCountry = (country: string) => {
    if (!config) return;
    
    const countryList = config.restriction_mode === 'allowlist' 
      ? 'allowed_countries' 
      : 'blocked_countries';
    
    setConfig({
      ...config,
      [countryList]: config[countryList].filter(c => c !== country),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return <div className="text-center py-12 text-muted-foreground">Failed to load configuration</div>;
  }

  const countries = config.restriction_mode === 'allowlist' 
    ? config.allowed_countries 
    : config.blocked_countries;

  const availableCountries = ALL_COUNTRIES.filter(c => !countries.includes(c.code));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/regions" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Geo-Restriction Settings</h1>
            <p className="text-muted-foreground">Control where FaceFindr is available</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-green-500 text-sm flex items-center gap-1">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Waitlist Stats */}
      {waitlistStats && waitlistStats.total > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="font-medium text-foreground">{waitlistStats.total} users on waitlist</p>
              <p className="text-sm text-muted-foreground">
                From {waitlistStats.byCountry.length} restricted countries
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Restriction Mode */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5" /> Restriction Mode
        </h2>

        <div className="flex gap-4">
          <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
            config.restriction_mode === 'allowlist' 
              ? 'border-green-500 bg-green-500/5' 
              : 'border-border hover:border-muted-foreground'
          }`}>
            <input
              type="radio"
              name="mode"
              value="allowlist"
              checked={config.restriction_mode === 'allowlist'}
              onChange={() => setConfig({ ...config, restriction_mode: 'allowlist' })}
              className="sr-only"
            />
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                config.restriction_mode === 'allowlist' ? 'border-green-500' : 'border-muted-foreground'
              }`}>
                {config.restriction_mode === 'allowlist' && (
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                )}
              </div>
              <div>
                <p className="font-medium text-foreground">Allowlist Mode</p>
                <p className="text-sm text-muted-foreground">Only specified countries can access</p>
              </div>
            </div>
          </label>

          <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
            config.restriction_mode === 'blocklist' 
              ? 'border-red-500 bg-red-500/5' 
              : 'border-border hover:border-muted-foreground'
          }`}>
            <input
              type="radio"
              name="mode"
              value="blocklist"
              checked={config.restriction_mode === 'blocklist'}
              onChange={() => setConfig({ ...config, restriction_mode: 'blocklist' })}
              className="sr-only"
            />
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                config.restriction_mode === 'blocklist' ? 'border-red-500' : 'border-muted-foreground'
              }`}>
                {config.restriction_mode === 'blocklist' && (
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                )}
              </div>
              <div>
                <p className="font-medium text-foreground">Blocklist Mode</p>
                <p className="text-sm text-muted-foreground">All countries except specified can access</p>
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Country List */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          {config.restriction_mode === 'allowlist' ? 'Allowed Countries' : 'Blocked Countries'}
        </h2>

        {/* Add Country */}
        <div className="flex gap-3 mb-4">
          <select
            value={newCountry}
            onChange={(e) => setNewCountry(e.target.value)}
            className="flex-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
          >
            <option value="">Select a country to add</option>
            {availableCountries.map(country => (
              <option key={country.code} value={country.code}>
                {country.name} ({country.code})
              </option>
            ))}
          </select>
          <button
            onClick={addCountry}
            disabled={!newCountry}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Country Chips */}
        <div className="flex flex-wrap gap-2">
          {countries.map(code => {
            const country = ALL_COUNTRIES.find(c => c.code === code);
            return (
              <span
                key={code}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                  config.restriction_mode === 'allowlist'
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-red-500/10 text-red-500'
                }`}
              >
                {country?.name || code} ({code})
                <button
                  onClick={() => removeCountry(code)}
                  className="p-0.5 rounded-full hover:bg-white/20 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          {countries.length === 0 && (
            <p className="text-muted-foreground text-sm">No countries configured</p>
          )}
        </div>
      </div>

      {/* Platform Settings */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Platform Settings</h2>

        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Web App</p>
              <p className="text-sm text-muted-foreground">Apply geo-restriction to web app</p>
            </div>
            <input
              type="checkbox"
              checked={config.web_enabled}
              onChange={(e) => setConfig({ ...config, web_enabled: e.target.checked })}
              className="rounded"
            />
          </label>

          <label className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Mobile App</p>
              <p className="text-sm text-muted-foreground">Apply geo-restriction to mobile app</p>
            </div>
            <input
              type="checkbox"
              checked={config.mobile_enabled}
              onChange={(e) => setConfig({ ...config, mobile_enabled: e.target.checked })}
              className="rounded"
            />
          </label>

          <label className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Strict Mode</p>
              <p className="text-sm text-muted-foreground">Require exact country match (no VPN bypass)</p>
            </div>
            <input
              type="checkbox"
              checked={config.strict_mode}
              onChange={(e) => setConfig({ ...config, strict_mode: e.target.checked })}
              className="rounded"
            />
          </label>

          <label className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Waitlist</p>
              <p className="text-sm text-muted-foreground">Allow users from restricted regions to join waitlist</p>
            </div>
            <input
              type="checkbox"
              checked={config.waitlist_enabled}
              onChange={(e) => setConfig({ ...config, waitlist_enabled: e.target.checked })}
              className="rounded"
            />
          </label>
        </div>
      </div>

      {/* Restriction Message */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Restriction Message</h2>
        <textarea
          value={config.restriction_message}
          onChange={(e) => setConfig({ ...config, restriction_message: e.target.value })}
          rows={3}
          className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground resize-none"
          placeholder="Message shown to users in restricted regions..."
        />
      </div>
    </div>
  );
}
