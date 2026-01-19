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
      .from('sms_provider_presets')
      .select('*')
      .eq('is_active', true)
      .order('display_name', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ presets: data || [] });
  } catch (error) {
    console.error('Get SMS presets error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
