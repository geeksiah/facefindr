import { supabaseAdmin } from '@/lib/supabase';

const RUNTIME_VERSION_KEY = 'runtime_config_version';

type RuntimeScope = 'settings' | 'plans' | 'regions' | 'pricing' | 'notifications' | 'general';

function buildRuntimeVersionPayload(scope: RuntimeScope) {
  const now = new Date().toISOString();
  return JSON.stringify({
    version: Date.now().toString(),
    updatedAt: now,
    scope,
  });
}

export async function bumpRuntimeConfigVersion(scope: RuntimeScope, adminId?: string) {
  const now = new Date().toISOString();
  const value = buildRuntimeVersionPayload(scope);

  const { data: updatedRows, error: updateError } = await supabaseAdmin
    .from('platform_settings')
    .update({
      value,
      updated_by: adminId || null,
      updated_at: now,
    })
    .eq('setting_key', RUNTIME_VERSION_KEY)
    .select('setting_key');

  if (updateError) {
    throw updateError;
  }

  if ((updatedRows?.length || 0) > 0) {
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from('platform_settings')
    .insert({
      setting_key: RUNTIME_VERSION_KEY,
      value,
      updated_by: adminId || null,
      updated_at: now,
    });

  if (insertError) {
    throw insertError;
  }
}
