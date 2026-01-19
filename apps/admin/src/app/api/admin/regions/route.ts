import { NextResponse } from 'next/server';

import { getAdminSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('region_config')
      .select('region_code, region_name, is_active')
      .order('is_active', { ascending: false })
      .order('region_name', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({ regions: data || [] });
  } catch (error) {
    console.error('List regions error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
