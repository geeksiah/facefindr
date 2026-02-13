'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
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
  priceCents: number;
  currency: string;
  features: string[];
  popular?: boolean;
}

interface Transaction {
  id: string;
  type: 'purchase' | 'credit_purchase' | 'refund';
  amount: number;
  description: string;
  status: 'completed' | 'pending' | 'failed';
  createdAt: string;
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
  const [dropInPacks, setDropInPacks] = useState<DropInPlan[]>([]);
  const [packsError, setPacksError] = useState<string | null>(null);
  const [purchasingCode, setPurchasingCode] = useState<string | null>(null);

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
          priceCents: Number(pack.priceCents || 0),
          currency: String(pack.currency || 'USD').toUpperCase(),
          features: Array.isArray(pack.features) ? pack.features : [],
          popular: Boolean(pack.popular),
        }))
      );
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
          type: m.type,
          last4: m.last_four,
          brand: m.brand,
          phone: m.phone_number,
          provider: m.provider,
          isDefault: m.is_default,
        })));
      }

      // Load wallet balance
      const { data: walletData } = await supabase
        .from('wallet_balances')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (walletData) {
        setWallet({
          available: walletData.available_balance || 0,
          pending: walletData.pending_balance || 0,
          currency: walletData.currency || 'USD',
        });
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
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (txs) {
        setTransactions(txs.map((t: any) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          description: t.description,
          status: t.status,
          createdAt: t.created_at,
        })));
      }
    } catch (err) {
      console.error('Failed to load billing data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const purchaseCredits = async (pack: DropInPlan) => {
    try {
      setPurchasingCode(pack.code);
      const response = await fetch('/api/attendee/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode: pack.code }),
      });
      const data = await response.json();

      if (!response.ok || !data?.checkoutUrl) {
        throw new Error(data?.error || 'Unable to start checkout');
      }

      toast.success('Redirecting...', `Starting ${pack.name} checkout`);
      window.location.href = data.checkoutUrl;
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
        <h2 className="text-lg font-semibold text-foreground mb-4">Buy Drop-in Packs</h2>
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
                onClick={() => purchaseCredits(pack)}
              >
                {purchasingCode === pack.code ? 'Redirecting...' : 'Buy Now'}
              </Button>
            </div>
            ))}
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
                      {tx.type === 'refund' ? '-' : ''}{formatCurrency(tx.amount)}
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
