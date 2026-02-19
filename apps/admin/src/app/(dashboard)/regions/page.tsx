import { 
  Globe, 
  Plus, 
  Check, 
  X, 
  Settings, 
  CreditCard, 
  MessageSquare,
  Mail,
  Phone,
} from 'lucide-react';
import Link from 'next/link';

import { supabaseAdmin } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';

async function getRegions() {
  const { data } = await supabaseAdmin
    .from('region_config')
    .select('*')
    .order('is_active', { ascending: false })
    .order('region_name', { ascending: true });

  return data || [];
}

async function getGeoRestriction() {
  const { data } = await supabaseAdmin
    .from('geo_restriction')
    .select('*')
    .limit(1)
    .single();

  return data;
}

export default async function RegionsPage() {
  const [regions, geoRestriction] = await Promise.all([
    getRegions(),
    getGeoRestriction(),
  ]);

  const activeRegions = regions.filter(r => r.is_active);
  const inactiveRegions = regions.filter(r => !r.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Regions & Providers</h1>
          <p className="text-muted-foreground mt-1">
            Configure SMS, Email, and Payment providers per region
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/regions/geo-restriction"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <Globe className="h-4 w-4" />
            Geo Settings
          </Link>
          <Link
            href="/regions/verification"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <Phone className="h-4 w-4" />
            Verification
          </Link>
          <Link
            href="/regions/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Region
          </Link>
        </div>
      </div>

      {/* Geo Restriction Status */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${geoRestriction?.restriction_mode === 'allowlist' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              <Globe className={`h-5 w-5 ${geoRestriction?.restriction_mode === 'allowlist' ? 'text-green-500' : 'text-red-500'}`} />
            </div>
            <div>
              <p className="font-medium text-foreground">
                Geo-Restriction: {geoRestriction?.restriction_mode === 'allowlist' ? 'Allowlist Mode' : 'Blocklist Mode'}
              </p>
              <p className="text-sm text-muted-foreground">
                {geoRestriction?.restriction_mode === 'allowlist' 
                  ? `Only ${geoRestriction?.allowed_countries?.length || 0} countries allowed`
                  : `${geoRestriction?.blocked_countries?.length || 0} countries blocked`}
              </p>
            </div>
          </div>
          <Link
            href="/regions/geo-restriction"
            className="text-sm text-primary hover:underline"
          >
            Configure
          </Link>
        </div>
      </div>

      {/* Active Regions */}
      <div>
        <h2 className="font-semibold text-foreground mb-4">Active Regions ({activeRegions.length})</h2>
        {activeRegions.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">No active regions</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeRegions.map((region) => (
              <RegionCard key={region.id} region={region} />
            ))}
          </div>
        )}
      </div>

      {/* Inactive Regions */}
      {inactiveRegions.length > 0 && (
        <div>
          <h2 className="font-semibold text-foreground mb-4">Inactive Regions ({inactiveRegions.length})</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {inactiveRegions.map((region) => (
              <RegionCard key={region.id} region={region} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RegionCard({ region }: { region: any }) {
  return (
    <Link
      href={`/regions/${region.region_code}`}
      className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-colors"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getCountryFlag(region.region_code)}</span>
            <h3 className="font-semibold text-foreground">{region.region_name}</h3>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{region.region_code}</p>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          region.is_active 
            ? 'bg-green-500/10 text-green-500' 
            : 'bg-gray-500/10 text-gray-500'
        }`}>
          {region.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Currency</span>
          <span className="text-foreground font-medium">{region.default_currency}</span>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> SMS
          </span>
          {region.sms_enabled ? (
            <span className="text-green-500 capitalize">{region.sms_provider}</span>
          ) : (
            <span className="text-gray-500">Disabled</span>
          )}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1">
            <Mail className="h-3 w-3" /> Email
          </span>
          {region.email_enabled ? (
            <span className="text-green-500 capitalize">{region.email_provider}</span>
          ) : (
            <span className="text-gray-500">Disabled</span>
          )}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1">
            <CreditCard className="h-3 w-3" /> Payments
          </span>
          <span className="text-foreground">
            {region.payment_providers?.length || 0} providers
          </span>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <FeatureBadge enabled={region.phone_verification_enabled} label="Phone" />
          <FeatureBadge enabled={region.email_verification_enabled} label="Email" />
        </div>
      </div>
    </Link>
  );
}

function FeatureBadge({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1 text-xs ${enabled ? 'text-green-500' : 'text-gray-500'}`}>
      {enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {label}
    </span>
  );
}

function getCountryFlag(code: string): string {
  const flags: Record<string, string> = {
    GH: '\uD83C\uDDEC\uD83C\uDDED',
    NG: '\uD83C\uDDF3\uD83C\uDDEC',
    KE: '\uD83C\uDDF0\uD83C\uDDEA',
    ZA: '\uD83C\uDDFF\uD83C\uDDE6',
    UG: '\uD83C\uDDFA\uD83C\uDDEC',
    TZ: '\uD83C\uDDF9\uD83C\uDDFF',
    RW: '\uD83C\uDDF7\uD83C\uDDFC',
    US: '\uD83C\uDDFA\uD83C\uDDF8',
    GB: '\uD83C\uDDEC\uD83C\uDDE7',
    CA: '\uD83C\uDDE8\uD83C\uDDE6',
    AU: '\uD83C\uDDE6\uD83C\uDDFA',
  };
  return flags[code] || '\uD83C\uDF0D';
}

