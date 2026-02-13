export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('supported_currencies')
      .select('code, name, symbol, symbol_position, decimal_places, countries, is_active, updated_at')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        {
          error: 'No active currencies configured. Configure currencies in admin pricing.',
          failClosed: true,
        },
        { status: 503 }
      );
    }

    const latestUpdatedAt = data.reduce((acc, row) => {
      const value = row.updated_at ? Date.parse(row.updated_at) : 0;
      return value > acc ? value : acc;
    }, 0);

    return NextResponse.json({
      currencies: data.map((row) => ({
        code: row.code,
        name: row.name,
        symbol: row.symbol,
        symbolPosition: row.symbol_position || 'before',
        decimalPlaces: row.decimal_places ?? 2,
        countries: row.countries || [],
        isActive: row.is_active,
      })),
      version: String(latestUpdatedAt || Date.now()),
      updatedAt: latestUpdatedAt ? new Date(latestUpdatedAt).toISOString() : new Date().toISOString(),
    });
  } catch (error) {
    console.error('Runtime currency error:', error);
    return NextResponse.json(
      { error: 'Failed to load runtime currency configuration', failClosed: true },
      { status: 500 }
    );
  }
}
