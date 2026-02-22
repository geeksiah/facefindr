'use client';

import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';

interface StoragePlanOption {
  id: string;
  name: string;
  slug: string;
  currency?: string | null;
  price_monthly?: number | null;
  price_yearly?: number | null;
}

interface AttendeeManualAssignmentCardProps {
  attendeeId: string;
  storagePlans: StoragePlanOption[];
  currentCredits?: number | null;
}

export function AttendeeManualAssignmentCard({
  attendeeId,
  storagePlans,
  currentCredits,
}: AttendeeManualAssignmentCardProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(storagePlans[0]?.id || '');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [durationDays, setDurationDays] = useState<number>(30);
  const [credits, setCredits] = useState<number>(10);
  const [creditReason, setCreditReason] = useState('');
  const [isSubmittingVault, setIsSubmittingVault] = useState(false);
  const [isSubmittingCredits, setIsSubmittingCredits] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => storagePlans.find((plan) => plan.id === selectedPlanId) || null,
    [storagePlans, selectedPlanId]
  );

  const handleAssignVault = async () => {
    setError(null);
    setMessage(null);
    setIsSubmittingVault(true);

    try {
      const response = await fetch(`/api/attendees/${attendeeId}/assign-vault-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId: selectedPlanId,
          billingCycle,
          durationDays,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'Failed to assign vault subscription');
        return;
      }

      setMessage(
        `Vault subscription assigned: ${payload.plan?.name || selectedPlan?.name || 'Plan'} (${billingCycle})`
      );
    } catch (assignmentError) {
      console.error('Vault assignment failed:', assignmentError);
      setError('Network error while assigning vault subscription');
    } finally {
      setIsSubmittingVault(false);
    }
  };

  const handleAssignCredits = async () => {
    setError(null);
    setMessage(null);
    setIsSubmittingCredits(true);

    try {
      const response = await fetch(`/api/attendees/${attendeeId}/assign-credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credits,
          reason: creditReason,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'Failed to assign credits');
        return;
      }

      setMessage(
        `Assigned ${payload.creditsAssigned || credits} credits. New balance: ${payload.newBalance ?? 'updated'}`
      );
      setCreditReason('');
    } catch (assignmentError) {
      console.error('Credit assignment failed:', assignmentError);
      setError('Network error while assigning credits');
    } finally {
      setIsSubmittingCredits(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-5">
      <h2 className="font-semibold text-foreground">Manual Assignment</h2>

      {typeof currentCredits === 'number' && (
        <p className="text-sm text-muted-foreground">
          Current drop-in credits: <span className="text-foreground font-medium">{currentCredits}</span>
        </p>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Assign Vault Subscription</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Storage Plan</label>
            <select
              value={selectedPlanId}
              onChange={(event) => setSelectedPlanId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
            >
              {storagePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({plan.slug})
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
            onClick={handleAssignVault}
            disabled={!selectedPlanId || isSubmittingVault}
            className="mt-5 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSubmittingVault ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign Vault Plan'}
          </button>
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-sm font-medium text-foreground">Assign Drop-In Credits</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">Credits</label>
            <input
              type="number"
              min={1}
              max={100000}
              value={credits}
              onChange={(event) => setCredits(Math.max(1, Number(event.target.value) || 1))}
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Reason (optional)</label>
            <input
              type="text"
              value={creditReason}
              onChange={(event) => setCreditReason(event.target.value)}
              placeholder="Compensation, migration adjustment, support grant..."
              className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
            />
          </div>
        </div>
        <button
          onClick={handleAssignCredits}
          disabled={isSubmittingCredits}
          className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmittingCredits ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign Credits'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}
    </div>
  );
}
