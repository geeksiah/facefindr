import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { processPendingPayouts, retryFailedPayouts } from '@/lib/payments/payout-service';

/**
 * Cron endpoint for automated payouts
 * 
 * Call this endpoint on a schedule:
 * - Daily: Check threshold payouts
 * - Weekly (e.g., every Monday): Process weekly scheduled payouts
 * - Monthly (e.g., 1st of month): Process monthly scheduled payouts
 * 
 * Recommended setup with Vercel Cron or external service:
 * - Every day at 2 AM: /api/cron/payouts?type=threshold
 * - Every Monday at 3 AM: /api/cron/payouts?type=weekly
 * - 1st of month at 4 AM: /api/cron/payouts?type=monthly
 * - Every 6 hours: /api/cron/payouts?type=retry
 */

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  try {
    // Verify cron secret (prevents unauthorized access)
    const headersList = await headers();
    const authHeader = headersList.get('authorization');
    
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'threshold';

    let result;
    const startTime = Date.now();

    switch (type) {
      case 'threshold':
        // Process payouts for wallets above their currency-specific threshold
        console.log('[CRON] Processing threshold payouts...');
        result = await processPendingPayouts('threshold');
        break;

      case 'daily':
        // Process payouts for photographers who selected daily frequency
        console.log('[CRON] Processing daily payouts...');
        result = await processPendingPayouts('daily');
        break;

      case 'weekly':
        // Process payouts for photographers who selected weekly frequency
        console.log('[CRON] Processing weekly payouts...');
        result = await processPendingPayouts('weekly');
        break;

      case 'monthly':
        // Process payouts for photographers who selected monthly frequency
        console.log('[CRON] Processing monthly payouts...');
        result = await processPendingPayouts('monthly');
        break;

      case 'retry':
        // Retry failed payouts
        console.log('[CRON] Retrying failed payouts...');
        result = await retryFailedPayouts();
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid type. Use: threshold, daily, weekly, monthly, retry' },
          { status: 400 }
        );
    }

    const duration = Date.now() - startTime;

    console.log(`[CRON] Completed in ${duration}ms:`, result);

    return NextResponse.json({
      success: true,
      type,
      duration: `${duration}ms`,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CRON] Payout error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Cron job failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Vercel Cron config (if using Vercel)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max for payout processing
