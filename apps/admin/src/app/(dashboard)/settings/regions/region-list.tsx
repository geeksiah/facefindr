'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Globe,
  MessageSquare,
  Mail,
  CreditCard,
  CheckCircle,
  XCircle,
  Edit,
  ToggleLeft,
  ToggleRight,
  Loader2,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Region {
  id: string;
  region_code: string;
  region_name: string;
  is_active: boolean;
  default_currency: string;
  sms_provider: string | null;
  sms_enabled: boolean;
  email_provider: string;
  email_enabled: boolean;
  phone_verification_enabled: boolean;
  email_verification_enabled: boolean;
  payment_providers: string[];
  launch_date: string | null;
  created_at: string;
}

interface SmsPreset {
  provider: string;
  display_name: string;
  supported_regions: string[];
}

export function RegionList({ regions, smsPresets }: { regions: Region[]; smsPresets: SmsPreset[] }) {
  const router = useRouter();
  const [toggling, setToggling] = useState<string | null>(null);

  const handleToggleActive = async (regionCode: string, currentState: boolean) => {
    setToggling(regionCode);
    try {
      const response = await fetch('/api/admin/regions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region_code: regionCode, is_active: !currentState }),
      });
      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error('Toggle failed:', error);
    } finally {
      setToggling(null);
    }
  };

  const getSmsProviderName = (provider: string | null) => {
    if (!provider) return 'Not configured';
    const preset = smsPresets.find(p => p.provider === provider);
    return preset?.display_name || provider;
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Region</th>
            <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Currency</th>
            <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">SMS</th>
            <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Payments</th>
            <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Verification</th>
            <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Status</th>
            <th className="text-right px-6 py-3 text-sm font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {regions.map((region) => (
            <tr key={region.id} className="hover:bg-muted/30">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg font-bold">
                    {region.region_code}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{region.region_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {region.launch_date ? `Launched ${formatDate(region.launch_date)}` : 'Not launched'}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className="font-mono text-foreground">{region.default_currency}</span>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  {region.sms_enabled ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm text-foreground">
                    {getSmsProviderName(region.sms_provider)}
                  </span>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-wrap gap-1">
                  {region.payment_providers?.slice(0, 2).map((provider) => (
                    <span
                      key={provider}
                      className="px-2 py-0.5 rounded text-xs bg-muted text-foreground capitalize"
                    >
                      {provider.replace('_', ' ')}
                    </span>
                  ))}
                  {region.payment_providers?.length > 2 && (
                    <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                      +{region.payment_providers.length - 2}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    {region.email_verification_enabled ? (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3 text-muted-foreground" />
                    {region.phone_verification_enabled ? (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <button
                  onClick={() => handleToggleActive(region.region_code, region.is_active)}
                  disabled={toggling === region.region_code}
                  className="flex items-center gap-2"
                >
                  {toggling === region.region_code ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : region.is_active ? (
                    <ToggleRight className="h-6 w-6 text-green-500" />
                  ) : (
                    <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                  )}
                  <span className={`text-sm font-medium ${region.is_active ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {region.is_active ? 'Active' : 'Inactive'}
                  </span>
                </button>
              </td>
              <td className="px-6 py-4 text-right">
                <Link
                  href={`/settings/regions/${region.region_code}`}
                  className="p-2 rounded-lg hover:bg-muted inline-flex transition-colors"
                >
                  <Edit className="h-4 w-4 text-muted-foreground" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
