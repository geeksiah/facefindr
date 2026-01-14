import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get total count
    const { count: total } = await supabaseAdmin
      .from('geo_waitlist')
      .select('*', { count: 'exact', head: true });

    // Get count by country
    const { data: byCountry } = await supabaseAdmin
      .from('geo_waitlist')
      .select('country_code')
      .order('country_code');

    // Aggregate counts
    const countryCounts: Record<string, number> = {};
    byCountry?.forEach(row => {
      countryCounts[row.country_code] = (countryCounts[row.country_code] || 0) + 1;
    });

    const stats = {
      total: total || 0,
      byCountry: Object.entries(countryCounts)
        .map(([country_code, count]) => ({ country_code, count }))
        .sort((a, b) => b.count - a.count),
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Get waitlist stats error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
