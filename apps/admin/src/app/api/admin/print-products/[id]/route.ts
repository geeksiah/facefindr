import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

// PUT - Update a print product
export async function PUT(
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

    const { id } = params;
    const body = await request.json();
    const { name, type, description, base_price_usd, is_active, sizes } = body;

    const { data, error } = await supabaseAdmin
      .from('print_products')
      .update({
        name,
        type,
        description,
        base_price_usd,
        is_active,
        sizes: sizes || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAction('print_product_update', 'print_product', id, { name });

    return NextResponse.json({ success: true, product: data });
  } catch (error) {
    console.error('Update print product error:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

// PATCH - Toggle active status
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

    const { id } = params;
    const body = await request.json();

    const { error } = await supabaseAdmin
      .from('print_products')
      .update({
        is_active: body.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Toggle print product error:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

// DELETE - Delete a print product
export async function DELETE(
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

    const { id } = params;

    // Check if product has any orders
    const { count } = await supabaseAdmin
      .from('print_order_items')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', id);

    if (count && count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete product with existing orders' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('print_products')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await logAction('print_product_delete', 'print_product', id, {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete print product error:', error);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
