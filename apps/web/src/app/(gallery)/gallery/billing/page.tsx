'use client';

import { useEffect, useRef, useState } from 'react';
import { 
  CreditCard, 
  Wallet, 
  Zap, 
  Plus, 
  Check, 
  AlertCircle,
  Smartphone,
  Receipt,
  Shield,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { openPaystackInlineCheckout } from '@/lib/payments/paystack-inline';
import { createClient } from '@/lib/supabase/client';

interface PaymentMethod {
  id: string;
  type: 'card' | 'mobile_money' | 'paypal';
  last4?: string;
  brand?: string;
  phone?: string;
  provider?: string;
  isDefault: boolean;
}

interface WalletBalance {
  available: number;
  pending: number;
  currency: string;
}

interface DropInPlan {
  id: string;
  code: string;
  name: string;
  description: string;
  credits: number;
  priceCents: number;
  currency: string;
  features: string[];
  popular?: boolean;
}

interface Transaction {
  id: string;
  type: 'purchase' | 'credit_purchase' | 'refund';
  amount: number;
  currency: string;
  description: string;
  status: 'completed' | 'pending' | 'failed';
  createdAt: string;
  providerReference?: string | null;
}

export default function BillingPage() {
  const toast = useToast();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [wallet, setWallet] = useState<WalletBalance>({ available: 0, pending: 0, currency: 'USD' });
  const [dropInCredits, setDropInCredits] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [connectingMethod, setConnectingMethod] = useState<string | null>(null);
  const [dropInPacks, setDropInPacks] = useState<DropInPlan[]>([]);
  const [unitPriceCents, setUnitPriceCents] = useState<number | null>(null);
  const [unitPriceCurrency, setUnitPriceCurrency] = useState('USD');
  const [customCredits, setCustomCredits] = useState('10');
  const [packsError, setPacksError] = useState<string | null>(null);
  const [purchasingCode, setPurchasingCode] = useState<string | null>(null);
  const hasHandledCreditsRedirect = useRef(false);

  useEffect(() => {
    void loadBillingData();
    void loadDropInPacks();
  }, []);

  const loadDropInPacks = async () => {
    try {
      const response = await fetch('/api/runtime/drop-in/packs', { cache: 'no-store' });
      const data = await response.json();

      if (!response.ok || !Array.isArray(data.packs) || data.packs.length === 0) {
        setDropInPacks([]);
        setPacksError(data?.error || 'Drop-in packs are not configured yet.');
        return;
      }

      setDropInPacks(
        data.packs.map((pack: any) => ({
          id: pack.id,
          code: pack.code,
          name: pack.name,
          description: pack.description || '',
          credits: Number(pack.credits || 0),
          priceCents: Number(pack.priceCents || 0),
          currency: String(pack.currency || 'USD').toUpperCase(),
          features: Array.isArray(pack.features) ? pack.features : [],
          popular: Boolean(pack.popular),
        }))
      );
      setUnitPriceCents(Number(data.unitPriceCents || 0));
      setUnitPriceCurrency(String(data.currency || 'USD').toUpperCase());
      setPacksError(null);
    } catch (error) {
      setDropInPacks([]);
      setPacksError('Failed to load drop-in packs.');
    }
  };

  const loadBillingData = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load payment methods
      const { data: methods } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false });

      if (methods) {
        setPaymentMethods(methods.map((m: any) => ({
          id: m.id,
          type:
            m.method_type === 'mobile_money'
              ? 'mobile_money'
              : m.method_type === 'paypal'
              ? 'paypal'
              : 'card',
          last4: m.card_last_four || m.bank_account_last_four,
          brand: m.card_brand,
          phone: m.mobile_money_number,
          provider: m.mobile_money_provider || m.display_name,
          isDefault: m.is_default,
        })));
      }

      // Load drop-in credits
      const { data: attendee } = await supabase
        .from('attendees')
        .select('drop_in_credits')
        .eq('id', user.id)
        .single();

      if (attendee) {
        setDropInCredits(attendee.drop_in_credits || 0);
      }

      // Load recent transactions
      const { data: txs } = await supabase
        .from('transactions')
        .select(
          'id, gross_amount, currency, status, created_at, metadata, paystack_reference, stripe_payment_intent_id, flutterwave_tx_ref, paypal_order_id'
        )
        .eq('attendee_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      const { data: creditPurchases } = await supabase
        .from('drop_in_credit_purchases')
        .select('id, credits_purchased, amount_paid, currency, status, created_at')
        .eq('attendee_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      const mappedTransactions: Transaction[] = [];
      if (txs) {
        mappedTransactions.push(...txs.map((t: any) => ({
          id: t.id,
          type: t.status === 'refunded' ? 'refund' : 'purchase',
          amount: Number(t.gross_amount || 0),
          currency: String(t.currency || wallet.currency || 'USD').toUpperCase(),
          description:
            (t.metadata as any)?.description ||
            ((t.metadata as any)?.type === 'tip' ? 'Tip payment' : 'Photo purchase'),
          providerReference:
            t.paystack_reference ||
            t.stripe_payment_intent_id ||
            t.flutterwave_tx_ref ||
            t.paypal_order_id ||
            null,
          status:
            t.status === 'succeeded'
              ? 'completed'
              : t.status === 'pending'
              ? 'pending'
              : 'failed',
          createdAt: t.created_at,
        })));
      }

      if (creditPurchases) {
        mappedTransactions.push(
          ...creditPurchases.map((purchase: any) => ({
            id: purchase.id,
            type: 'credit_purchase' as const,
            amount: Number(purchase.amount_paid || 0),
            currency: String(purchase.currency || wallet.currency || 'USD').toUpperCase(),
            description: `Drop-in credits (${Number(purchase.credits_purchased || 0)})`,
            status:
              purchase.status === 'active' || purchase.status === 'exhausted'
                ? 'completed'
                : purchase.status === 'pending'
                  ? 'pending'
                  : 'failed',
            createdAt: purchase.created_at,
          }))
        );
      }

      setTransactions(
        Array.from(
          mappedTransactions
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .reduce((deduped, tx) => {
              const minuteBucket = new Date(tx.createdAt).toISOString().slice(0, 16);
              const fallbackKey = `${tx.type}:${tx.amount}:${tx.currency}:${tx.description}:${minuteBucket}`;
              const key = tx.providerReference ? `provider:${tx.providerReference}` : fallbackKey;
              if (!deduped.has(key)) {
                deduped.set(key, tx);
              }
              return deduped;
            }, new Map<string, Transaction>())
            .values()
        ).slice(0, 10)
      );
    } catch (err) {
      console.error('Failed to load billing data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openCheckoutPopup = (checkoutUrl: string) => {
    const popup = window.open(
      checkoutUrl,
      'ferchrBillingPayment',
      'popup=yes,width=520,height=760,menubar=no,toolbar=no,location=yes,status=no'
    );

    if (!popup) {
      window.location.href = checkoutUrl;
      return;
    }
  };

  const startPaymentMethodConnect = async (method: 'card' | 'paypal') => {
    try {
      setConnectingMethod(method);
      const returnTo = encodeURIComponent('/gallery/billing');
      const href =
        method === 'card'
          ? `/api/payment-methods/setup-card?returnTo=${returnTo}`
          : `/api/payment-methods/connect-paypal?returnTo=${returnTo}`;
      window.location.href = href;
    } catch (error: any) {
      toast.error('Connection failed', error?.message || 'Unable to start setup');
    } finally {
      setConnectingMethod(null);
    }
  };

  const verifyCreditsPurchase = async (purchaseId: string, reference: string) => {
    const response = await fetch('/api/drop-in/credits/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchaseId,
        provider: 'paystack',
        reference,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Payment verification failed');
    }
  };

  useEffect(() => {
    if (hasHandledCreditsRedirect.current) return;
    hasHandledCreditsRedirect.current = true;

    const searchParams = new URLSearchParams(window.location.search);
    const creditsStatus = String(searchParams.get('credits') || '').toLowerCase();
    const provider = String(searchParams.get('provider') || '').toLowerCase();
    const purchaseId = String(searchParams.get('purchase_id') || '').trim();
    const reference = String(searchParams.get('reference') || '').trim();

    if (creditsStatus !== 'success' || provider !== 'paystack' || !purchaseId || !reference) {
      return;
    }

    const nextUrl = `${window.location.pathname}`;
    window.history.replaceState({}, document.title, nextUrl);

    void (async () => {
      try {
        await verifyCreditsPurchase(purchaseId, reference);
        toast.success('Credits added', 'Your payment was confirmed and credits were applied.');
        await loadBillingData();
      } catch (verifyError: any) {
        toast.error(
          'Credit confirmation failed',
          verifyError?.message || 'Payment succeeded but verification failed. Please contact support.'
        );
      }
    })();
  }, []);

  const purchaseCredits = async (credits: number, buttonKey: string) => {
    try {
      setPurchasingCode(buttonKey);
      const response = await fetch('/api/drop-in/credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Unable to start checkout');
      }

      if (data?.provider === 'paystack' && data?.paystack?.publicKey) {
        await openPaystackInlineCheckout({
          publicKey: String(data.paystack.publicKey),
          email: String(data.paystack.email || ''),
          amount: Number(data.paystack.amount || 0),
          currency: String(data.paystack.currency || unitPriceCurrency || 'USD'),
          reference: String(data.paystack.reference || ''),
          accessCode: data.paystack.accessCode ? String(data.paystack.accessCode) : null,
          metadata: {
            purchase_id: data.purchaseId,
            type: 'drop_in_credit_purchase',
          },
          onSuccess: async (reference) => {
            try {
              await verifyCreditsPurchase(String(data.purchaseId || ''), reference);
              toast.success('Credits added', `${credits} credits were added to your account.`);
              await loadBillingData();
            } catch (verifyError: any) {
              toast.error('Verification failed', verifyError?.message || 'Payment verification failed');
            }
          },
          onClose: () => {
            setPurchasingCode(null);
          },
        });
        return;
      }

      if (data?.checkoutUrl) {
        toast.success('Redirecting...', 'Opening secure checkout');
        openCheckoutPopup(String(data.checkoutUrl));
        return;
      }

      throw new Error('Checkout URL was not returned by server');
    } catch (error: any) {
      toast.error('Checkout failed', error?.message || 'Unable to start checkout');
    } finally {
      setPurchasingCode(null);
    }
  };

  const formatCurrency = (amountInCents: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amountInCents / 100);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-muted-foreground">Loading billing...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing & Wallet</h1>
        <p className="text-secondary mt-1">Manage your payment methods and Drop-in credits</p>
      </div>

      {/* Balance Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Drop-in Credits */}
        <div className="rounded-xl border border-border bg-gradient-to-br from-accent/5 to-accent/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="rounded-lg bg-accent/20 p-2">
              <Zap className="h-5 w-5 text-accent" />
            </div>
            <span className="text-xs font-medium text-accent bg-accent/10 px-2 py-1 rounded-full">
              Pay-as-you-go
            </span>
          </div>
          <p className="text-3xl font-bold text-foreground">{dropInCredits}</p>
          <p className="text-sm text-secondary">Drop-in Credits</p>
          <p className="text-xs text-muted-foreground mt-2">
            Use credits to search for your photos across events
          </p>
        </div>

        {/* Wallet Balance */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="rounded-lg bg-success/10 p-2">
              <Wallet className="h-5 w-5 text-success" />
            </div>
          </div>
          <p className="text-3xl font-bold text-foreground">
            {formatCurrency(wallet.available, wallet.currency)}
          </p>
          <p className="text-sm text-secondary">Available Balance</p>
          {wallet.pending > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {formatCurrency(wallet.pending, wallet.currency)} pending
            </p>
          )}
        </div>
      </div>

      {/* Drop-in Credit Packs */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Buy Drop-in Credits</h2>
        {unitPriceCents && unitPriceCents > 0 && (
          <p className="text-sm text-secondary mb-3">
            1 credit = {formatCurrency(unitPriceCents, unitPriceCurrency)}
          </p>
        )}
        {packsError && dropInPacks.length === 0 ? (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 text-warning" />
              <div>
                <p className="font-medium">Drop-in billing is unavailable.</p>
                <p className="text-secondary">{packsError}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Custom credits
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={customCredits}
                    onChange={(event) => setCustomCredits(event.target.value)}
                    className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-foreground"
                  />
                </div>
                <Button
                  onClick={() => {
                    const parsed = Number.parseInt(customCredits, 10);
                    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1000) {
                      toast.error('Invalid credits', 'Enter a value between 1 and 1000');
                      return;
                    }
                    void purchaseCredits(parsed, 'custom');
                  }}
                  disabled={purchasingCode === 'custom'}
                >
                  {purchasingCode === 'custom' ? 'Processing...' : 'Buy Custom Amount'}
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {dropInPacks.map((pack) => (
            <div
              key={pack.id}
              className={`relative rounded-xl border p-5 transition-all hover:shadow-lg ${
                pack.popular 
                  ? 'border-accent bg-accent/5 shadow-md' 
                  : 'border-border bg-card hover:border-accent/50'
              }`}
            >
              {pack.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-accent text-white text-xs font-medium px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}
              <h3 className="font-semibold text-foreground">{pack.name}</h3>
              <p className="text-sm text-secondary mt-1">{pack.credits} credits</p>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-bold text-foreground">{formatCurrency(pack.priceCents, pack.currency)}</span>
              </div>
              <p className="text-accent font-medium mb-3">{pack.description || 'Configured by admin pricing'}</p>
              <ul className="space-y-2 mb-4">
                {pack.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-secondary">
                    <Check className="h-4 w-4 text-success flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button 
                className="w-full" 
                variant={pack.popular ? 'primary' : 'outline'}
                disabled={purchasingCode === pack.code}
                onClick={() => purchaseCredits(pack.credits, pack.code)}
              >
                {purchasingCode === pack.code ? 'Redirecting...' : 'Buy Now'}
              </Button>
            </div>
            ))}
          </div>
          </div>
        )}
      </div>

      {/* Payment Methods */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Payment Methods</h2>
          <Button variant="outline" size="sm" onClick={() => setShowAddPayment(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Method
          </Button>
        </div>

        {paymentMethods.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <CreditCard className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="font-medium text-foreground mb-1">No payment methods</h3>
            <p className="text-sm text-secondary mb-4">
              Add a payment method to purchase photos and credits
            </p>
            <Button onClick={() => setShowAddPayment(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Payment Method
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <div 
                key={method.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  {method.type === 'card' ? (
                    <div className="rounded-lg bg-muted p-2">
                      <CreditCard className="h-5 w-5 text-foreground" />
                    </div>
                  ) : method.type === 'mobile_money' ? (
                    <div className="rounded-lg bg-success/10 p-2">
                      <Smartphone className="h-5 w-5 text-success" />
                    </div>
                  ) : (
                    <div className="rounded-lg bg-accent/10 p-2">
                      <Wallet className="h-5 w-5 text-accent" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-foreground">
                      {method.type === 'card' 
                        ? `${method.brand} •••• ${method.last4}`
                        : method.type === 'mobile_money'
                        ? `${method.provider} ${method.phone}`
                        : 'PayPal'
                      }
                    </p>
                    {method.isDefault && (
                      <p className="text-xs text-accent">Default</p>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm">Edit</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Add Payment Method (Optional)</h3>
                <p className="text-sm text-secondary mt-1">
                  You can pay without saving a method. Saving is only for faster future checkout.
                </p>
              </div>
              <button
                onClick={() => setShowAddPayment(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => void startPaymentMethodConnect('card')}
                disabled={connectingMethod !== null}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                {connectingMethod === 'card' ? 'Connecting card...' : 'Save Card (Stripe)'}
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => void startPaymentMethodConnect('paypal')}
                disabled={connectingMethod !== null}
              >
                <Wallet className="h-4 w-4 mr-2" />
                {connectingMethod === 'paypal' ? 'Connecting PayPal...' : 'Save PayPal'}
              </Button>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-xs text-secondary">
              Tip: For one-time credit purchases, just click <strong>Buy Now</strong>. You do not need to add a saved method first.
            </div>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Recent Transactions</h2>
        {transactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Receipt className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="font-medium text-foreground mb-1">No transactions yet</h3>
            <p className="text-sm text-secondary">
              Your purchase history will appear here
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left text-sm font-medium text-secondary px-4 py-3">Description</th>
                  <th className="text-left text-sm font-medium text-secondary px-4 py-3">Date</th>
                  <th className="text-right text-sm font-medium text-secondary px-4 py-3">Amount</th>
                  <th className="text-right text-sm font-medium text-secondary px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="bg-card hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm text-foreground">{tx.description}</td>
                    <td className="px-4 py-3 text-sm text-secondary">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-foreground">
                      {tx.type === 'refund' ? '-' : ''}{formatCurrency(tx.amount, tx.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                        tx.status === 'completed' ? 'bg-success/10 text-success' :
                        tx.status === 'pending' ? 'bg-warning/10 text-warning' :
                        'bg-destructive/10 text-destructive'
                      }`}>
                        {tx.status === 'completed' ? <Check className="h-3 w-3" /> : 
                         tx.status === 'pending' ? <AlertCircle className="h-3 w-3" /> : null}
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Security Note */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <Shield className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-foreground text-sm">Secure Payments</p>
          <p className="text-xs text-secondary mt-1">
            All payments are processed securely through Stripe. We never store your full card details.
          </p>
        </div>
      </div>
    </div>
  );
}
