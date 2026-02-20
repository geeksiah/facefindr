import { createServiceClient } from '@/lib/supabase/server';

export interface DropInCreditRules {
  upload: number;
  gift: number;
  recipientUnlock: number;
  internalSearch: number;
  contactsSearch: number;
  externalSearch: number;
}

export const DEFAULT_DROP_IN_CREDIT_RULES: DropInCreditRules = {
  upload: 1,
  gift: 1,
  recipientUnlock: 1,
  internalSearch: 3,
  contactsSearch: 3,
  externalSearch: 5,
};

const KEY_MAP = {
  upload: 'drop_in_credits_required_upload',
  gift: 'drop_in_credits_required_gift',
  recipientUnlock: 'drop_in_credits_required_recipient_unlock',
  internalSearch: 'drop_in_credits_required_internal_search',
  contactsSearch: 'drop_in_credits_required_contacts_search',
  externalSearch: 'drop_in_credits_required_external_search',
} as const;

function parseSettingsNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof raw === 'object') {
    const asObject = raw as Record<string, unknown>;
    if ('value' in asObject) {
      return parseSettingsNumber(asObject.value);
    }
    if ('credits' in asObject) {
      return parseSettingsNumber(asObject.credits);
    }
  }
  return null;
}

function normalizePositiveInt(value: number | null, fallback: number): number {
  if (value === null) return fallback;
  const normalized = Math.round(value);
  return normalized > 0 ? normalized : fallback;
}

export async function resolveDropInCreditRules(): Promise<DropInCreditRules> {
  const supabase = createServiceClient();
  const keys = Object.values(KEY_MAP);
  const { data } = await supabase
    .from('platform_settings')
    .select('setting_key, setting_value, value')
    .in('setting_key', keys);

  const byKey = new Map<string, unknown>();
  for (const row of data || []) {
    byKey.set(row.setting_key, row.setting_value ?? row.value ?? null);
  }

  return {
    upload: normalizePositiveInt(
      parseSettingsNumber(byKey.get(KEY_MAP.upload)),
      DEFAULT_DROP_IN_CREDIT_RULES.upload
    ),
    gift: normalizePositiveInt(
      parseSettingsNumber(byKey.get(KEY_MAP.gift)),
      DEFAULT_DROP_IN_CREDIT_RULES.gift
    ),
    recipientUnlock: normalizePositiveInt(
      parseSettingsNumber(byKey.get(KEY_MAP.recipientUnlock)),
      DEFAULT_DROP_IN_CREDIT_RULES.recipientUnlock
    ),
    internalSearch: normalizePositiveInt(
      parseSettingsNumber(byKey.get(KEY_MAP.internalSearch)),
      DEFAULT_DROP_IN_CREDIT_RULES.internalSearch
    ),
    contactsSearch: normalizePositiveInt(
      parseSettingsNumber(byKey.get(KEY_MAP.contactsSearch)),
      DEFAULT_DROP_IN_CREDIT_RULES.contactsSearch
    ),
    externalSearch: normalizePositiveInt(
      parseSettingsNumber(byKey.get(KEY_MAP.externalSearch)),
      DEFAULT_DROP_IN_CREDIT_RULES.externalSearch
    ),
  };
}

