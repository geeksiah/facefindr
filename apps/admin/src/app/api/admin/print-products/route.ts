import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

function normalizePrintProductRow(row: any) {
  return {
    ...row,
    type: row.category || 'print',
    base_price_usd: row.base_price ?? 0,
    sizes: [],
  };
}

// GET - List all print products
export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('print_products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ products: (data || []).map(normalizePrintProductRow) });
  } catch (error) {
    console.error('Get print products error:', error);
    return NextResponse.json({ error: 'Failed to get products' }, { status: 500 });
  }
}

// POST - Create a new print product
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('settings.update'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { name, type, description, base_price_usd, is_active } = body;
    const normalizedBasePrice = Number(base_price_usd || 0);

    const { data, error } = await supabaseAdmin
      .from('print_products')
      .insert({
        name,
        category: type || 'print',
        size_code: 'standard',
        description,
        base_cost: normalizedBasePrice,
        base_price: normalizedBasePrice,
        suggested_price: normalizedBasePrice,
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error) throw error;

    await logAction('print_product_create', 'print_product', data.id, { name, type });

    return NextResponse.json({ success: true, product: normalizePrintProductRow(data) });
  } catch (error) {
    console.error('Create print product error:', error);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
