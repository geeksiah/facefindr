'use client';

import { Save, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
  general: 'General Settings',
};

export function SettingsForm({ settings }: SettingsFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    Object.values(settings).flat().forEach((s) => {
      let displayValue = String(s.value).replace(/"/g, '');
      const numValue = parseFloat(displayValue);
      
      // Convert from cents to decimals for display (amounts)
      if (s.key.includes('minimum') || s.key.includes('amount') || (s.key.includes('price') && !s.key.includes('percent')) || (s.key.includes('fee') && !s.key.includes('percent') && !s.key.includes('commission')) || (s.key.includes('commission') && !s.key.includes('percent'))) {
        if (!isNaN(numValue) && numValue > 1000) {
          displayValue = (numValue / 100).toFixed(2);
        } else if (!isNaN(numValue)) {
          displayValue = numValue.toFixed(2);
        }
      }
      // Convert percentages: if stored as cents (2000 = 20%), show as 20
      else if (s.key.includes('percent') || (s.key.includes('fee') && s.key.includes('percent')) || (s.key.includes('commission') && s.key.includes('percent'))) {
        if (!isNaN(numValue) && numValue > 100) {
          displayValue = (numValue / 100).toFixed(0);
        } else if (!isNaN(numValue) && numValue < 1) {
          displayValue = (numValue * 100).toFixed(0);
        } else if (!isNaN(numValue)) {
          displayValue = numValue.toFixed(0);
        }
      }
      
      initial[s.key] = displayValue;
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

  const isToggleSetting = (key: string) =>
    key.includes('enabled') || key.includes('mode');

  const isTextSetting = (key: string, value: string) => {
    if (key === 'platform_base_currency') return true;
    if (key.includes('supported_currencies')) return true;
    return value.trim() !== '' && Number.isNaN(Number(value));
  };

  const formatValue = (key: string, value: string) => {
    // Percentages should be whole numbers (e.g., 20 for 20%)
    if (key.includes('fee') || key.includes('commission') || key.includes('percent')) {
      const numValue = parseFloat(value);
      // If stored as cents (2000), convert to percentage (20%)
      // If stored as decimal (0.20), convert to percentage (20%)
      // If stored as whole number (20), use as is (20%)
      if (numValue > 100) {
        return `${(numValue / 100).toFixed(0)}%`; // 2000 -> 20%
      } else if (numValue < 1) {
        return `${(numValue * 100).toFixed(0)}%`; // 0.20 -> 20%
      } else {
        return `${numValue.toFixed(0)}%`; // 20 -> 20%
      }
    }
    // Amounts should be in decimals (e.g., 20.00 for $20.00)
    if (key.includes('minimum') || key.includes('amount') || key.includes('price')) {
      const numValue = parseFloat(value);
      const currency = key.split('_').pop()?.toUpperCase() || 'USD';
      // If stored as cents (2000), convert to decimal (20.00)
      if (numValue > 1000) {
        return `${(numValue / 100).toFixed(2)} ${currency}`;
      }
      return `${numValue.toFixed(2)} ${currency}`;
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
                  {isToggleSetting(setting.key) ? null : (
                    <span className="text-xs text-muted-foreground">
                      Display: {formatValue(setting.key, values[setting.key])}
                    </span>
                  )}
                </div>
                
                {isToggleSetting(setting.key) ? (
                  <select
                    value={values[setting.key]}
                    onChange={(e) => setValues({ ...values, [setting.key]: e.target.value })}
                    className="px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                ) : isTextSetting(setting.key, values[setting.key]) ? (
                  <input
                    type="text"
                    value={values[setting.key]}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        [setting.key]:
                          setting.key === 'platform_base_currency'
                            ? e.target.value.toUpperCase()
                            : e.target.value,
                      })
                    }
                    className="px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  />
                ) : (
                  <input
                    type="number"
                    step={setting.key.includes('percent') ? '1' : '0.01'}
                    min="0"
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
