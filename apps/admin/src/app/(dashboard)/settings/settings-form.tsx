'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Loader2 } from 'lucide-react';

interface Setting {
  key: string;
  value: any;
  description: string | null;
}

interface SettingsFormProps {
  settings: Record<string, Setting[]>;
}

const categoryLabels: Record<string, string> = {
  payouts: 'Payout Settings',
  fees: 'Platform Fees',
  prints: 'Print Commissions',
  general: 'General Settings',
};

export function SettingsForm({ settings }: SettingsFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    Object.values(settings).flat().forEach((s) => {
      initial[s.key] = String(s.value).replace(/"/g, '');
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: values }),
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        router.refresh();
      }
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setSaving(false);
    }
  };

  const formatLabel = (key: string) => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const formatValue = (key: string, value: string) => {
    if (key.includes('fee') || key.includes('commission')) {
      return `${(parseInt(value) / 100).toFixed(2)}%`;
    }
    if (key.includes('minimum')) {
      const currency = key.split('_').pop()?.toUpperCase() || 'USD';
      return `${(parseInt(value) / 100).toFixed(2)} ${currency}`;
    }
    return value;
  };

  return (
    <div className="space-y-6">
      {Object.entries(settings).map(([category, items]) => (
        <div key={category} className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground mb-4">
            {categoryLabels[category] || category}
          </h2>
          
          <div className="space-y-4">
            {items.map((setting) => (
              <div key={setting.key} className="grid gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">
                    {formatLabel(setting.key)}
                  </label>
                  {setting.key.includes('enabled') || setting.key.includes('mode') ? null : (
                    <span className="text-xs text-muted-foreground">
                      Display: {formatValue(setting.key, values[setting.key])}
                    </span>
                  )}
                </div>
                
                {setting.key.includes('enabled') || setting.key.includes('mode') ? (
                  <select
                    value={values[setting.key]}
                    onChange={(e) => setValues({ ...values, [setting.key]: e.target.value })}
                    className="px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                ) : (
                  <input
                    type="number"
                    value={values[setting.key]}
                    onChange={(e) => setValues({ ...values, [setting.key]: e.target.value })}
                    className="px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  />
                )}
                
                {setting.description && (
                  <p className="text-xs text-muted-foreground">{setting.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Changes
        </button>
        
        {saved && (
          <span className="text-green-500 text-sm">Settings saved successfully!</span>
        )}
      </div>
    </div>
  );
}
