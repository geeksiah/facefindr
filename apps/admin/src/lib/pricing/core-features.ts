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

const CORE_CREATOR_FEATURES: PlanFeatureInsert[] = [
  {
    code: 'max_active_events',
    name: 'Max Active Events',
    description: 'Maximum number of active events allowed. Use -1 for unlimited.',
    feature_type: 'limit',
    default_value: 1,
    applicable_to: ['creator'],
    category: 'events',
    display_order: 10,
    is_active: true,
  },
  {
    code: 'max_photos_per_event',
    name: 'Max Photos Per Event',
    description: 'Maximum number of photos allowed per event. Use -1 for unlimited.',
    feature_type: 'limit',
    default_value: 50,
    applicable_to: ['creator'],
    category: 'photos',
    display_order: 20,
    is_active: true,
  },
  {
    code: 'max_face_ops_per_event',
    name: 'Max Face Ops Per Event',
    description: 'Maximum face recognition operations per event. Use -1 for unlimited.',
    feature_type: 'limit',
    default_value: 0,
    applicable_to: ['creator'],
    category: 'face_recognition',
    display_order: 30,
    is_active: true,
  },
  {
    code: 'storage_gb',
    name: 'Storage (GB)',
    description: 'Maximum creator storage in GB. Use -1 for unlimited.',
    feature_type: 'limit',
    default_value: 1,
    applicable_to: ['creator'],
    category: 'storage',
    display_order: 40,
    is_active: true,
  },
  {
    code: 'team_members',
    name: 'Team Members / Collaborators',
    description:
      'Maximum active team members allowed across creator events (owner included). Use -1 for unlimited.',
    feature_type: 'limit',
    default_value: 1,
    applicable_to: ['creator'],
    category: 'collaboration',
    display_order: 50,
    is_active: true,
  },
  {
    code: 'face_recognition_enabled',
    name: 'Face Recognition',
    description: 'Enable AI face recognition features.',
    feature_type: 'boolean',
    default_value: false,
    applicable_to: ['creator'],
    category: 'face_recognition',
    display_order: 60,
    is_active: true,
  },
  {
    code: 'custom_watermark',
    name: 'Custom Watermark',
    description: 'Allow custom watermark uploads.',
    feature_type: 'boolean',
    default_value: false,
    applicable_to: ['creator'],
    category: 'branding',
    display_order: 70,
    is_active: true,
  },
  {
    code: 'live_event_mode',
    name: 'Live Event Mode',
    description: 'Allow live mode for events.',
    feature_type: 'boolean',
    default_value: false,
    applicable_to: ['creator'],
    category: 'events',
    display_order: 80,
    is_active: true,
  },
  {
    code: 'api_access',
    name: 'API Access',
    description: 'Allow API access.',
    feature_type: 'boolean',
    default_value: false,
    applicable_to: ['creator'],
    category: 'integrations',
    display_order: 90,
    is_active: true,
  },
];

export function normalizeFeaturePlanType(
  planType?: string | null
): 'creator' | 'drop_in' | 'payg' | null {
  const normalized = String(planType || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'creator' || normalized === 'photographer') return 'creator';
  if (normalized === 'drop_in') return 'drop_in';
  if (normalized === 'payg') return 'payg';
  return null;
}

export async function ensureCoreCreatorPlanFeatures(supabase: any): Promise<void> {
  try {
    const codes = CORE_CREATOR_FEATURES.map((feature) => feature.code);
    const { data: existingRows, error: existingError } = await supabase
      .from('plan_features')
      .select('id, code, applicable_to')
      .in('code', codes);

    if (existingError) {
      console.error('Failed to check existing creator plan features:', existingError);
      return;
    }

    const existingByCode = new Map(
      (existingRows || []).map((row: any) => [String(row.code), row])
    );
    const missing = CORE_CREATOR_FEATURES.filter((feature) => !existingByCode.has(feature.code));
    if (missing.length) {
      const { error: insertError } = await supabase.from('plan_features').insert(missing);
      if (insertError) {
        console.error('Failed to seed core creator plan features:', insertError);
      }
    }

    for (const row of existingRows || []) {
      const applicableTo = Array.isArray(row.applicable_to) ? row.applicable_to : [];
      if (applicableTo.includes('creator')) continue;
      const merged = Array.from(new Set([...applicableTo, 'creator']));
      const { error: updateError } = await supabase
        .from('plan_features')
        .update({ applicable_to: merged, is_active: true })
        .eq('id', row.id);
      if (updateError) {
        console.error(`Failed to normalize feature applicability for ${row.code}:`, updateError);
      }
    }
  } catch (error) {
    console.error('Failed to ensure core creator plan features:', error);
  }
}

// Backward compatibility alias for older imports.
export const ensureCorePhotographerPlanFeatures = ensureCoreCreatorPlanFeatures;
