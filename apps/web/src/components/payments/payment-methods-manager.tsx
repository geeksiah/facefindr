'use client';

/**
 * Payment Methods Manager
 * 
 * Allows users to add, manage, and select payment methods.
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  CreditCard, 
  Smartphone, 
  Trash2, 
  Plus, 
  Check, 
  Star,
  AlertCircle,
  Loader2,
  ChevronDown,
  X,
} from 'lucide-react';
import { Button, Switch } from '@/components/ui';

// ============================================
// TYPES
// ============================================

interface PaymentMethod {
  id: string;
  methodType: 'card' | 'mobile_money' | 'paypal';
  displayName: string;
  cardBrand?: string;
  cardLastFour?: string;
  cardExpMonth?: number;
  cardExpYear?: number;
  mobileMoneyProvider?: string;
  mobileMoneyName?: string;
  paypalEmail?: string;
  status: string;
  isDefault: boolean;
}

interface MobileMoneyProvider {
  providerCode: string;
  providerName: string;
  countryCode: string;
  supportsNameVerification: boolean;
}

interface PaymentMethodsManagerProps {
  onSelect?: (methodId: string) => void;
  selectable?: boolean;
  selectedId?: string;
  showAddNew?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export function PaymentMethodsManager({
  onSelect,
  selectable = false,
  selectedId,
  showAddNew = true,
}: PaymentMethodsManagerProps) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<'card' | 'mobile_money' | 'paypal' | null>(null);
  const [autoRenew, setAutoRenew] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch payment methods
  const fetchMethods = useCallback(async () => {
    try {
      const response = await fetch('/api/payment-methods');
      if (response.ok) {
        const data = await response.json();
        setMethods(data.paymentMethods || []);
        setAutoRenew(data.subscriptionSettings?.autoRenew ?? true);
      }
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMethods();
  }, [fetchMethods]);

  // Set as default
  const handleSetDefault = async (methodId: string) => {
    try {
      const response = await fetch('/api/payment-methods', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setDefault', methodId }),
      });

      if (response.ok) {
        setMethods(prev => prev.map(m => ({
          ...m,
          isDefault: m.id === methodId,
        })));
      }
    } catch (error) {
      console.error('Failed to set default:', error);
    }
  };

  // Delete method
  const handleDelete = async (methodId: string) => {
    setDeletingId(methodId);
    try {
      const response = await fetch(`/api/payment-methods?id=${methodId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setMethods(prev => prev.filter(m => m.id !== methodId));
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setDeletingId(null);
    }
  };

  // Toggle auto-renew
  const handleAutoRenewToggle = async (enabled: boolean) => {
    setAutoRenew(enabled);
    try {
      await fetch('/api/payment-methods', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateSettings',
          settings: { autoRenew: enabled },
        }),
      });
    } catch (error) {
      console.error('Failed to update auto-renew:', error);
      setAutoRenew(!enabled);
    }
  };

  // On method added
  const handleMethodAdded = (method: PaymentMethod) => {
    setMethods(prev => [method, ...prev]);
    setShowAddModal(false);
    setAddType(null);
  };

  // Get icon for method type
  const getMethodIcon = (method: PaymentMethod) => {
    switch (method.methodType) {
      case 'card':
        return <CreditCard className="h-5 w-5" />;
      case 'mobile_money':
        return <Smartphone className="h-5 w-5" />;
      case 'paypal':
        return (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z"/>
          </svg>
        );
      default:
        return <CreditCard className="h-5 w-5" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Payment Methods List */}
      <div className="space-y-3">
        {methods.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-secondary">No payment methods added yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add a payment method to enable subscriptions and purchases.
            </p>
          </div>
        ) : (
          methods.map((method) => (
            <div
              key={method.id}
              onClick={() => selectable && onSelect?.(method.id)}
              className={`
                group relative rounded-2xl border bg-card p-4 transition-all duration-200 ease-out
                ${selectable ? 'cursor-pointer hover:border-accent hover:shadow-md' : ''}
                ${selectedId === method.id ? 'border-accent ring-2 ring-accent/20' : 'border-border'}
                ${method.isDefault ? 'ring-1 ring-accent/30' : ''}
              `}
            >
              <div className="flex items-center gap-4">
                {/* Selection indicator */}
                {selectable && (
                  <div 
                    className={`
                      flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200
                      ${selectedId === method.id 
                        ? 'border-accent bg-accent scale-100' 
                        : 'border-border group-hover:border-accent/50 scale-95 group-hover:scale-100'
                      }
                    `}
                  >
                    {selectedId === method.id && (
                      <Check className="h-3 w-3 text-white animate-in zoom-in-50 duration-150" />
                    )}
                  </div>
                )}

                {/* Icon */}
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-foreground transition-transform duration-200 group-hover:scale-105">
                  {getMethodIcon(method)}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground truncate">
                      {method.displayName}
                    </p>
                    {method.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                        <Star className="h-3 w-3" />
                        Default
                      </span>
                    )}
                  </div>
                  {method.methodType === 'card' && method.cardExpMonth && (
                    <p className="text-sm text-secondary">
                      Expires {method.cardExpMonth}/{method.cardExpYear}
                    </p>
                  )}
                  {method.methodType === 'mobile_money' && method.mobileMoneyName && (
                    <p className="text-sm text-success">{method.mobileMoneyName}</p>
                  )}
                  {method.status === 'pending_verification' && (
                    <p className="text-sm text-warning flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Pending verification
                    </p>
                  )}
                </div>

                {/* Actions */}
                {!selectable && (
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {!method.isDefault && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetDefault(method.id);
                        }}
                        className="p-2 rounded-xl text-secondary hover:text-foreground hover:bg-muted transition-all duration-200 hover:scale-105"
                        title="Set as default"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(method.id);
                      }}
                      disabled={deletingId === method.id}
                      className="p-2 rounded-xl text-secondary hover:text-destructive hover:bg-destructive/10 transition-all duration-200 hover:scale-105 disabled:opacity-50"
                      title="Remove"
                    >
                      {deletingId === method.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add New Button */}
      {showAddNew && (
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-4 text-secondary hover:border-accent hover:text-accent transition-all duration-200 hover:scale-[1.01]"
        >
          <Plus className="h-5 w-5" />
          <span className="font-medium">Add Payment Method</span>
        </button>
      )}

      {/* Auto-Renew Toggle */}
      {!selectable && methods.length > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
          <div>
            <p className="font-medium text-foreground">Auto-Renew Subscription</p>
            <p className="text-sm text-secondary">
              Automatically renew your subscription using your default payment method
            </p>
          </div>
          <Switch
            checked={autoRenew}
            onChange={handleAutoRenewToggle}
          />
        </div>
      )}

      {/* Add Payment Method Modal */}
      {showAddModal && (
        <AddPaymentMethodModal
          onClose={() => {
            setShowAddModal(false);
            setAddType(null);
          }}
          onAdd={handleMethodAdded}
          initialType={addType}
        />
      )}
    </div>
  );
}

// ============================================
// ADD PAYMENT METHOD MODAL
// ============================================

interface AddPaymentMethodModalProps {
  onClose: () => void;
  onAdd: (method: PaymentMethod) => void;
  initialType?: 'card' | 'mobile_money' | 'paypal' | null;
}

function AddPaymentMethodModal({ onClose, onAdd, initialType }: AddPaymentMethodModalProps) {
  const [step, setStep] = useState<'select' | 'form'>(initialType ? 'form' : 'select');
  const [type, setType] = useState<'card' | 'mobile_money' | 'paypal' | null>(initialType);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mobile money form state
  const [providers, setProviders] = useState<MobileMoneyProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('GH');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Country options for mobile money
  const countryOptions = [
    { code: 'GH', name: 'Ghana' },
    { code: 'NG', name: 'Nigeria' },
    { code: 'KE', name: 'Kenya' },
    { code: 'UG', name: 'Uganda' },
    { code: 'TZ', name: 'Tanzania' },
    { code: 'ZA', name: 'South Africa' },
    { code: 'RW', name: 'Rwanda' },
    { code: 'ZM', name: 'Zambia' },
    { code: 'CM', name: 'Cameroon' },
    { code: 'SN', name: 'Senegal' },
    { code: 'CI', name: 'Côte d\'Ivoire' },
  ];

  // Fetch mobile money providers
  useEffect(() => {
    if (type === 'mobile_money') {
      setLoadingProviders(true);
      fetch(`/api/payment-methods?type=providers&country=${selectedCountry}`)
        .then(res => res.json())
        .then(data => {
          const fetchedProviders = data.providers || [];
          // If no providers from DB, use fallback
          if (fetchedProviders.length === 0) {
            setProviders(getFallbackProviders(selectedCountry));
          } else {
            setProviders(fetchedProviders);
          }
        })
        .catch(() => {
          setProviders(getFallbackProviders(selectedCountry));
        })
        .finally(() => setLoadingProviders(false));
    }
  }, [type, selectedCountry]);

  // Fallback providers if database isn't set up yet
  function getFallbackProviders(country: string): MobileMoneyProvider[] {
    const fallbackMap: Record<string, MobileMoneyProvider[]> = {
      GH: [
        { providerCode: 'mtn_gh', providerName: 'MTN Mobile Money', countryCode: 'GH', supportsNameVerification: true },
        { providerCode: 'vodafone_gh', providerName: 'Vodafone Cash', countryCode: 'GH', supportsNameVerification: true },
        { providerCode: 'airteltigo_gh', providerName: 'AirtelTigo Money', countryCode: 'GH', supportsNameVerification: true },
      ],
      NG: [
        { providerCode: 'opay_ng', providerName: 'OPay', countryCode: 'NG', supportsNameVerification: false },
        { providerCode: 'palmpay_ng', providerName: 'PalmPay', countryCode: 'NG', supportsNameVerification: false },
        { providerCode: 'paga_ng', providerName: 'Paga', countryCode: 'NG', supportsNameVerification: false },
      ],
      KE: [
        { providerCode: 'mpesa_ke', providerName: 'M-Pesa', countryCode: 'KE', supportsNameVerification: true },
        { providerCode: 'airtel_ke', providerName: 'Airtel Money', countryCode: 'KE', supportsNameVerification: false },
      ],
      UG: [
        { providerCode: 'mtn_ug', providerName: 'MTN Mobile Money', countryCode: 'UG', supportsNameVerification: true },
        { providerCode: 'airtel_ug', providerName: 'Airtel Money', countryCode: 'UG', supportsNameVerification: false },
      ],
      TZ: [
        { providerCode: 'mpesa_tz', providerName: 'M-Pesa', countryCode: 'TZ', supportsNameVerification: true },
        { providerCode: 'tigopesa_tz', providerName: 'Tigo Pesa', countryCode: 'TZ', supportsNameVerification: false },
      ],
    };
    return fallbackMap[country] || [];
  }

  const handleSelectType = (selectedType: 'card' | 'mobile_money' | 'paypal') => {
    setType(selectedType);
    setStep('form');
    setError(null);
    setVerifiedName(null);
    setVerificationError(null);
  };

  // Verify mobile money account
  const handleVerifyAccount = async () => {
    if (!selectedProvider || !phoneNumber) {
      setVerificationError('Please select a provider and enter phone number');
      return;
    }

    setIsVerifying(true);
    setVerificationError(null);
    setVerifiedName(null);

    try {
      const response = await fetch('/api/payment-methods/verify-momo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          providerCode: selectedProvider,
          countryCode: selectedCountry,
        }),
      });

      const data = await response.json();

      if (data.success && data.verified && data.accountName) {
        setVerifiedName(data.accountName);
      } else if (data.success && !data.verified) {
        setVerificationError('Account verification not available for this provider. You can still add the account.');
      } else {
        setVerificationError(data.error || 'Could not verify account');
      }
    } catch {
      setVerificationError('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setIsLoading(true);

    try {
      if (type === 'mobile_money') {
        if (!selectedProvider || !phoneNumber) {
          setError('Please fill in all fields');
          return;
        }

        const response = await fetch('/api/payment-methods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'mobile_money',
            providerCode: selectedProvider,
            phoneNumber,
            accountName: verifiedName, // Include verified name
            setAsDefault: true,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error);
          return;
        }

        onAdd(data.paymentMethod);
      }

      if (type === 'paypal') {
        // Redirect to PayPal OAuth flow
        window.location.href = '/api/payment-methods/connect-paypal';
        return;
      }

      if (type === 'card') {
        // For cards, we'd use Stripe Elements
        // This would open Stripe's payment element
        window.location.href = '/api/payment-methods/setup-card';
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md bg-card rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">
            {step === 'select' ? 'Add Payment Method' : `Add ${type === 'card' ? 'Card' : type === 'mobile_money' ? 'Mobile Money' : 'PayPal'}`}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-secondary hover:text-foreground hover:bg-muted transition-all duration-200 hover:scale-105"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'select' ? (
            <div className="space-y-3">
              <button
                onClick={() => handleSelectType('card')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-border hover:border-accent hover:bg-muted/50 transition-all duration-200 hover:scale-[1.01]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-foreground">Credit or Debit Card</p>
                  <p className="text-sm text-secondary">Visa, Mastercard, American Express</p>
                </div>
              </button>

              <button
                onClick={() => handleSelectType('mobile_money')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-border hover:border-accent hover:bg-muted/50 transition-all duration-200 hover:scale-[1.01]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-500/10 text-yellow-600">
                  <Smartphone className="h-6 w-6" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-foreground">Mobile Money</p>
                  <p className="text-sm text-secondary">MTN MoMo, Vodafone Cash, AirtelTigo</p>
                </div>
              </button>

              <button
                onClick={() => handleSelectType('paypal')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-border hover:border-accent hover:bg-muted/50 transition-all duration-200 hover:scale-[1.01]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z"/>
                  </svg>
                </div>
                <div className="text-left">
                  <p className="font-medium text-foreground">PayPal</p>
                  <p className="text-sm text-secondary">Pay with your PayPal account</p>
                </div>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Back button */}
              <button
                onClick={() => {
                  setStep('select');
                  setType(null);
                  setError(null);
                }}
                className="text-sm text-accent hover:underline"
              >
                Choose different method
              </button>

              {/* Mobile Money Form */}
              {type === 'mobile_money' && (
                <div className="space-y-4">
                  {/* Country Selection */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Country
                    </label>
                    <div className="relative">
                      <select
                        value={selectedCountry}
                        onChange={(e) => {
                          setSelectedCountry(e.target.value);
                          setSelectedProvider('');
                        }}
                        className="w-full appearance-none rounded-xl border border-border bg-background px-4 py-3 pr-10 text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all duration-200"
                      >
                        {countryOptions.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-secondary pointer-events-none" />
                    </div>
                  </div>

                  {/* Provider Selection */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Provider
                    </label>
                    <div className="relative">
                      <select
                        value={selectedProvider}
                        onChange={(e) => setSelectedProvider(e.target.value)}
                        disabled={loadingProviders}
                        className="w-full appearance-none rounded-xl border border-border bg-background px-4 py-3 pr-10 text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all duration-200 disabled:opacity-50"
                      >
                        <option value="">
                          {loadingProviders ? 'Loading...' : 'Select provider'}
                        </option>
                        {providers.map((p) => (
                          <option key={p.providerCode} value={p.providerCode}>
                            {p.providerName}
                          </option>
                        ))}
                      </select>
                      {loadingProviders ? (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-secondary pointer-events-none animate-spin" />
                      ) : (
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-secondary pointer-events-none" />
                      )}
                    </div>
                    {providers.length === 0 && !loadingProviders && (
                      <p className="text-sm text-secondary mt-2">
                        No providers available for this country yet.
                      </p>
                    )}
                  </div>

                  {/* Phone Number with Verify Button */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Phone Number
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => {
                          setPhoneNumber(e.target.value);
                          setVerifiedName(null);
                          setVerificationError(null);
                        }}
                        placeholder="0XX XXX XXXX"
                        className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all duration-200"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyAccount}
                        disabled={isVerifying || !selectedProvider || !phoneNumber || phoneNumber.length < 9}
                        className="px-4 py-3 rounded-xl bg-accent/10 text-accent font-medium hover:bg-accent/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isVerifying ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Verify
                      </button>
                    </div>
                    <p className="text-xs text-secondary mt-1.5">
                      Click Verify to confirm account holder name
                    </p>
                  </div>

                  {/* Verified Name Display */}
                  {verifiedName && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-success/10 border border-success/20 animate-in slide-in-from-top-2 duration-200">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/20">
                        <Check className="h-5 w-5 text-success" />
                      </div>
                      <div>
                        <p className="text-sm text-secondary">Account Holder</p>
                        <p className="font-semibold text-foreground">{verifiedName}</p>
                      </div>
                    </div>
                  )}

                  {/* Verification Error/Warning */}
                  {verificationError && !verifiedName && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20 text-sm animate-in slide-in-from-top-2 duration-200">
                      <AlertCircle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                      <span className="text-foreground">{verificationError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* PayPal Form */}
              {type === 'paypal' && (
                <div className="text-center py-4">
                  <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600 mb-4">
                    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z"/>
                    </svg>
                  </div>
                  <p className="text-secondary mb-2">
                    Connect your PayPal account securely.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    You will be redirected to PayPal to authorize.
                  </p>
                </div>
              )}

              {/* Card Form */}
              {type === 'card' && (
                <p className="text-secondary text-center py-8">
                  You will be redirected to securely add your card.
                </p>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm animate-in slide-in-from-top-2 duration-200">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  `Add ${type === 'card' ? 'Card' : type === 'mobile_money' ? 'Mobile Money' : 'PayPal'}`
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Export for use in checkout
export { AddPaymentMethodModal };
