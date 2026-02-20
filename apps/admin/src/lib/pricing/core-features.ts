type PlanFeatureInsert = {
  code: string;
  name: string;
  description: string;
  feature_type: 'limit' | 'boolean' | 'numeric' | 'text';
  default_value: any;
  applicable_to: string[];
  category: string;
  display_order: number;
  is_active: boolean;
};

const CORE_PHOTOGRAPHER_FEATURES: PlanFeatureInsert[] = [
  {
    code: 'team_members',
    name: 'Team Members / Collaborators',
    description:
      'Maximum active team members allowed across creator events (owner included). Use -1 for unlimited.',
    feature_type: 'limit',
    default_value: 1,
    applicable_to: ['photographer'],
    category: 'collaboration',
    display_order: 35,
    is_active: true,
  },
];

export function normalizeFeaturePlanType(
  planType?: string | null
): 'photographer' | 'drop_in' | null {
  const normalized = String(planType || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'photographer' || normalized === 'drop_in') return normalized;
  if (normalized === 'payg' || normalized === 'creator') return 'photographer';
  return null;
}

export async function ensureCorePhotographerPlanFeatures(supabase: any): Promise<void> {
  try {
    const codes = CORE_PHOTOGRAPHER_FEATURES.map((feature) => feature.code);
    const { data: existingRows, error: existingError } = await supabase
      .from('plan_features')
      .select('code')
      .in('code', codes);

    if (existingError) {
      console.error('Failed to check existing plan features:', existingError);
      return;
    }

    const existing = new Set((existingRows || []).map((row: any) => String(row.code)));
    const missing = CORE_PHOTOGRAPHER_FEATURES.filter((feature) => !existing.has(feature.code));
    if (!missing.length) return;

    const { error: insertError } = await supabase.from('plan_features').insert(missing);
    if (insertError) {
      console.error('Failed to seed core plan features:', insertError);
    }
  } catch (error) {
    console.error('Failed to ensure core photographer plan features:', error);
  }
}

