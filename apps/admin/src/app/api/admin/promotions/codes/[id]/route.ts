import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalDate(value: unknown): string | null {
  const text = normalizeOptionalText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('settings.update'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = String(body.name || '').trim();
    if (body.description !== undefined) updates.description = normalizeOptionalText(body.description);
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);
    if (body.starts_at !== undefined) updates.starts_at = normalizeOptionalDate(body.starts_at);
    if (body.expires_at !== undefined) updates.expires_at = normalizeOptionalDate(body.expires_at);
    if (body.max_redemptions !== undefined) {
      const value = Number(body.max_redemptions);
      updates.max_redemptions = Number.isFinite(value) ? Math.round(value) : null;
    }
    if (body.max_redemptions_per_user !== undefined) {
      const value = Number(body.max_redemptions_per_user);
      updates.max_redemptions_per_user = Number.isFinite(value) ? Math.round(value) : null;
    }
    if (body.target_plan_code !== undefined) {
      updates.target_plan_code = normalizeOptionalText(body.target_plan_code);
    }
    if (body.target_storage_plan_slug !== undefined) {
      updates.target_storage_plan_slug = normalizeOptionalText(body.target_storage_plan_slug);
    }
    if (body.metadata !== undefined && body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
      updates.metadata = body.metadata;
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .update(updates)
      .eq('id', params.id)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Promo code not found' }, { status: 404 });
      }
      throw error;
    }

    await logAction('promo_code_update', 'promo_code', params.id, {
      updates: Object.keys(updates),
    });

    return NextResponse.json({ success: true, promoCode: data });
  } catch (error) {
    console.error('Update promo code error:', error);
    return NextResponse.json({ error: 'Failed to update promo code' }, { status: 500 });
  }
}
