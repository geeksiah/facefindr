import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

type ProductScope = 'creator_subscription' | 'vault_subscription' | 'drop_in_credits';
type DiscountType = 'fixed' | 'percent';

function normalizeScope(value: unknown): ProductScope | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'creator_subscription') return normalized;
  if (normalized === 'vault_subscription') return normalized;
  if (normalized === 'drop_in_credits') return normalized;
  return null;
}

function normalizeDiscountType(value: unknown): DiscountType | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'fixed') return 'fixed';
  if (normalized === 'percent') return 'percent';
  return null;
}

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

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ promoCodes: data || [] });
  } catch (error) {
    console.error('Get promo codes error:', error);
    return NextResponse.json({ error: 'Failed to get promo codes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('settings.update'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const code = String(body?.code || '').trim().toUpperCase();
    const name = String(body?.name || '').trim();
    const productScope = normalizeScope(body?.product_scope);
    const discountType = normalizeDiscountType(body?.discount_type);
    const discountValue = Number.parseInt(String(body?.discount_value || ''), 10);
    const currency = normalizeOptionalText(body?.currency)?.toUpperCase() || null;
    const startsAt = normalizeOptionalDate(body?.starts_at);
    const expiresAt = normalizeOptionalDate(body?.expires_at);
    const maxRedemptions = body?.max_redemptions === null ? null : Number(body?.max_redemptions);
    const maxRedemptionsPerUser =
      body?.max_redemptions_per_user === null ? null : Number(body?.max_redemptions_per_user);

    if (!code || !name || !productScope || !discountType || !Number.isFinite(discountValue)) {
      return NextResponse.json({ error: 'Missing required promo code fields' }, { status: 400 });
    }

    if (discountType === 'percent' && (discountValue < 1 || discountValue > 100)) {
      return NextResponse.json({ error: 'Percent discount must be between 1 and 100' }, { status: 400 });
    }

    if (discountType === 'fixed' && discountValue <= 0) {
      return NextResponse.json({ error: 'Fixed discount must be greater than 0' }, { status: 400 });
    }

    if (discountType === 'fixed' && !currency) {
      return NextResponse.json({ error: 'currency is required for fixed discount promo codes' }, { status: 400 });
    }

    if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
      return NextResponse.json({ error: 'expires_at must be later than starts_at' }, { status: 400 });
    }

    if (maxRedemptions !== null && Number.isFinite(maxRedemptions) && maxRedemptions <= 0) {
      return NextResponse.json({ error: 'max_redemptions must be greater than 0' }, { status: 400 });
    }

    if (
      maxRedemptionsPerUser !== null &&
      Number.isFinite(maxRedemptionsPerUser) &&
      maxRedemptionsPerUser <= 0
    ) {
      return NextResponse.json({ error: 'max_redemptions_per_user must be greater than 0' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .insert({
        code,
        name,
        description: normalizeOptionalText(body?.description),
        product_scope: productScope,
        discount_type: discountType,
        discount_value: discountValue,
        currency,
        target_plan_code: normalizeOptionalText(body?.target_plan_code),
        target_storage_plan_slug: normalizeOptionalText(body?.target_storage_plan_slug),
        is_active: body?.is_active !== false,
        starts_at: startsAt,
        expires_at: expiresAt,
        max_redemptions:
          maxRedemptions !== null && Number.isFinite(maxRedemptions) ? Math.round(maxRedemptions) : null,
        max_redemptions_per_user:
          maxRedemptionsPerUser !== null && Number.isFinite(maxRedemptionsPerUser)
            ? Math.round(maxRedemptionsPerUser)
            : null,
        metadata:
          body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
            ? body.metadata
            : {},
        created_by: session.adminId,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Promo code already exists' }, { status: 409 });
      }
      throw error;
    }

    await logAction('promo_code_create', 'promo_code', data.id, {
      code: data.code,
      product_scope: data.product_scope,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
    });

    return NextResponse.json({ success: true, promoCode: data });
  } catch (error) {
    console.error('Create promo code error:', error);
    return NextResponse.json({ error: 'Failed to create promo code' }, { status: 500 });
  }
}
