import { Globe, Plus } from 'lucide-react';
import Link from 'next/link';

import { supabaseAdmin } from '@/lib/supabase';

import { RegionList } from './region-list';

async function getRegions() {
  const { data: regions } = await supabaseAdmin
    .from('region_config')
    .select('*')
    .order('is_active', { ascending: false })
    .order('region_name', { ascending: true });

  return regions || [];
}

async function getSmsPresets() {
  const { data } = await supabaseAdmin
    .from('sms_provider_presets')
    .select('*')
    .eq('is_active', true);
  return data || [];
}

export default async function RegionsPage() {
  const [regions, smsPresets] = await Promise.all([
    getRegions(),
    getSmsPresets(),
  ]);

  const activeCount = regions.filter(r => r.is_active).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Region Configuration</h1>
          <p className="text-muted-foreground mt-1">
            Configure SMS, email, and payment providers per region
          </p>
        </div>
        <Link
          href="/settings/regions/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Region
        </Link>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2.5">
              <Globe className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Regions</p>
              <p className="text-2xl font-bold text-foreground">{activeCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2.5">
              <Globe className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Regions</p>
              <p className="text-2xl font-bold text-foreground">{regions.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2.5">
              <Globe className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">SMS Providers</p>
              <p className="text-2xl font-bold text-foreground">{smsPresets.length}</p>
            </div>
          </div>
        </div>
      </div>

      <RegionList regions={regions} smsPresets={smsPresets} />
    </div>
  );
}
