export const dynamic = 'force-dynamic';

/**
 * Purchases API
 * 
 * Handles purchase history and order details.
 */

import { NextResponse } from 'next/server';

import { getPurchaseHistory } from '@/lib/delivery';
import { createClient } from '@/lib/supabase/server';

// GET - Get purchase history
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const purchases = await getPurchaseHistory(user.id);

    return NextResponse.json({ purchases });

  } catch (error) {
    console.error('Purchases GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get purchases' },
      { status: 500 }
    );
  }
}

