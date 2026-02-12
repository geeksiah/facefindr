'use client';

import {
  CreditCard,
  Wallet,
  ExternalLink,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  Loader2,
  Building2,
  Globe,
  Smartphone,
} from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast, useConfirm } from '@/components/ui/toast';

import { PayoutPreferences } from './payout-preferences';

interface WalletData {
  id: string;
  provider: 'stripe' | 'flutterwave' | 'paypal';
  status: 'pending' | 'active' | 'restricted';
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  country_code: string;
  preferred_currency: string;
  dashboardUrl?: string;
  providerDetails?: {
    requirements?: {
      currently_due?: string[];
      eventually_due?: string[];
    };
  };
}

interface BalanceData {
  wallet_id: string;
  total_earnings: number;
  total_paid_out: number;
  available_balance: number;
  pending_payout: number;
  currency: string;
}

const PROVIDER_INFO = {
  stripe: {
    name: 'Stripe',
    description: 'Accept card payments worldwide',
    icon: CreditCard,
    color: 'bg-indigo-500',
  },
  flutterwave: {
    name: 'Flutterwave',
    description: 'Mobile money & cards in Africa',
    icon: Globe,
    color: 'bg-orange-500',
  },
  paypal: {
    name: 'PayPal',
    description: 'PayPal balance & card payments',
    icon: Wallet,
    color: 'bg-blue-500',
  },
  momo: {
    name: 'Mobile Money',
    description: 'Receive payouts to your mobile wallet (no business registration)',
    icon: Smartphone,
    color: 'bg-yellow-500',
  },
};

export function WalletSettings() {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [balances, setBalances] = useState<BalanceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState<string | null>(null);
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [newWalletProvider, setNewWalletProvider] = useState<'stripe' | 'flutterwave' | 'paypal' | 'momo' | null>(null);
  const [formData, setFormData] = useState({
    country: 'GH',
    businessName: '',
    accountBank: '',
    accountNumber: '',
    paypalEmail: '',
    momoNetwork: 'MTN',
    momoNumber: '',
  });
  
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    fetchWallets();
  }, []);

  const fetchWallets = async () => {
    try {
      const response = await fetch('/api/wallet');
      const data = await response.json();
      
      if (response.ok) {
        setWallets(data.wallets || []);
        setBalances(data.balances || []);
      }
    } catch (error) {
      console.error('Failed to fetch wallets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOnboard = async (provider: 'stripe' | 'flutterwave' | 'paypal' | 'momo') => {
    setOnboarding(provider);

    try {
      const response = await fetch('/api/wallet/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          country: formData.country,
          businessName: formData.businessName,
          accountBank: formData.accountBank,
          accountNumber: formData.accountNumber,
          paypalEmail: formData.paypalEmail,
          momoNetwork: formData.momoNetwork,
          momoNumber: formData.momoNumber,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create wallet');
      }

      // If there's an onboarding URL (Stripe), redirect to it
      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      } else {
        // Refresh wallets
        await fetchWallets();
        setShowAddWallet(false);
        setNewWalletProvider(null);
        toast.success('Payment method added', 'You can now receive payments');
      }
    } catch (error) {
      console.error('Onboarding error:', error);
      toast.error('Failed to add payment method', error instanceof Error ? error.message : 'Please try again');
    } finally {
      setOnboarding(null);
    }
  };

  const handleDeleteWallet = async (walletId: string) => {
    const confirmed = await confirm({
      title: 'Remove payment method?',
      message: 'This will disconnect this payment method from your account. You can add it again later.',
      confirmLabel: 'Remove',
      cancelLabel: 'Keep',
      variant: 'destructive',
    });

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/wallet?id=${walletId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchWallets();
        toast.success('Payment method removed');
      } else {
        const data = await response.json();
        toast.error('Failed to remove', data.error || 'Please try again');
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to remove', 'An unexpected error occurred');
    }
  };

  const getBalanceForWallet = (walletId: string): BalanceData | undefined => {
    return balances.find((b) => b.wallet_id === walletId);
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount / 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Existing Wallets */}
      {wallets.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Payment Methods</h3>
          
          {wallets.map((wallet) => {
            const info = PROVIDER_INFO[wallet.provider];
            const Icon = info.icon;
            const balance = getBalanceForWallet(wallet.id);

            return (
              <div
                key={wallet.id}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`rounded-lg ${info.color} p-2.5`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-foreground">{info.name}</h4>
                        {wallet.status === 'active' ? (
                          <span className="flex items-center gap-1 text-xs text-success">
                            <CheckCircle className="h-3 w-3" />
                            Active
                          </span>
                        ) : wallet.status === 'pending' ? (
                          <span className="flex items-center gap-1 text-xs text-warning">
                            <AlertCircle className="h-3 w-3" />
                            Setup Required
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-destructive">
                            <AlertCircle className="h-3 w-3" />
                            Restricted
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-secondary">{info.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {wallet.dashboardUrl && (
                      <Button
                        variant="secondary"
                        size="sm"
                        asChild
                      >
                        <a href={wallet.dashboardUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Dashboard
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteWallet(wallet.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {/* Balance */}
                {balance && (
                  <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-secondary">Available</p>
                      <p className="text-lg font-semibold text-foreground">
                        {formatCurrency(balance.available_balance, balance.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-secondary">Total Earnings</p>
                      <p className="text-lg font-semibold text-foreground">
                        {formatCurrency(balance.total_earnings, balance.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-secondary">Paid Out</p>
                      <p className="text-lg font-semibold text-foreground">
                        {formatCurrency(balance.total_paid_out, balance.currency)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Requirements */}
                {wallet.status === 'pending' && wallet.providerDetails?.requirements?.currently_due?.length && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-sm text-warning">
                      Complete your account setup to receive payments.
                    </p>
                    {wallet.dashboardUrl && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="mt-2"
                        asChild
                      >
                        <a href={wallet.dashboardUrl} target="_blank" rel="noopener noreferrer">
                          Complete Setup
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add New Wallet */}
      {!showAddWallet ? (
        <Button
          variant="secondary"
          onClick={() => setShowAddWallet(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Payment Method
        </Button>
      ) : (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-lg font-semibold text-foreground mb-4">Add Payment Method</h3>

          {!newWalletProvider ? (
            <div className="grid gap-3">
              {(Object.keys(PROVIDER_INFO) as Array<keyof typeof PROVIDER_INFO>).map((provider) => {
                const info = PROVIDER_INFO[provider];
                const Icon = info.icon;
                const alreadyExists = wallets.some((w) => w.provider === provider);

                return (
                  <button
                    key={provider}
                    onClick={() => !alreadyExists && setNewWalletProvider(provider)}
                    disabled={alreadyExists}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
                      alreadyExists
                        ? 'border-border bg-muted opacity-50 cursor-not-allowed'
                        : 'border-border hover:border-accent hover:bg-accent/5 cursor-pointer'
                    }`}
                  >
                    <div className={`rounded-lg ${info.color} p-2.5`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-foreground">{info.name}</h4>
                      <p className="text-sm text-secondary">{info.description}</p>
                    </div>
                    {alreadyExists && (
                      <span className="text-xs text-secondary">Already added</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                {(() => {
                  const info = PROVIDER_INFO[newWalletProvider];
                  const Icon = info.icon;
                  return (
                    <>
                      <div className={`rounded-lg ${info.color} p-2`}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <span className="font-semibold text-foreground">{info.name}</span>
                    </>
                  );
                })()}
              </div>

              {/* Common fields */}
              <div className="grid gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">
                    Country
                  </label>
                  <select
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm"
                  >
                    <option value="US">United States</option>
                    <option value="GB">United Kingdom</option>
                    <option value="CA">Canada</option>
                    <option value="AU">Australia</option>
                    <option value="GH">Ghana</option>
                    <option value="NG">Nigeria</option>
                    <option value="KE">Kenya</option>
                    <option value="ZA">South Africa</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">
                    Business Name (Optional)
                  </label>
                  <Input
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    placeholder="Your photography business"
                  />
                </div>

                {/* Flutterwave specific fields */}
                {newWalletProvider === 'flutterwave' && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">
                        Bank Code
                      </label>
                      <Input
                        value={formData.accountBank}
                        onChange={(e) => setFormData({ ...formData, accountBank: e.target.value })}
                        placeholder="e.g., 044 for Access Bank"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">
                        Account Number
                      </label>
                      <Input
                        value={formData.accountNumber}
                        onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                        placeholder="Your bank account number"
                        required
                      />
                    </div>
                  </>
                )}

                {/* PayPal specific fields */}
                {newWalletProvider === 'paypal' && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">
                      PayPal Email
                    </label>
                    <Input
                      type="email"
                      value={formData.paypalEmail}
                      onChange={(e) => setFormData({ ...formData, paypalEmail: e.target.value })}
                      placeholder="your@email.com"
                      required
                    />
                  </div>
                )}

                {/* Mobile Money specific fields */}
                {newWalletProvider === 'momo' && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">
                        Mobile Network
                      </label>
                      <select
                        value={formData.momoNetwork}
                        onChange={(e) => setFormData({ ...formData, momoNetwork: e.target.value })}
                        className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm"
                      >
                        <option value="MTN">MTN Mobile Money</option>
                        <option value="VODAFONE">Vodafone Cash</option>
                        <option value="AIRTEL">AirtelTigo Money</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">
                        Mobile Number
                      </label>
                      <Input
                        type="tel"
                        value={formData.momoNumber}
                        onChange={(e) => setFormData({ ...formData, momoNumber: e.target.value })}
                        placeholder="0241234567"
                        required
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Payouts will be sent directly to this mobile money wallet. No business registration required.
                    </p>
                  </>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setNewWalletProvider(null);
                    setShowAddWallet(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => handleOnboard(newWalletProvider)}
                  disabled={onboarding === newWalletProvider}
                >
                  {onboarding === newWalletProvider ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Building2 className="h-4 w-4 mr-2" />
                      {newWalletProvider === 'stripe' ? 'Continue to Stripe' : 'Connect'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {wallets.length === 0 && !showAddWallet && (
        <div className="text-center py-8">
          <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground">No payment methods</h3>
          <p className="text-secondary mt-1">
            Add a payment method to start receiving payments for your photos.
          </p>
        </div>
      )}

      {/* Payout Preferences - Only show if they have at least one wallet */}
      {wallets.length > 0 && (
        <div className="mt-8 pt-8 border-t border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">Payout Schedule</h3>
          <PayoutPreferences />
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog />
    </div>
  );
}
