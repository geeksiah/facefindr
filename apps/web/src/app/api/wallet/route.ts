export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { getConnectAccount, createLoginLink, isStripeConfigured } from '@/lib/payments/stripe';
import { createClient } from '@/lib/supabase/server';

// GET: Fetch wallet details and balance
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all wallets for this photographer
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('*')
      .eq('photographer_id', user.id);

    if (walletsError) {
      return NextResponse.json({ error: 'Failed to fetch wallets' }, { status: 500 });
    }

    // Enrich with provider-specific data
    const enrichedWallets = await Promise.all(
      (wallets || []).map(async (wallet) => {
        let providerDetails: any = null;
        let dashboardUrl: string | null = null;

        if (wallet.provider === 'stripe' && wallet.stripe_account_id && isStripeConfigured()) {
          try {
            const account = await getConnectAccount(wallet.stripe_account_id);
            providerDetails = {
              chargesEnabled: account.charges_enabled,
              payoutsEnabled: account.payouts_enabled,
              detailsSubmitted: account.details_submitted,
              requirements: account.requirements,
            };

            // Update wallet status if needed
            if (account.charges_enabled && wallet.status !== 'active') {
              await supabase
                .from('wallets')
                .update({
                  status: 'active',
                  charges_enabled: account.charges_enabled,
                  payouts_enabled: account.payouts_enabled,
                  details_submitted: account.details_submitted,
                })
                .eq('id', wallet.id);
              wallet.status = 'active';
            }

            // Get dashboard link if active
            if (account.details_submitted) {
              const loginLink = await createLoginLink(wallet.stripe_account_id);
              dashboardUrl = loginLink.url;
            }
          } catch (err) {
            console.error('Failed to fetch Stripe account:', err);
          }
        }

        return {
          ...wallet,
          providerDetails,
          dashboardUrl,
        };
      })
    );

    // Get balance from transactions
    const { data: balanceData } = await supabase
      .from('wallet_balances')
      .select('*')
      .eq('photographer_id', user.id);

    return NextResponse.json({
      wallets: enrichedWallets,
      balances: balanceData || [],
    });
  } catch (error) {
    console.error('Wallet fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wallet' },
      { status: 500 }
    );
  }
}

// DELETE: Remove a wallet (provider account)
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get('id');

    if (!walletId) {
      return NextResponse.json({ error: 'Wallet ID required' }, { status: 400 });
    }

    // Verify ownership
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('id', walletId)
      .eq('photographer_id', user.id)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }

    // Check for pending payouts
    const { count: pendingPayouts } = await supabase
      .from('payouts')
      .select('id', { count: 'exact' })
      .eq('wallet_id', walletId)
      .eq('status', 'pending');

    if (pendingPayouts && pendingPayouts > 0) {
      return NextResponse.json(
        { error: 'Cannot delete wallet with pending payouts' },
        { status: 400 }
      );
    }

    // Note: We don't delete the Stripe Connect account - just our reference
    // The photographer can re-onboard if needed

    const { error: deleteError } = await supabase
      .from('wallets')
      .delete()
      .eq('id', walletId);

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete wallet' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Wallet delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete wallet' },
      { status: 500 }
    );
  }
}

