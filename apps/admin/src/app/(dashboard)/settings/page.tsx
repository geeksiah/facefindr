import { supabaseAdmin } from '@/lib/supabase';

import { SettingsForm } from './settings-form';

async function getSettings() {
  let { data } = await supabaseAdmin
    .from('platform_settings')
    .select('*')
    .order('category', { ascending: true });

  const hasBaseCurrency = (data || []).some(
    (setting) => setting.setting_key === 'platform_base_currency'
  );

  if (!hasBaseCurrency) {
    const { data: firstCurrency } = await supabaseAdmin
      .from('supported_currencies')
      .select('code')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .limit(1)
      .maybeSingle();

    const baseCurrency = firstCurrency?.code || 'USD';
    const { data: inserted } = await supabaseAdmin
      .from('platform_settings')
      .upsert(
        {
          setting_key: 'platform_base_currency',
          value: baseCurrency,
          description: 'Fallback platform currency used when no user/region currency is resolved',
          category: 'general',
        },
        { onConflict: 'setting_key' }
      )
      .select('*')
      .single();

    if (inserted) {
      data = [...(data || []), inserted];
    }
  }

  // Group by category
  const grouped: Record<string, Array<{ key: string; value: any; description: string | null }>> = {};
  
  data?.forEach((setting) => {
    if (!grouped[setting.category]) {
      grouped[setting.category] = [];
    }
    grouped[setting.category].push({
      key: setting.setting_key,
      value: setting.value,
      description: setting.description,
    });
  });

  return grouped;
}

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure global platform defaults, limits, and system-wide settings. These serve as fallback values that can be overridden by region-specific settings.
        </p>
        <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <strong>Note:</strong> Platform Settings are global defaults. For region-specific overrides (fees, providers, verification), use{' '}
            <a href="/regions" className="underline font-medium">Regions & Providers</a>.
          </p>
        </div>
      </div>

      <SettingsForm settings={settings} />
    </div>
  );
}
