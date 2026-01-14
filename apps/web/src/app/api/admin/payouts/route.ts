import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { 
  processPayout, 
  processPendingPayouts, 
  getPayoutQueue,
  retryFailedPayouts,
} from '@/lib/payments/payout-service';

// GET: Get payout queue and statistics
export async function GET(request: Request) {
  try {
    // Verify admin access
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // TODO: Add proper admin role check
    // For now, check if user is a photographer (simplified)
    
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'queue';

    const serviceClient = createServiceClient();

    if (view === 'queue') {
      const queue = await getPayoutQueue();
      return NextResponse.json(queue);
    }

    if (view === 'history') {
      const limit = parseInt(searchParams.get('limit') || '50');
      const offset = parseInt(searchParams.get('offset') || '0');

      const { data: payouts, count } = await serviceClient
        .from('payouts')
        .select(`
          *,
          wallets (
            provider,
            momo_provider,
            momo_account_number,
            photographers (
              display_name,
              email
            )
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      return NextResponse.json({
        payouts,
        total: count,
        limit,
        offset,
      });
    }

    if (view === 'pending') {
      const { data: pending } = await serviceClient
        .from('wallet_balances')
        .select(`
          *,
          wallets:wallet_id (
            provider,
            momo_provider,
            photographers:photographer_id (
              display_name,
              email
            )
          )
        `)
        .gt('available_balance', 0)
        .order('available_balance', { ascending: false });

      return NextResponse.json({ pending });
    }

    return NextResponse.json({ error: 'Invalid view' }, { status: 400 });
  } catch (error) {
    console.error('Admin payouts GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payout data' },
      { status: 500 }
    );
  }
}

// POST: Process payouts
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, walletId, amount, currency } = body;

    switch (action) {
      case 'single': {
        // Process single payout
        if (!walletId || !amount) {
          return NextResponse.json(
            { error: 'walletId and amount required' },
            { status: 400 }
          );
        }

        const result = await processPayout({
          walletId,
          amount,
          currency: currency || 'USD',
          mode: 'manual',
        });

        return NextResponse.json(result);
      }

      case 'batch-threshold': {
        // Process all pending payouts above threshold
        const result = await processPendingPayouts('threshold');
        return NextResponse.json(result);
      }

      case 'batch-all': {
        // Process all pending payouts (scheduled mode)
        const result = await processPendingPayouts('scheduled');
        return NextResponse.json(result);
      }

      case 'retry-failed': {
        // Retry failed payouts
        const result = await retryFailedPayouts();
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Admin payouts POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process payout' },
      { status: 500 }
    );
  }
}
