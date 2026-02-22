'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';

interface CreatorPlanOption {
  id: string;
  code: string;
  name: string;
}

interface CreatorSubscriptionAssignmentCardProps {
  photographerId: string;
  plans: CreatorPlanOption[];
  currentPlanCode?: string | null;
}

export function CreatorSubscriptionAssignmentCard({
  photographerId,
  plans,
  currentPlanCode,
}: CreatorSubscriptionAssignmentCardProps) {
  const [selectedPlanCode, setSelectedPlanCode] = useState<string>(currentPlanCode || plans[0]?.code || '');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [durationDays, setDurationDays] = useState<number>(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAssign = async () => {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/photographers/${photographerId}/assign-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planCode: selectedPlanCode,
          billingCycle,
          durationDays,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'Failed to assign subscription');
        return;
      }

      setMessage(
        `Creator subscription assigned: ${payload.subscription?.planCode || selectedPlanCode} (${billingCycle})`
      );
    } catch (assignmentError) {
      console.error('Creator subscription assignment failed:', assignmentError);
      setError('Network error while assigning creator subscription');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <h2 className="font-semibold text-foreground">Manual Subscription Assignment</h2>
      <p className="text-sm text-muted-foreground">
        Current plan: <span className="text-foreground font-medium">{currentPlanCode || 'free'}</span>
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground">Creator Plan</label>
          <select
            value={selectedPlanCode}
            onChange={(event) => setSelectedPlanCode(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.code}>
                {plan.name} ({plan.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Billing</label>
          <select
            value={billingCycle}
            onChange={(event) => setBillingCycle(event.target.value === 'annual' ? 'annual' : 'monthly')}
            className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
          >
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Duration (days)</label>
          <input
            type="number"
            min={1}
            max={3650}
            value={durationDays}
            onChange={(event) => setDurationDays(Math.max(1, Number(event.target.value) || 1))}
            className="mt-1 w-28 rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
          />
        </div>
        <button
          onClick={handleAssign}
          disabled={!selectedPlanCode || isSubmitting}
          className="mt-5 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign Plan'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}
    </div>
  );
}
