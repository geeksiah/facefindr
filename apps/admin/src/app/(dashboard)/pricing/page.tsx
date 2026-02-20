'use client';

import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Check,
  X,
  DollarSign,
  Package,
  RefreshCw,
  Camera,
  Settings,
  AlertCircle,
  HardDrive,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

import { useToast, useConfirm } from '@/components/ui/toast';

interface Plan {
  id: string;
  name: string;
  code: string;
  description: string;
  features: string[];
  is_active: boolean;
  is_popular: boolean;
  base_price_usd: number;
  prices: Record<string, number>; // Currency code -> price in cents
  platform_fee_percent: number;
  platform_fee_fixed: number;
  platform_fee_type: 'percent' | 'fixed' | 'both';
  print_commission_percent: number;
  print_commission_fixed: number;
  print_commission_type: 'percent' | 'fixed' | 'both';
  plan_type?: 'photographer' | 'payg';
  created_at: string;
}

interface Currency {
  code: string;
  name: string;
  symbol: string;
  rate_to_usd: number;
}

interface StoragePlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
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

const defaultCurrencies: Currency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', rate_to_usd: 1 },
  { code: 'EUR', name: 'Euro', symbol: '€', rate_to_usd: 0.92 },
  { code: 'GBP', name: 'British Pound', symbol: '£', rate_to_usd: 0.79 },
  { code: 'GHS', name: 'Ghana Cedi', symbol: '₵', rate_to_usd: 14.5 },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', rate_to_usd: 1550 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', rate_to_usd: 153 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', rate_to_usd: 18.5 },
];

function getPlanTypeLabel(planType: string | undefined): string {
  if (planType === 'payg') return 'Pay As You Go';
  return 'Creator';
}

// Feature Management UI Component
function FeatureManagementUI({ plans }: { plans: Plan[] }) {
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [availableFeatures, setAvailableFeatures] = useState<any[]>([]);
  const [assignedFeatures, setAssignedFeatures] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreateFeatureModal, setShowCreateFeatureModal] = useState(false);
  const [newFeature, setNewFeature] = useState({
    code: '',
    name: '',
    description: '',
    feature_type: 'boolean' as 'boolean' | 'numeric' | 'limit' | 'text',
    default_value: '',
    category: 'general',
    applicable_to: ['photographer', 'payg'] as string[],
  });
  const [isCreatingFeature, setIsCreatingFeature] = useState(false);

  useEffect(() => {
    if (selectedPlanId) {
      loadPlanFeatures(selectedPlanId);
    }
  }, [selectedPlanId]);

  async function loadPlanFeatures(planId: string) {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/pricing/plans/${planId}/features`);
      if (res.ok) {
        const data = await res.json();
        setAvailableFeatures(data.availableFeatures || []);
        
        // Convert assigned features to a map for easier access
        const assignedMap: Record<string, any> = {};
        (data.assignedFeatures || []).forEach((af: any) => {
          assignedMap[af.feature_code] = af.feature_value;
        });
        setAssignedFeatures(assignedMap);
      }
    } catch (err) {
      console.error('Failed to load plan features:', err);
      toast.error('Failed to load features');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveFeatures() {
    if (!selectedPlanId) return;

    setIsSaving(true);
    try {
      const features = Object.entries(assignedFeatures).map(([featureCode, value]) => {
        const feature = availableFeatures.find(f => f.code === featureCode);
        if (!feature) return null;
        
        return {
          feature_id: feature.id,
          feature_value: value,
        };
      }).filter(Boolean);

      const res = await fetch(`/api/admin/pricing/plans/${selectedPlanId}/features`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features }),
      });

      if (res.ok) {
        toast.success('Features Saved', 'Plan features have been updated successfully.');
        loadPlanFeatures(selectedPlanId);
      } else {
        const error = await res.json();
        toast.error('Save Failed', error.error || 'Failed to save features');
      }
    } catch (err) {
      console.error('Failed to save features:', err);
      toast.error('Save Failed', 'An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateFeature() {
    if (!newFeature.code || !newFeature.name) {
      toast.error('Validation Error', 'Code and name are required');
      return;
    }

    setIsCreatingFeature(true);
    try {
      let defaultValue: any = newFeature.default_value;
      if (newFeature.feature_type === 'boolean') {
        defaultValue = newFeature.default_value === 'true';
      } else if (newFeature.feature_type === 'numeric' || newFeature.feature_type === 'limit') {
        defaultValue = parseFloat(newFeature.default_value) || 0;
      }

      const res = await fetch('/api/admin/pricing/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newFeature,
          default_value: defaultValue,
        }),
      });

      if (res.ok) {
        toast.success('Feature Created', `${newFeature.name} has been created successfully.`);
        setShowCreateFeatureModal(false);
        setNewFeature({
          code: '',
          name: '',
          description: '',
          feature_type: 'boolean',
          default_value: '',
          category: 'general',
          applicable_to: ['photographer', 'payg'],
        });
        if (selectedPlanId) {
          loadPlanFeatures(selectedPlanId);
        }
      } else {
        const error = await res.json();
        toast.error('Creation Failed', error.error || 'Failed to create feature');
      }
    } catch (err) {
      console.error('Failed to create feature:', err);
      toast.error('Creation Failed', 'An unexpected error occurred');
    } finally {
      setIsCreatingFeature(false);
    }
  }

  async function handleDeleteFeature(featureId: string, featureName: string) {
    const confirmed = await confirm({
      title: 'Delete Feature',
      message: `Are you sure you want to delete "${featureName}"? This will remove it from all plans.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/pricing/features/${featureId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Feature Deleted', `${featureName} has been deleted.`);
        if (selectedPlanId) {
          loadPlanFeatures(selectedPlanId);
        }
      } else {
        const error = await res.json();
        toast.error('Delete Failed', error.error || 'Failed to delete feature');
      }
    } catch (err) {
      console.error('Failed to delete feature:', err);
      toast.error('Delete Failed', 'An unexpected error occurred');
    }
  }

  function handleFeatureToggle(featureCode: string, feature: any) {
    if (assignedFeatures[featureCode] !== undefined) {
      // Remove feature
      const newAssigned = { ...assignedFeatures };
      delete newAssigned[featureCode];
      setAssignedFeatures(newAssigned);
    } else {
      // Add feature with default value
      setAssignedFeatures({
        ...assignedFeatures,
        [featureCode]: feature.default_value || getDefaultValueForType(feature.feature_type),
      });
    }
  }

  function handleFeatureValueChange(featureCode: string, value: any) {
    setAssignedFeatures({
      ...assignedFeatures,
      [featureCode]: value,
    });
  }

  function getDefaultValueForType(featureType: string): any {
    switch (featureType) {
      case 'boolean':
        return false;
      case 'numeric':
      case 'limit':
        return 0;
      case 'text':
        return '';
      default:
        return null;
    }
  }

  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const planType = selectedPlan?.plan_type || 'photographer';

  // Group features by category
  const featuresByCategory = availableFeatures.reduce((acc, feature) => {
    const category = feature.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(feature);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-6">
      <ConfirmDialog />
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Plan Features</h2>
          <p className="text-sm text-muted-foreground">
            Assign features to plans. Select a plan to manage its features.
          </p>
        </div>
        <button
          onClick={() => setShowCreateFeatureModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Feature
        </button>
      </div>

      {/* How Features Work - Documentation */}
      <div className="rounded-xl border border-border bg-gradient-to-r from-accent/5 to-transparent p-6">
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-accent" />
          How Plan Features Work
        </h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="space-y-1">
            <p className="font-medium text-foreground">1. Create Features</p>
            <p className="text-muted-foreground">
              Define reusable features like &quot;Max Events&quot;, &quot;Storage GB&quot;, or &quot;Face Recognition&quot;.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">2. Set Feature Type</p>
            <p className="text-muted-foreground">
              <strong>Boolean:</strong> On/Off toggle<br/>
              <strong>Limit:</strong> Number with -1 for unlimited<br/>
              <strong>Numeric:</strong> Decimal values
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">3. Assign to Plans</p>
            <p className="text-muted-foreground">
              Select a plan below and check which features it includes, setting specific values.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">4. Enforcement</p>
            <p className="text-muted-foreground">
              Features are enforced in real-time. Users see limits on billing page and are blocked when exceeded.
            </p>
          </div>
        </div>
        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            <strong>Tip:</strong> Use -1 for unlimited limits. Features are applied by plan type (Creator or Pay As You Go).
          </p>
        </div>
      </div>

      {/* Plan Selector */}
      <div className="rounded-xl border border-border bg-card p-4">
        <label className="block text-sm font-medium text-foreground mb-2">
          Select Plan
        </label>
        <select
          value={selectedPlanId || ''}
          onChange={(e) => setSelectedPlanId(e.target.value || null)}
          className="w-full px-4 py-2 rounded-lg bg-background border border-input text-foreground"
        >
          <option value="">-- Select a plan --</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} ({getPlanTypeLabel(plan.plan_type)})
            </option>
          ))}
        </select>
      </div>

      {selectedPlanId && (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Available Features - Grouped by Category */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-md font-semibold text-foreground mb-4">
                  Available Features ({getPlanTypeLabel(planType)} Plans)
                </h3>
                
                {availableFeatures.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      No features available for this plan type.
                    </p>
                    <button
                      onClick={() => setShowCreateFeatureModal(true)}
                      className="mt-4 text-sm text-primary hover:underline"
                    >
                      Create your first feature
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(featuresByCategory).map(([category, features]) => (
                      <div key={category}>
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          {category.replace(/_/g, ' ')}
                        </h4>
                        <div className="space-y-3">
                          {(features as any[]).map((feature: any) => {
                            const isAssigned = assignedFeatures[feature.code] !== undefined;
                            const currentValue = assignedFeatures[feature.code];

                            return (
                              <div
                                key={feature.id}
                                className={`flex items-start gap-4 p-4 rounded-lg border bg-background transition-colors ${
                                  isAssigned ? 'border-primary/50 bg-primary/5' : 'border-border'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isAssigned}
                                  onChange={() => handleFeatureToggle(feature.code, feature)}
                                  className="mt-1 rounded"
                                />
                                <div className="flex-1">
                                  <div className="flex items-start justify-between mb-2">
                                    <div>
                                      <h4 className="font-medium text-foreground">{feature.name}</h4>
                                      {feature.description && (
                                        <p className="text-sm text-muted-foreground mt-1">
                                          {feature.description}
                                        </p>
                                      )}
                                      <span className="text-xs text-muted-foreground mt-1 block">
                                        Code: <code className="bg-muted px-1 rounded">{feature.code}</code> | Type: {feature.feature_type}
                                        {feature.feature_type === 'limit' && (
                                          <span className="ml-2 text-yellow-600">(Use -1 for unlimited)</span>
                                        )}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => handleDeleteFeature(feature.id, feature.name)}
                                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                      title="Delete feature"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>

                                  {isAssigned && (
                                    <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                                      {feature.feature_type === 'boolean' && (
                                        <label className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={currentValue === true}
                                            onChange={(e) => handleFeatureValueChange(feature.code, e.target.checked)}
                                            className="rounded"
                                          />
                                          <span className="text-sm text-foreground">Enabled for this plan</span>
                                        </label>
                                      )}

                                      {(feature.feature_type === 'numeric' || feature.feature_type === 'limit') && (
                                        <div>
                                          <label className="block text-sm font-medium text-foreground mb-1">
                                            {feature.feature_type === 'limit' ? 'Limit Value' : 'Numeric Value'}
                                          </label>
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="number"
                                              value={currentValue ?? 0}
                                              onChange={(e) => handleFeatureValueChange(feature.code, parseFloat(e.target.value) || 0)}
                                              step={feature.feature_type === 'limit' ? '1' : '0.01'}
                                              className="w-40 px-3 py-2 rounded-lg bg-background border border-input text-foreground"
                                            />
                                            {feature.feature_type === 'limit' && (
                                              <button
                                                onClick={() => handleFeatureValueChange(feature.code, -1)}
                                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                                  currentValue === -1
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-muted text-foreground hover:bg-muted/80'
                                                }`}
                                              >
                                                Unlimited
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      {feature.feature_type === 'text' && (
                                        <div>
                                          <label className="block text-sm font-medium text-foreground mb-1">
                                            Text Value
                                          </label>
                                          <input
                                            type="text"
                                            value={currentValue || ''}
                                            onChange={(e) => handleFeatureValueChange(feature.code, e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg bg-background border border-input text-foreground"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleSaveFeatures}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Save Features
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Feature Modal */}
      {showCreateFeatureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card">
              <h2 className="text-xl font-bold text-foreground">Create New Feature</h2>
              <button
                onClick={() => setShowCreateFeatureModal(false)}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Feature Code</label>
                <input
                  type="text"
                  value={newFeature.code}
                  onChange={(e) => setNewFeature({ ...newFeature, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  placeholder="e.g., max_active_events"
                  className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">Unique identifier (snake_case)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Feature Name</label>
                <input
                  type="text"
                  value={newFeature.name}
                  onChange={(e) => setNewFeature({ ...newFeature, name: e.target.value })}
                  placeholder="e.g., Max Active Events"
                  className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Description</label>
                <textarea
                  value={newFeature.description}
                  onChange={(e) => setNewFeature({ ...newFeature, description: e.target.value })}
                  placeholder="Describe what this feature controls..."
                  rows={2}
                  className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Feature Type</label>
                  <select
                    value={newFeature.feature_type}
                    onChange={(e) => setNewFeature({ ...newFeature, feature_type: e.target.value as any })}
                    className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  >
                    <option value="boolean">Boolean (On/Off)</option>
                    <option value="limit">Limit (Integer, -1 = unlimited)</option>
                    <option value="numeric">Numeric (Decimal)</option>
                    <option value="text">Text</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Category</label>
                  <select
                    value={newFeature.category}
                    onChange={(e) => setNewFeature({ ...newFeature, category: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  >
                    <option value="general">General</option>
                    <option value="limits">Limits</option>
                    <option value="features">Features</option>
                    <option value="storage">Storage</option>
                    <option value="analytics">Analytics</option>
                    <option value="support">Support</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Default Value</label>
                <input
                  type="text"
                  value={newFeature.default_value}
                  onChange={(e) => setNewFeature({ ...newFeature, default_value: e.target.value })}
                  placeholder={newFeature.feature_type === 'boolean' ? 'true or false' : 'Default value'}
                  className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Applicable To</label>
                <div className="flex gap-4 flex-wrap">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newFeature.applicable_to.includes('photographer')}
                      onChange={(e) => {
                        const newApplicable = e.target.checked
                          ? [...newFeature.applicable_to, 'photographer']
                          : newFeature.applicable_to.filter(t => t !== 'photographer');
                        setNewFeature({ ...newFeature, applicable_to: newApplicable });
                      }}
                      className="rounded"
                    />
                    <span className="text-sm text-foreground">Creator Plans</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newFeature.applicable_to.includes('payg')}
                      onChange={(e) => {
                        const newApplicable = e.target.checked
                          ? [...newFeature.applicable_to, 'payg']
                          : newFeature.applicable_to.filter(t => t !== 'payg');
                        setNewFeature({ ...newFeature, applicable_to: newApplicable });
                      }}
                      className="rounded"
                    />
                    <span className="text-sm text-foreground">Pay As You Go</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-end gap-3 sticky bottom-0 bg-card">
              <button
                onClick={() => setShowCreateFeatureModal(false)}
                className="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFeature}
                disabled={isCreatingFeature || !newFeature.code || !newFeature.name}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isCreatingFeature ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Feature'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatStorageLimit(limitMb: number) {
  if (limitMb === -1) return 'Unlimited';
  if (limitMb >= 1024) return `${(limitMb / 1024).toFixed(0)} GB`;
  return `${limitMb} MB`;
}

function StoragePlansUI() {
  const toast = useToast();
  const [plans, setPlans] = useState<StoragePlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPlan, setEditingPlan] = useState<StoragePlan | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadStoragePlans();
  }, []);

  async function loadStoragePlans() {
    try {
      const response = await fetch('/api/admin/storage/plans');
      if (!response.ok) {
        throw new Error('Failed to load storage plans');
      }
      const payload = await response.json();
      setPlans(payload.plans || []);
    } catch (error) {
      console.error('Failed to load storage plans:', error);
      toast.error('Failed to load storage plans');
    } finally {
      setIsLoading(false);
    }
  }

  function openCreateModal() {
    setEditingPlan({
      id: '',
      name: '',
      slug: '',
      description: '',
      storage_limit_mb: 1024,
      photo_limit: 100,
      price_monthly: 0,
      price_yearly: 0,
      currency: 'USD',
      features: [],
      is_popular: false,
      is_active: true,
      sort_order: plans.length,
    });
    setShowModal(true);
  }

  function openEditModal(plan: StoragePlan) {
    setEditingPlan({
      ...plan,
      features: Array.isArray(plan.features) ? plan.features : [],
    });
    setShowModal(true);
  }

  async function saveStoragePlan() {
    if (!editingPlan) return;
    if (!editingPlan.name.trim() || !editingPlan.slug.trim()) {
      toast.error('Name and slug are required');
      return;
    }

    setIsSaving(true);
    try {
      const method = editingPlan.id ? 'PUT' : 'POST';
      const response = await fetch('/api/admin/storage/plans', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingPlan.id ? { id: editingPlan.id } : {}),
          name: editingPlan.name.trim(),
          slug: editingPlan.slug.trim().toLowerCase(),
          description: editingPlan.description?.trim() || null,
          storage_limit_mb: editingPlan.storage_limit_mb,
          photo_limit: editingPlan.photo_limit,
          price_monthly: editingPlan.price_monthly,
          price_yearly: editingPlan.price_yearly,
          currency: editingPlan.currency || 'USD',
          features: editingPlan.features || [],
          is_popular: editingPlan.is_popular,
          is_active: editingPlan.is_active,
          sort_order: editingPlan.sort_order ?? 0,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save storage plan');
      }

      toast.success(editingPlan.id ? 'Storage plan updated' : 'Storage plan created');
      setShowModal(false);
      setEditingPlan(null);
      await loadStoragePlans();
    } catch (error: any) {
      console.error('Save storage plan failed:', error);
      toast.error(error?.message || 'Failed to save storage plan');
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivateStoragePlan(plan: StoragePlan) {
    const accepted = window.confirm(
      `Deactivate "${plan.name}"? Existing users keep access; new users cannot subscribe.`
    );
    if (!accepted) return;

    try {
      const response = await fetch(`/api/admin/storage/plans?id=${plan.id}`, {
        method: 'DELETE',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to deactivate storage plan');
      }
      toast.success('Storage plan deactivated');
      await loadStoragePlans();
    } catch (error: any) {
      console.error('Deactivate storage plan failed:', error);
      toast.error(error?.message || 'Failed to deactivate storage plan');
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Vault Storage Plans</h2>
          <p className="text-sm text-muted-foreground">
            Manage attendee vault storage tiers used in the mobile app.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Storage Plan
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <HardDrive className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-foreground">No storage plans configured</p>
          <p className="text-muted-foreground text-sm mt-1">
            Create a vault storage plan so attendees can see and subscribe to tiers.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl border bg-card p-5 ${
                plan.is_popular ? 'border-primary shadow-md' : 'border-border'
              } ${plan.is_active ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-foreground">{plan.name}</h3>
                  <p className="text-xs font-mono text-muted-foreground">{plan.slug}</p>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    plan.is_active
                      ? 'bg-green-500/10 text-green-500'
                      : 'bg-gray-500/10 text-gray-500'
                  }`}
                >
                  {plan.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <p className="text-sm text-muted-foreground mb-3">{plan.description || 'No description'}</p>
              <p className="text-2xl font-bold text-foreground mb-2">
                ${Number(plan.price_monthly || 0).toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                ${Number(plan.price_yearly || 0).toFixed(2)}/year
              </p>

              <div className="space-y-2 mb-4 text-sm">
                <div className="flex items-center gap-2 text-foreground">
                  <HardDrive className="h-4 w-4 text-primary" />
                  {formatStorageLimit(plan.storage_limit_mb)}
                </div>
                <div className="flex items-center gap-2 text-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  {plan.photo_limit === -1 ? 'Unlimited photos' : `${plan.photo_limit} photos`}
                </div>
              </div>

              <div className="text-xs text-muted-foreground mb-4">
                {plan.activeSubscriptions || 0} active subscriptions
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(plan)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={() => deactivateStoragePlan(plan)}
                  className="px-3 py-2 rounded-lg border border-border text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && editingPlan && (
        <div
          className="fixed bg-black/50 flex items-center justify-center z-50"
          style={{
            position: 'fixed',
            inset: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100dvw',
            height: '100dvh',
          }}
        >
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 my-4">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card">
              <h2 className="text-xl font-bold text-foreground">
                {editingPlan.id ? 'Edit Storage Plan' : 'Create Storage Plan'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingPlan(null);
                }}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Plan Name</label>
                  <input
                    type="text"
                    value={editingPlan.name}
                    onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Slug</label>
                  <input
                    type="text"
                    value={editingPlan.slug}
                    onChange={(e) => setEditingPlan({ ...editingPlan, slug: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground font-mono"
                    disabled={!!editingPlan.id}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Description</label>
                <textarea
                  value={editingPlan.description || ''}
                  onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Storage Limit (MB)</label>
                  <input
                    type="number"
                    value={editingPlan.storage_limit_mb}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        storage_limit_mb: Number(e.target.value || 0),
                      })
                    }
                    className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Photo Limit</label>
                  <input
                    type="number"
                    value={editingPlan.photo_limit}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        photo_limit: Number(e.target.value || 0),
                      })
                    }
                    className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Monthly Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingPlan.price_monthly}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        price_monthly: Number(e.target.value || 0),
                      })
                    }
                    className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Yearly Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingPlan.price_yearly}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        price_yearly: Number(e.target.value || 0),
                      })
                    }
                    className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Features (one per line)
                </label>
                <textarea
                  value={(editingPlan.features || []).join('\n')}
                  onChange={(e) =>
                    setEditingPlan({
                      ...editingPlan,
                      features: e.target.value
                        .split('\n')
                        .map((feature) => feature.trim())
                        .filter(Boolean),
                    })
                  }
                  rows={4}
                  className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={editingPlan.is_popular}
                    onChange={(e) => setEditingPlan({ ...editingPlan, is_popular: e.target.checked })}
                  />
                  Popular plan
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={editingPlan.is_active}
                    onChange={(e) => setEditingPlan({ ...editingPlan, is_active: e.target.checked })}
                  />
                  Active
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <button
                  onClick={() => {
                    setShowModal(false);
                    setEditingPlan(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveStoragePlan}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
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

export default function PricingPage() {
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>(defaultCurrencies);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [activeTab, setActiveTab] = useState<'plans' | 'features' | 'currencies' | 'storage'>('plans');
  const [platformBaseCurrency, setPlatformBaseCurrency] = useState('USD');
  const [savingBaseCurrency, setSavingBaseCurrency] = useState(false);
  const [dropInCreditUnitPrice, setDropInCreditUnitPrice] = useState('0.00');
  const [dropInCreditCurrency, setDropInCreditCurrency] = useState('USD');
  const [savingDropInCreditSettings, setSavingDropInCreditSettings] = useState(false);
  const [dropInCreditsUpload, setDropInCreditsUpload] = useState('1');
  const [dropInCreditsGift, setDropInCreditsGift] = useState('1');
  const [dropInCreditsRecipientUnlock, setDropInCreditsRecipientUnlock] = useState('1');
  const [dropInCreditsInternalSearch, setDropInCreditsInternalSearch] = useState('3');
  const [dropInCreditsContactsSearch, setDropInCreditsContactsSearch] = useState('3');
  const [dropInCreditsExternalSearch, setDropInCreditsExternalSearch] = useState('5');
  const [savingDropInCreditRules, setSavingDropInCreditRules] = useState(false);
  
  // Available features for plan creation
  const [availablePlanFeatures, setAvailablePlanFeatures] = useState<any[]>([]);
  const [selectedPlanFeatures, setSelectedPlanFeatures] = useState<Record<string, any>>({});

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    features: [''],
    base_price_usd: 0,
    is_active: true,
    is_popular: false,
    use_auto_conversion: true,
    manual_prices: {} as Record<string, string>,
    plan_type: 'photographer' as 'photographer' | 'payg',
    platform_fee_percent: 20.00,
    platform_fee_fixed: 0,
    platform_fee_type: 'percent' as 'percent' | 'fixed' | 'both',
    print_commission_percent: 15.00,
    print_commission_fixed: 0,
    print_commission_type: 'percent' as 'percent' | 'fixed' | 'both',
  });

  useEffect(() => {
    loadPlans();
    loadCurrencies();
    loadAvailableFeatures();
    loadPlatformPricingSettings();
  }, []);
  
  // Load features when plan type changes
  useEffect(() => {
    loadAvailableFeatures();
  }, [formData.plan_type]);
  
  async function loadAvailableFeatures() {
    try {
      const res = await fetch(`/api/admin/pricing/features?plan_type=${formData.plan_type}`);
      if (res.ok) {
        const data = await res.json();
        setAvailablePlanFeatures(data.features || []);
      }
    } catch (err) {
      console.error('Failed to load features:', err);
    }
  }

  async function loadPlans() {
    try {
      const res = await fetch('/api/admin/pricing/plans');
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      }
    } catch (err) {
      console.error('Failed to load plans:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCurrencies() {
    try {
      const res = await fetch('/api/admin/pricing/currencies');
      if (res.ok) {
        const data = await res.json();
        if (data.currencies?.length) {
          setCurrencies(data.currencies);
        }
      }
    } catch (err) {
      console.error('Failed to load currencies:', err);
    }
  }

  function parseSettingValue(raw: any): any {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') return raw;

    const trimmed = raw.trim();
    if (!trimmed) return null;

    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.replace(/^"|"$/g, '');
    }
  }

  async function loadPlatformPricingSettings() {
    try {
      const res = await fetch('/api/admin/settings');
      if (!res.ok) return;
      const data = await res.json();
      const settings = data.settings || [];
      const baseCurrencyRow = settings.find(
        (setting: any) => setting.setting_key === 'platform_base_currency'
      );
      const baseCurrencyValue = parseSettingValue(baseCurrencyRow?.value);
      const normalized =
        typeof baseCurrencyValue === 'string'
          ? baseCurrencyValue
          : typeof baseCurrencyValue?.code === 'string'
          ? baseCurrencyValue.code
          : '';
      if (normalized) {
        setPlatformBaseCurrency(normalized.replace(/"/g, '').toUpperCase());
      }

      const creditPriceRow = settings.find(
        (setting: any) => setting.setting_key === 'drop_in_credit_unit_price_cents'
      );
      const creditCurrencyRow = settings.find(
        (setting: any) => setting.setting_key === 'drop_in_credit_currency'
      );
      const uploadCreditsRow = settings.find(
        (setting: any) => setting.setting_key === 'drop_in_credits_required_upload'
      );
      const giftCreditsRow = settings.find(
        (setting: any) => setting.setting_key === 'drop_in_credits_required_gift'
      );
      const recipientUnlockCreditsRow = settings.find(
        (setting: any) => setting.setting_key === 'drop_in_credits_required_recipient_unlock'
      );
      const internalSearchCreditsRow = settings.find(
        (setting: any) => setting.setting_key === 'drop_in_credits_required_internal_search'
      );
      const contactsSearchCreditsRow = settings.find(
        (setting: any) => setting.setting_key === 'drop_in_credits_required_contacts_search'
      );
      const externalSearchCreditsRow = settings.find(
        (setting: any) => setting.setting_key === 'drop_in_credits_required_external_search'
      );

      const creditUnitCents = Number(parseSettingValue(creditPriceRow?.value));
      if (Number.isFinite(creditUnitCents) && creditUnitCents > 0) {
        setDropInCreditUnitPrice((creditUnitCents / 100).toFixed(2));
      }

      const normalizedDropInCurrency = String(parseSettingValue(creditCurrencyRow?.value) || '').toUpperCase();
      if (normalizedDropInCurrency) {
        setDropInCreditCurrency(normalizedDropInCurrency);
      }

      const normalizeCredits = (raw: unknown, fallback: string) => {
        const parsed = Number(parseSettingValue(raw));
        if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
        return String(Math.round(parsed));
      };
      setDropInCreditsUpload(normalizeCredits(uploadCreditsRow?.value, '1'));
      setDropInCreditsGift(normalizeCredits(giftCreditsRow?.value, '1'));
      setDropInCreditsRecipientUnlock(normalizeCredits(recipientUnlockCreditsRow?.value, '1'));
      setDropInCreditsInternalSearch(normalizeCredits(internalSearchCreditsRow?.value, '3'));
      setDropInCreditsContactsSearch(normalizeCredits(contactsSearchCreditsRow?.value, '3'));
      setDropInCreditsExternalSearch(normalizeCredits(externalSearchCreditsRow?.value, '5'));
    } catch (err) {
      console.error('Failed to load pricing settings:', err);
    }
  }

  async function savePlatformBaseCurrency() {
    if (!platformBaseCurrency) return;
    setSavingBaseCurrency(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            platform_base_currency: platformBaseCurrency.toUpperCase(),
          },
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to save base currency');
      }

      toast.success('Base currency updated', `Fallback currency is now ${platformBaseCurrency.toUpperCase()}.`);
    } catch (err: any) {
      toast.error('Save failed', err?.message || 'Could not save base currency');
    } finally {
      setSavingBaseCurrency(false);
    }
  }

  async function saveDropInCreditSettings() {
    const creditUnit = Number.parseFloat(dropInCreditUnitPrice);
    if (!Number.isFinite(creditUnit) || creditUnit <= 0) {
      toast.error('Save failed', 'Credit unit price must be greater than 0.');
      return;
    }

    setSavingDropInCreditSettings(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            drop_in_credit_unit_price_cents: Math.round(creditUnit * 100),
            drop_in_credit_currency: dropInCreditCurrency.toUpperCase(),
          },
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to save drop-in credit settings');
      }

      toast.success(
        'Drop-in credit pricing updated',
        `1 credit = ${dropInCreditCurrency.toUpperCase()} ${creditUnit.toFixed(2)}`
      );
    } catch (err: any) {
      toast.error('Save failed', err?.message || 'Could not save drop-in credit settings');
    } finally {
      setSavingDropInCreditSettings(false);
    }
  }

  async function saveDropInCreditRules() {
    const uploadCredits = Math.round(Number.parseFloat(dropInCreditsUpload));
    const giftCredits = Math.round(Number.parseFloat(dropInCreditsGift));
    const recipientUnlockCredits = Math.round(Number.parseFloat(dropInCreditsRecipientUnlock));
    const internalSearchCredits = Math.round(Number.parseFloat(dropInCreditsInternalSearch));
    const contactsSearchCredits = Math.round(Number.parseFloat(dropInCreditsContactsSearch));
    const externalSearchCredits = Math.round(Number.parseFloat(dropInCreditsExternalSearch));

    const values = [
      uploadCredits,
      giftCredits,
      recipientUnlockCredits,
      internalSearchCredits,
      contactsSearchCredits,
      externalSearchCredits,
    ];
    if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
      toast.error('Save failed', 'All required credit values must be positive integers.');
      return;
    }

    setSavingDropInCreditRules(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            drop_in_credits_required_upload: uploadCredits,
            drop_in_credits_required_gift: giftCredits,
            drop_in_credits_required_recipient_unlock: recipientUnlockCredits,
            drop_in_credits_required_internal_search: internalSearchCredits,
            drop_in_credits_required_contacts_search: contactsSearchCredits,
            drop_in_credits_required_external_search: externalSearchCredits,
          },
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to save drop-in credit rules');
      }

      toast.success('Drop-in credit rules updated', 'Required credits for all drop-in actions were saved.');
    } catch (err: any) {
      toast.error('Save failed', err?.message || 'Could not save drop-in credit rules');
    } finally {
      setSavingDropInCreditRules(false);
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      code: '',
      description: '',
      features: [''],
      base_price_usd: 0,
      is_active: true,
      is_popular: false,
      use_auto_conversion: true,
      manual_prices: {},
      plan_type: 'photographer',
      platform_fee_percent: 20.00,
      platform_fee_fixed: 0,
      platform_fee_type: 'percent',
      print_commission_percent: 15.00,
      print_commission_fixed: 0,
      print_commission_type: 'percent',
    });
    setSelectedPlanFeatures({});
    setEditingPlan(null);
  }

  function openCreateModal() {
    resetForm();
    loadAvailableFeatures();
    setShowCreateModal(true);
  }
  
  async function loadPlanFeatures(planId: string) {
    try {
      const res = await fetch(`/api/admin/pricing/plans/${planId}/features`);
      if (res.ok) {
        const data = await res.json();
        // Convert assigned features to a map
        const assignedMap: Record<string, any> = {};
        (data.assignedFeatures || []).forEach((af: any) => {
          assignedMap[af.feature_code] = af.feature_value;
        });
        setSelectedPlanFeatures(assignedMap);
      }
    } catch (err) {
      console.error('Failed to load plan features:', err);
    }
  }

  function openEditModal(plan: Plan) {
    setFormData({
      name: plan.name,
      code: plan.code,
      description: plan.description,
      features: plan.features.length ? plan.features : [''],
      base_price_usd: plan.base_price_usd / 100,
      is_active: plan.is_active,
      is_popular: plan.is_popular,
      use_auto_conversion: !plan.prices || Object.keys(plan.prices).length === 0,
      manual_prices: plan.prices ? Object.fromEntries(
        Object.entries(plan.prices).map(([k, v]) => [k, (v / 100).toString()])
      ) : {},
      plan_type: plan.plan_type || 'photographer', // Add plan_type support
      platform_fee_percent: plan.platform_fee_percent ?? 0,
      platform_fee_fixed: (plan.platform_fee_fixed || 0) / 100,
      platform_fee_type: plan.platform_fee_type || 'percent',
      print_commission_percent: plan.print_commission_percent ?? 0,
      print_commission_fixed: (plan.print_commission_fixed || 0) / 100,
      print_commission_type: plan.print_commission_type || 'percent',
    });
    setEditingPlan(plan);
    // Load features for this plan
    loadPlanFeatures(plan.id);
    loadAvailableFeatures();
    setShowCreateModal(true);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const prices: Record<string, number> = {};
      
      if (!formData.use_auto_conversion) {
        Object.entries(formData.manual_prices).forEach(([code, value]) => {
          if (value) {
            prices[code] = Math.round(parseFloat(value) * 100);
          }
        });
      }

      const payload = {
        name: formData.name,
        code: formData.code.toLowerCase().replace(/\s+/g, '_'),
        description: formData.description,
        features: formData.features.filter(f => f.trim()),
        base_price_usd: Math.round(formData.base_price_usd * 100),
        is_active: formData.is_active,
        is_popular: formData.is_popular,
        prices,
        plan_type: formData.plan_type,
        platform_fee_percent: formData.platform_fee_percent,
        platform_fee_fixed: Math.round(formData.platform_fee_fixed * 100),
        platform_fee_type: formData.platform_fee_type,
        print_commission_percent: formData.print_commission_percent,
        print_commission_fixed: Math.round(formData.print_commission_fixed * 100),
        print_commission_type: formData.print_commission_type,
      };

      const url = editingPlan 
        ? `/api/admin/pricing/plans/${editingPlan.id}`
        : '/api/admin/pricing/plans';
      
      const res = await fetch(url, {
        method: editingPlan ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const savedPlan = await res.json();
        const planId = editingPlan?.id || savedPlan.plan?.id;
        
        // Save selected features for this plan
        if (planId && Object.keys(selectedPlanFeatures).length > 0) {
          try {
            await fetch(`/api/admin/pricing/plans/${planId}/features`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ features: selectedPlanFeatures }),
            });
          } catch (err) {
            console.error('Failed to save plan features:', err);
            // Don't fail the whole operation, just log
          }
        }
        
        toast.success(
          editingPlan ? 'Plan Updated' : 'Plan Created',
          `${formData.name} has been ${editingPlan ? 'updated' : 'created'} successfully.`
        );
        setShowCreateModal(false);
        resetForm();
        loadPlans();
      } else {
        const error = await res.json();
        toast.error('Save Failed', error.error || 'Failed to save plan');
      }
    } catch (err) {
      console.error('Save failed:', err);
      toast.error('Save Failed', 'An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeletePlan(planId: string, planName: string) {
    const confirmed = await confirm({
      title: 'Delete Plan',
      message: `Are you sure you want to delete "${planName}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });

    if (!confirmed) return;
    
    try {
      const res = await fetch(`/api/admin/pricing/plans/${planId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Plan Deleted', `${planName} has been deleted.`);
        loadPlans();
      } else {
        const error = await res.json();
        toast.error('Delete Failed', error.error || 'Failed to delete plan');
      }
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error('Delete Failed', 'An unexpected error occurred');
    }
  }

  function addFeature() {
    setFormData({ ...formData, features: [...formData.features, ''] });
  }

  function removeFeature(index: number) {
    setFormData({
      ...formData,
      features: formData.features.filter((_, i) => i !== index),
    });
  }

  function updateFeature(index: number, value: string) {
    const features = [...formData.features];
    features[index] = value;
    setFormData({ ...formData, features });
  }

  function calculateAutoPrice(currency: Currency) {
    const basePrice = formData.base_price_usd;
    return (basePrice * currency.rate_to_usd).toFixed(2);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-80 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-10 w-36 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="h-12 w-full animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-[32rem] animate-pulse rounded-xl border border-border bg-card" />
          <div className="h-[32rem] animate-pulse rounded-xl border border-border bg-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pricing & Plans</h1>
          <p className="text-muted-foreground mt-1">
            Manage subscription plans and pricing
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Plan
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">Payment Providers & Region Currency Rules</p>
            <p className="text-sm text-muted-foreground">
              Provider availability is configured per region. Plan prices and currency options here are consumed by those regional provider rules.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
              <span className="text-xs text-muted-foreground">Base fallback currency</span>
              <select
                value={platformBaseCurrency}
                onChange={(e) => setPlatformBaseCurrency(e.target.value.toUpperCase())}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
              >
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code}
                  </option>
                ))}
              </select>
              <button
                onClick={savePlatformBaseCurrency}
                disabled={savingBaseCurrency}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {savingBaseCurrency ? 'Saving...' : 'Save'}
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
              <span className="text-xs text-muted-foreground">Drop-In 1 Credit</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={dropInCreditUnitPrice}
                onChange={(e) => setDropInCreditUnitPrice(e.target.value)}
                className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
              />
              <select
                value={dropInCreditCurrency}
                onChange={(e) => setDropInCreditCurrency(e.target.value.toUpperCase())}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
              >
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code}
                  </option>
                ))}
              </select>
              <button
                onClick={saveDropInCreditSettings}
                disabled={savingDropInCreditSettings}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {savingDropInCreditSettings ? 'Saving...' : 'Save'}
              </button>
            </div>
            <Link
              href="/regions"
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              Open Regions
            </Link>
            <Link
              href="/settings"
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              Platform Defaults
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">Drop-In Required Credits</p>
            <p className="text-sm text-muted-foreground">
              Set how many credits each Drop-In action consumes.
            </p>
          </div>
          <button
            onClick={saveDropInCreditRules}
            disabled={savingDropInCreditRules}
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {savingDropInCreditRules ? 'Saving...' : 'Save Credit Rules'}
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm text-foreground">
            Upload Drop-In
            <input
              type="number"
              min="1"
              step="1"
              value={dropInCreditsUpload}
              onChange={(e) => setDropInCreditsUpload(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-foreground">
            Gift Access + Message
            <input
              type="number"
              min="1"
              step="1"
              value={dropInCreditsGift}
              onChange={(e) => setDropInCreditsGift(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-foreground">
            Recipient Unlock
            <input
              type="number"
              min="1"
              step="1"
              value={dropInCreditsRecipientUnlock}
              onChange={(e) => setDropInCreditsRecipientUnlock(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-foreground">
            Internal Search
            <input
              type="number"
              min="1"
              step="1"
              value={dropInCreditsInternalSearch}
              onChange={(e) => setDropInCreditsInternalSearch(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-foreground">
            Contacts Search
            <input
              type="number"
              min="1"
              step="1"
              value={dropInCreditsContactsSearch}
              onChange={(e) => setDropInCreditsContactsSearch(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-foreground">
            External Search
            <input
              type="number"
              min="1"
              step="1"
              value={dropInCreditsExternalSearch}
              onChange={(e) => setDropInCreditsExternalSearch(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('plans')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'plans'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Plans
        </button>
        <button
          onClick={() => setActiveTab('features')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'features'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Features
        </button>
        <button
          onClick={() => setActiveTab('currencies')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'currencies'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Currencies
        </button>
        <button
          onClick={() => setActiveTab('storage')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'storage'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Vault Storage
        </button>
      </div>

      {activeTab === 'plans' && (
        <>
          {plans.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-foreground font-medium">No plans created yet</p>
              <p className="text-muted-foreground mt-1">Create your first subscription plan to get started.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`rounded-xl border bg-card p-6 relative ${
                    plan.is_popular ? 'border-primary shadow-lg' : 'border-border'
                  }`}
                >
                  {plan.is_popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                      Popular
                    </div>
                  )}
                  
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-foreground">{plan.name}</h3>
                      <p className="text-xs font-mono text-muted-foreground">{plan.code}</p>
                      {plan.plan_type && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          {plan.plan_type === 'payg' ? (
                            <>
                              <DollarSign className="h-3 w-3" />
                              Pay As You Go
                            </>
                          ) : (
                            <>
                              <Camera className="h-3 w-3" />
                              Creator
                            </>
                          )}
                        </p>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      plan.is_active 
                        ? 'bg-green-500/10 text-green-500' 
                        : 'bg-gray-500/10 text-gray-500'
                    }`}>
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <p className="text-2xl font-bold text-foreground mb-2">
                    ${(plan.base_price_usd / 100).toFixed(2)}
                    <span className="text-sm font-normal text-muted-foreground">/month</span>
                  </p>

                  <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>

                  {plan.features.length > 0 && (
                    <ul className="space-y-2 mb-4">
                      {plan.features.slice(0, 5).map((feature, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                          <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                      {plan.features.length > 5 && (
                        <li className="text-sm text-muted-foreground">
                          +{plan.features.length - 5} more features
                        </li>
                      )}
                    </ul>
                  )}

                  <div className="flex gap-2 pt-4 border-t border-border">
                    <button
                      onClick={() => openEditModal(plan)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeletePlan(plan.id, plan.name)}
                      className="px-3 py-2 rounded-lg border border-border text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'features' && (
        <FeatureManagementUI plans={plans} />
      )}

      {activeTab === 'currencies' && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Supported Currencies</h2>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-muted transition-colors">
              <RefreshCw className="h-4 w-4" />
              Update Rates
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Currency</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Code</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Symbol</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Rate to USD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {currencies.map((currency) => (
                <tr key={currency.code} className="hover:bg-muted/30">
                  <td className="px-6 py-4 text-foreground">{currency.name}</td>
                  <td className="px-6 py-4 font-mono text-foreground">{currency.code}</td>
                  <td className="px-6 py-4 text-foreground">{currency.symbol}</td>
                  <td className="px-6 py-4 text-foreground">{currency.rate_to_usd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'storage' && <StoragePlansUI />}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div 
          className="fixed bg-black/50 flex items-center justify-center z-50"
          style={{
            position: 'fixed',
            inset: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100dvw',
            height: '100dvh',
            margin: 0,
            padding: 0,
          }}
        >
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 my-4">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card">
              <h2 className="text-xl font-bold text-foreground">
                {editingPlan ? 'Edit Plan' : 'Create Plan'}
              </h2>
              <button
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Plan Type</label>
                  <select
                    value={formData.plan_type}
                    onChange={(e) => setFormData({ ...formData, plan_type: e.target.value as 'photographer' | 'payg' })}
                    className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  >
                    <option value="photographer">Creator</option>
                    <option value="payg">Pay As You Go</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Plan Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Professional"
                    className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Plan Code</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g., pro"
                  className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Unique identifier for this plan (e.g., &quot;starter&quot;, &quot;payg_pro&quot;)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this plan..."
                  rows={2}
                  className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                />
              </div>

              {/* Features */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Features</label>
                <div className="space-y-2">
                  {formData.features.map((feature, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={feature}
                        onChange={(e) => updateFeature(index, e.target.value)}
                        placeholder="Feature description..."
                        className="flex-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                      />
                      {formData.features.length > 1 && (
                        <button
                          onClick={() => removeFeature(index)}
                          className="p-2 rounded-lg border border-border text-destructive hover:bg-destructive/10"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={addFeature}
                  className="mt-2 text-sm text-primary hover:underline"
                >
                  + Add Feature
                </button>
              </div>

              {/* Pricing */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Base Price (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.base_price_usd}
                    onChange={(e) => setFormData({ ...formData, base_price_usd: parseFloat(e.target.value) || 0 })}
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  />
                </div>
              </div>

              {/* Multi-currency pricing */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="text-sm font-medium text-foreground">Multi-Currency Pricing</label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={formData.use_auto_conversion}
                      onChange={(e) => setFormData({ ...formData, use_auto_conversion: e.target.checked })}
                      className="rounded"
                    />
                    Use auto-conversion
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {currencies.filter(c => c.code !== 'USD').map((currency) => (
                    <div key={currency.code} className="flex items-center gap-2">
                      <span className="w-12 text-sm font-mono text-muted-foreground">{currency.code}</span>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          {currency.symbol}
                        </span>
                        <input
                          type="text"
                          value={formData.use_auto_conversion 
                            ? calculateAutoPrice(currency)
                            : formData.manual_prices[currency.code] || ''
                          }
                          onChange={(e) => setFormData({
                            ...formData,
                            manual_prices: { ...formData.manual_prices, [currency.code]: e.target.value }
                          })}
                          disabled={formData.use_auto_conversion}
                          placeholder={calculateAutoPrice(currency)}
                          className="w-full pl-10 pr-4 py-2 rounded-lg bg-muted border border-input text-foreground disabled:opacity-50"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Platform Fee */}
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Platform Fee</h3>
                    <span className="text-xs text-muted-foreground bg-accent/10 text-accent px-2 py-1 rounded">Creator/PAYG Plans</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Fee charged on each photo sale. This is deducted from the photographer&apos;s earnings.
                  </p>
                  
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Fee Type</label>
                    <select
                      value={formData.platform_fee_type}
                      onChange={(e) => setFormData({ ...formData, platform_fee_type: e.target.value as 'percent' | 'fixed' | 'both' })}
                      className="w-full px-4 py-2 rounded-lg bg-card border border-input text-foreground"
                    >
                      <option value="percent">Percentage Only</option>
                      <option value="fixed">Fixed Amount Only</option>
                      <option value="both">Both (Percentage + Fixed)</option>
                    </select>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {(formData.platform_fee_type === 'percent' || formData.platform_fee_type === 'both') && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Fee Percentage (%)</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={formData.platform_fee_percent}
                            onChange={(e) => setFormData({ ...formData, platform_fee_percent: parseFloat(e.target.value) || 0 })}
                            className="w-full pl-8 pr-4 py-2 rounded-lg bg-card border border-input text-foreground"
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                        </div>
                      </div>
                    )}
                    
                    {(formData.platform_fee_type === 'fixed' || formData.platform_fee_type === 'both') && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Fixed Fee (USD)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.platform_fee_fixed}
                            onChange={(e) => setFormData({ ...formData, platform_fee_fixed: parseFloat(e.target.value) || 0 })}
                            className="w-full pl-7 pr-4 py-2 rounded-lg bg-card border border-input text-foreground"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              {/* Print Commission */}
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Print Commission</h3>
                    <span className="text-xs text-muted-foreground bg-accent/10 text-accent px-2 py-1 rounded">Creator/PAYG Plans</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Commission on print product sales through the platform.
                  </p>
                  
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Commission Type</label>
                    <select
                      value={formData.print_commission_type}
                      onChange={(e) => setFormData({ ...formData, print_commission_type: e.target.value as 'percent' | 'fixed' | 'both' })}
                      className="w-full px-4 py-2 rounded-lg bg-card border border-input text-foreground"
                    >
                      <option value="percent">Percentage Only</option>
                      <option value="fixed">Fixed Amount Only</option>
                      <option value="both">Both (Percentage + Fixed)</option>
                    </select>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {(formData.print_commission_type === 'percent' || formData.print_commission_type === 'both') && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Commission Percentage (%)</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={formData.print_commission_percent}
                            onChange={(e) => setFormData({ ...formData, print_commission_percent: parseFloat(e.target.value) || 0 })}
                            className="w-full pl-8 pr-4 py-2 rounded-lg bg-card border border-input text-foreground"
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                        </div>
                      </div>
                    )}
                    
                    {(formData.print_commission_type === 'fixed' || formData.print_commission_type === 'both') && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Fixed Commission (USD)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.print_commission_fixed}
                            onChange={(e) => setFormData({ ...formData, print_commission_fixed: parseFloat(e.target.value) || 0 })}
                            className="w-full pl-7 pr-4 py-2 rounded-lg bg-card border border-input text-foreground"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              {/* Plan Features Selection */}
              {availablePlanFeatures.length > 0 && (
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Plan Features & Limits</h3>
                    <span className="text-xs text-muted-foreground">
                      {Object.keys(selectedPlanFeatures).length} features selected
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Select which features this plan includes and set their values. Use -1 for unlimited limits.
                  </p>
                  
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                    {availablePlanFeatures.map((feature) => {
                      const isSelected = selectedPlanFeatures[feature.code] !== undefined;
                      const currentValue = selectedPlanFeatures[feature.code];
                      
                      return (
                        <div
                          key={feature.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                            isSelected ? 'border-primary/50 bg-primary/5' : 'border-border bg-background'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                // Add feature with default value
                                const defaultVal = feature.feature_type === 'boolean' ? true :
                                                   feature.feature_type === 'limit' ? -1 :
                                                   feature.default_value || '';
                                setSelectedPlanFeatures({
                                  ...selectedPlanFeatures,
                                  [feature.code]: defaultVal,
                                });
                              } else {
                                // Remove feature
                                const updated = { ...selectedPlanFeatures };
                                delete updated[feature.code];
                                setSelectedPlanFeatures(updated);
                              }
                            }}
                            className="rounded mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{feature.name}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                feature.feature_type === 'boolean' ? 'bg-green-500/10 text-green-600' :
                                feature.feature_type === 'limit' ? 'bg-blue-500/10 text-blue-600' :
                                'bg-purple-500/10 text-purple-600'
                              }`}>
                                {feature.feature_type}
                              </span>
                            </div>
                            {feature.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
                            )}
                            
                            {/* Value input based on type */}
                            {isSelected && feature.feature_type !== 'boolean' && (
                              <div className="mt-2">
                                {feature.feature_type === 'limit' ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      value={currentValue === -1 ? '' : currentValue}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? -1 : parseInt(e.target.value);
                                        setSelectedPlanFeatures({
                                          ...selectedPlanFeatures,
                                          [feature.code]: val,
                                        });
                                      }}
                                      placeholder="Unlimited (-1)"
                                      className="w-32 px-3 py-1.5 text-sm rounded-lg bg-card border border-input text-foreground"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setSelectedPlanFeatures({
                                        ...selectedPlanFeatures,
                                        [feature.code]: -1,
                                      })}
                                      className={`text-xs px-2 py-1 rounded ${
                                        currentValue === -1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                                      }`}
                                    >
                                      Unlimited
                                    </button>
                                  </div>
                                ) : (
                                  <input
                                    type="text"
                                    value={currentValue || ''}
                                    onChange={(e) => setSelectedPlanFeatures({
                                      ...selectedPlanFeatures,
                                      [feature.code]: e.target.value,
                                    })}
                                    placeholder="Enter value..."
                                    className="w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-input text-foreground"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {availablePlanFeatures.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No features available for {getPlanTypeLabel(formData.plan_type).toLowerCase()} plans.
                      Create features in the Features tab first.
                    </p>
                  )}
                </div>
              )}

              {/* Options */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-foreground">Active</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_popular}
                    onChange={(e) => setFormData({ ...formData, is_popular: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-foreground">Mark as Popular</span>
                </label>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-end gap-3 sticky bottom-0 bg-card">
              <button
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                className="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !formData.name || !formData.code}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingPlan ? 'Update Plan' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

