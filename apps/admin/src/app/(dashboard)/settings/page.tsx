import { supabaseAdmin } from '@/lib/supabase';
import { SettingsForm } from './settings-form';

async function getSettings() {
  const { data } = await supabaseAdmin
    .from('platform_settings')
    .select('*')
    .order('category', { ascending: true });

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
          Configure platform-wide settings, fees, and limits
        </p>
      </div>

      <SettingsForm settings={settings} />
    </div>
  );
}
