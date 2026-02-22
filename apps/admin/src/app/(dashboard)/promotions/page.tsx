'use client';

import { Loader2, Plus, Tag } from 'lucide-react';
import { useEffect, useState } from 'react';

type ProductScope = 'creator_subscription' | 'vault_subscription' | 'drop_in_credits';
type DiscountType = 'fixed' | 'percent';

interface PromoCode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  product_scope: ProductScope;
  discount_type: DiscountType;
  discount_value: number;
  currency: string | null;
  target_plan_code: string | null;
  target_storage_plan_slug: string | null;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  max_redemptions: number | null;
  max_redemptions_per_user: number | null;
  times_redeemed: number;
  created_at: string;
}

const scopeLabels: Record<ProductScope, string> = {
  creator_subscription: 'Creator Subscription',
  vault_subscription: 'Vault Subscription',
  drop_in_credits: 'Drop-In Credits',
};

export default function PromotionsPage() {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    product_scope: 'creator_subscription' as ProductScope,
    discount_type: 'percent' as DiscountType,
    discount_value: 10,
    currency: 'USD',
    target_plan_code: '',
    target_storage_plan_slug: '',
    starts_at: '',
    expires_at: '',
    max_redemptions: '',
    max_redemptions_per_user: '',
  });

  const fetchPromoCodes = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/promotions/codes');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'Failed to load promo codes');
        setPromoCodes([]);
      } else {
        setPromoCodes(payload.promoCodes || []);
        setError(null);
      }
    } catch (fetchError) {
      console.error('Fetch promo codes failed:', fetchError);
      setError('Network error while loading promo codes');
      setPromoCodes([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPromoCodes();
  }, []);

  const createPromoCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsCreating(true);
    try {
      const payload = {
        ...formData,
        discount_value: Number(formData.discount_value),
        currency: formData.discount_type === 'fixed' ? formData.currency : null,
        target_plan_code: formData.target_plan_code || null,
        target_storage_plan_slug: formData.target_storage_plan_slug || null,
        starts_at: formData.starts_at || null,
        expires_at: formData.expires_at || null,
        max_redemptions: formData.max_redemptions ? Number(formData.max_redemptions) : null,
        max_redemptions_per_user: formData.max_redemptions_per_user
          ? Number(formData.max_redemptions_per_user)
          : null,
      };

      const response = await fetch('/api/admin/promotions/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(responsePayload.error || 'Failed to create promo code');
        return;
      }

      setFormData({
        code: '',
        name: '',
        description: '',
        product_scope: 'creator_subscription',
        discount_type: 'percent',
        discount_value: 10,
        currency: 'USD',
        target_plan_code: '',
        target_storage_plan_slug: '',
        starts_at: '',
        expires_at: '',
        max_redemptions: '',
        max_redemptions_per_user: '',
      });
      await fetchPromoCodes();
    } catch (createError) {
      console.error('Create promo code failed:', createError);
      setError('Network error while creating promo code');
    } finally {
      setIsCreating(false);
    }
  };

  const togglePromoCode = async (promoCode: PromoCode) => {
    setError(null);
    try {
      const response = await fetch(`/api/admin/promotions/codes/${promoCode.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !promoCode.is_active }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'Failed to update promo code');
        return;
      }
      await fetchPromoCodes();
    } catch (toggleError) {
      console.error('Toggle promo code failed:', toggleError);
      setError('Network error while updating promo code');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Promotions</h1>
          <p className="text-muted-foreground mt-1">
            Create promo codes for creator plans, vault plans, and drop-in credits.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Create Promo Code</h2>
        <form onSubmit={createPromoCode} className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-foreground">Code</label>
            <input
              value={formData.code}
              onChange={(event) => setFormData((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
              required
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
              placeholder="WELCOME10"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Name</label>
            <input
              value={formData.name}
              onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
              required
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
              placeholder="Welcome Discount"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Scope</label>
            <select
              value={formData.product_scope}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, product_scope: event.target.value as ProductScope }))
              }
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
            >
              <option value="creator_subscription">Creator Subscription</option>
              <option value="vault_subscription">Vault Subscription</option>
              <option value="drop_in_credits">Drop-In Credits</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Discount Type</label>
            <select
              value={formData.discount_type}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, discount_type: event.target.value as DiscountType }))
              }
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed (minor currency unit)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">
              Discount Value {formData.discount_type === 'percent' ? '(%)' : '(cents)'}
            </label>
            <input
              type="number"
              min={1}
              value={formData.discount_value}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, discount_value: Number(event.target.value) || 1 }))
              }
              required
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Currency (fixed only)</label>
            <input
              value={formData.currency}
              onChange={(event) => setFormData((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
              placeholder="USD"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Target Creator Plan Code (optional)</label>
            <input
              value={formData.target_plan_code}
              onChange={(event) => setFormData((prev) => ({ ...prev, target_plan_code: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
              placeholder="starter"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Target Vault Plan Slug (optional)</label>
            <input
              value={formData.target_storage_plan_slug}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, target_storage_plan_slug: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
              placeholder="basic"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Starts At (optional)</label>
            <input
              type="datetime-local"
              value={formData.starts_at}
              onChange={(event) => setFormData((prev) => ({ ...prev, starts_at: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Expires At (optional)</label>
            <input
              type="datetime-local"
              value={formData.expires_at}
              onChange={(event) => setFormData((prev) => ({ ...prev, expires_at: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Max Redemptions (optional)</label>
            <input
              type="number"
              min={1}
              value={formData.max_redemptions}
              onChange={(event) => setFormData((prev) => ({ ...prev, max_redemptions: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Max Per User (optional)</label>
            <input
              type="number"
              min={1}
              value={formData.max_redemptions_per_user}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, max_redemptions_per_user: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-foreground">Description (optional)</label>
            <textarea
              value={formData.description}
              onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
              rows={2}
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isCreating}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create Promo Code
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Promo Codes</h2>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : promoCodes.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Tag className="h-8 w-8 mx-auto mb-3" />
            No promo codes yet.
          </div>
        ) : (
          <div className="space-y-3">
            {promoCodes.map((promoCode) => (
              <div key={promoCode.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{promoCode.code}</p>
                    <p className="text-sm text-muted-foreground">
                      {promoCode.name} • {scopeLabels[promoCode.product_scope]} •{' '}
                      {promoCode.discount_type === 'percent'
                        ? `${promoCode.discount_value}%`
                        : `${promoCode.discount_value} ${promoCode.currency || ''}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Redeemed: {promoCode.times_redeemed}
                      {promoCode.max_redemptions ? ` / ${promoCode.max_redemptions}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => togglePromoCode(promoCode)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      promoCode.is_active
                        ? 'bg-green-500/10 text-green-600 hover:bg-green-500/20'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {promoCode.is_active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
