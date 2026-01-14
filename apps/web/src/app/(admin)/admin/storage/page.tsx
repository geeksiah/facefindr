'use client';

/**
 * Admin Storage Plans Management
 * 
 * Manage storage tiers, pricing, and view analytics.
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  HardDrive, 
  Plus, 
  Edit2, 
  Trash2, 
  DollarSign, 
  Users, 
  Image as ImageIcon,
  TrendingUp,
  Check,
  X,
  Star,
  Loader2,
} from 'lucide-react';
import { toast } from '@/components/ui/toast';

interface StoragePlan {
  id: string;
  name: string;
  slug: string;
  description: string;
  storage_limit_mb: number;
  photo_limit: number;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  features: string[];
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
  activeSubscriptions?: number;
}

interface Analytics {
  overview: {
    totalRevenue: number;
    mrr: number;
    activeSubscriptions: number;
    totalUsers: number;
    usersWithPhotos: number;
    totalPhotos: number;
    totalStorageGb: string;
  };
  planMetrics: {
    planName: string;
    planSlug: string;
    monthlyCount: number;
    yearlyCount: number;
    totalRevenue: number;
    mrr: number;
  }[];
}

export default function AdminStoragePage() {
  const [plans, setPlans] = useState<StoragePlan[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<StoragePlan | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [plansRes, analyticsRes] = await Promise.all([
        fetch('/api/admin/storage/plans'),
        fetch('/api/admin/storage/analytics'),
      ]);

      if (plansRes.ok) {
        const data = await plansRes.json();
        setPlans(data.plans);
      }

      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Error loading storage data:', error);
      toast.error('Error', 'Failed to load storage data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSavePlan = async (plan: Partial<StoragePlan>) => {
    setIsSaving(true);
    try {
      const method = plan.id ? 'PUT' : 'POST';
      const response = await fetch('/api/admin/storage/plans', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: plan.id,
          name: plan.name,
          slug: plan.slug,
          description: plan.description,
          storageLimitMb: plan.storage_limit_mb,
          photoLimit: plan.photo_limit,
          priceMonthly: plan.price_monthly,
          priceYearly: plan.price_yearly,
          currency: plan.currency,
          features: plan.features,
          isPopular: plan.is_popular,
          isActive: plan.is_active,
          sortOrder: plan.sort_order,
        }),
      });

      if (response.ok) {
        toast.success('Success', plan.id ? 'Plan updated' : 'Plan created');
        loadData();
        setEditingPlan(null);
        setIsCreating(false);
      } else {
        const data = await response.json();
        toast.error('Error', data.error || 'Failed to save plan');
      }
    } catch (error) {
      toast.error('Error', 'Failed to save plan');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this plan?')) return;

    try {
      const response = await fetch(`/api/admin/storage/plans?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Success', 'Plan deactivated');
        loadData();
      } else {
        const data = await response.json();
        toast.error('Error', data.error || 'Failed to delete plan');
      }
    } catch (error) {
      toast.error('Error', 'Failed to delete plan');
    }
  };

  const formatStorage = (mb: number) => {
    if (mb === -1) return 'Unlimited';
    if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`;
    return `${mb} MB`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <HardDrive className="h-7 w-7 text-accent" />
            Storage Plans
          </h1>
          <p className="text-secondary mt-1">
            Manage storage tiers and pricing for Photo Vault
          </p>
        </div>
        <button
          onClick={() => {
            setIsCreating(true);
            setEditingPlan({
              id: '',
              name: '',
              slug: '',
              description: '',
              storage_limit_mb: 1024,
              photo_limit: 100,
              price_monthly: 4.99,
              price_yearly: 49.99,
              currency: 'USD',
              features: [],
              is_popular: false,
              is_active: true,
              sort_order: plans.length,
            });
          }}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl hover:bg-accent/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Plan
        </button>
      </div>

      {/* Analytics Overview */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <span className="text-sm text-secondary">MRR</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              ${analytics.overview.mrr.toFixed(2)}
            </p>
          </div>
          
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-accent" />
              </div>
              <span className="text-sm text-secondary">Subscribers</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {analytics.overview.activeSubscriptions}
            </p>
          </div>
          
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <ImageIcon className="h-5 w-5 text-purple-500" />
              </div>
              <span className="text-sm text-secondary">Total Photos</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {analytics.overview.totalPhotos.toLocaleString()}
            </p>
          </div>
          
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <HardDrive className="h-5 w-5 text-orange-500" />
              </div>
              <span className="text-sm text-secondary">Storage Used</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {analytics.overview.totalStorageGb} GB
            </p>
          </div>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-2xl border ${
              plan.is_popular ? 'border-accent ring-2 ring-accent/20' : 'border-border'
            } bg-card p-6 relative ${!plan.is_active ? 'opacity-50' : ''}`}
          >
            {plan.is_popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-accent text-white text-xs font-medium rounded-full">
                  <Star className="h-3 w-3" />
                  Popular
                </span>
              </div>
            )}

            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                <p className="text-sm text-secondary">{plan.description}</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditingPlan(plan)}
                  className="p-2 hover:bg-muted rounded-lg transition-colors"
                >
                  <Edit2 className="h-4 w-4 text-secondary" />
                </button>
                <button
                  onClick={() => handleDeletePlan(plan.id)}
                  className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </button>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground">
                  ${plan.price_monthly}
                </span>
                <span className="text-secondary">/mo</span>
              </div>
              <p className="text-sm text-secondary">
                or ${plan.price_yearly}/year
              </p>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <HardDrive className="h-4 w-4 text-accent" />
                <span>{formatStorage(plan.storage_limit_mb)} storage</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <ImageIcon className="h-4 w-4 text-accent" />
                <span>
                  {plan.photo_limit === -1 ? 'Unlimited' : plan.photo_limit} photos
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-sm text-secondary">
                {plan.activeSubscriptions || 0} active subscribers
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Edit/Create Modal */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50" 
            onClick={() => {
              setEditingPlan(null);
              setIsCreating(false);
            }}
          />
          <div className="relative bg-background rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {isCreating ? 'Create Plan' : 'Edit Plan'}
              </h2>
              <button
                onClick={() => {
                  setEditingPlan(null);
                  setIsCreating(false);
                }}
                className="p-2 hover:bg-muted rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={editingPlan.name}
                    onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Slug</label>
                  <input
                    type="text"
                    value={editingPlan.slug}
                    onChange={(e) => setEditingPlan({ ...editingPlan, slug: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                    disabled={!isCreating}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={editingPlan.description}
                  onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Storage (MB, -1 for unlimited)
                  </label>
                  <input
                    type="number"
                    value={editingPlan.storage_limit_mb}
                    onChange={(e) => setEditingPlan({ 
                      ...editingPlan, 
                      storage_limit_mb: parseInt(e.target.value) 
                    })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Photos (-1 for unlimited)
                  </label>
                  <input
                    type="number"
                    value={editingPlan.photo_limit}
                    onChange={(e) => setEditingPlan({ 
                      ...editingPlan, 
                      photo_limit: parseInt(e.target.value) 
                    })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Monthly Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingPlan.price_monthly}
                    onChange={(e) => setEditingPlan({ 
                      ...editingPlan, 
                      price_monthly: parseFloat(e.target.value) 
                    })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Yearly Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingPlan.price_yearly}
                    onChange={(e) => setEditingPlan({ 
                      ...editingPlan, 
                      price_yearly: parseFloat(e.target.value) 
                    })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Features (one per line)
                </label>
                <textarea
                  value={(editingPlan.features || []).join('\n')}
                  onChange={(e) => setEditingPlan({ 
                    ...editingPlan, 
                    features: e.target.value.split('\n').filter(f => f.trim()) 
                  })}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingPlan.is_popular}
                    onChange={(e) => setEditingPlan({ 
                      ...editingPlan, 
                      is_popular: e.target.checked 
                    })}
                    className="rounded"
                  />
                  <span className="text-sm">Popular badge</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingPlan.is_active}
                    onChange={(e) => setEditingPlan({ 
                      ...editingPlan, 
                      is_active: e.target.checked 
                    })}
                    className="rounded"
                  />
                  <span className="text-sm">Active</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <button
                  onClick={() => {
                    setEditingPlan(null);
                    setIsCreating(false);
                  }}
                  className="px-4 py-2 text-secondary hover:bg-muted rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSavePlan(editingPlan)}
                  disabled={isSaving}
                  className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
