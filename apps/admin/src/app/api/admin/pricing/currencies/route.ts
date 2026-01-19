import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

// GET - List all currencies
export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('supported_currencies')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ currencies: data || [] });
  } catch (error) {
    console.error('Get currencies error:', error);
    return NextResponse.json({ error: 'Failed to get currencies' }, { status: 500 });
  }
}

// PUT - Update currencies
export async function PUT(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { currencies } = body;

    // Update each currency
    for (const currency of currencies) {
      const { error } = await supabaseAdmin
        .from('supported_currencies')
        .update({
          name: currency.name,
          symbol: currency.symbol,
          symbol_position: currency.symbol_position || 'before',
          decimal_places: currency.decimal_places ?? 2,
          countries: currency.countries || [],
          display_order: currency.display_order ?? 100,
          is_active: currency.is_active !== undefined ? currency.is_active : true,
        })
        .eq('code', currency.code);

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update currencies error:', error);
    return NextResponse.json({ error: 'Failed to update currencies' }, { status: 500 });
  }
}
