'use client';

import { ArrowLeft, Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';

interface AdminOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface DisputeDetail {
  id: string;
  status: string;
  reason: string | null;
  amount: number;
  currency: string;
  evidence_due_by: string | null;
  evidence_submitted_at: string | null;
  outcome: string | null;
  outcome_reason: string | null;
  notes: string | null;
  assigned_to: string | null;
  evidence: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  transactions: {
    id: string;
    gross_amount: number;
    net_amount: number;
    currency: string;
    payment_provider: string;
    status: string;
    created_at: string;
    events?: {
      id: string;
      name: string;
      event_date: string | null;
    } | null;
    attendees?: {
      id: string;
      display_name: string | null;
      face_tag: string | null;
    } | null;
  } | null;
}

const STATUS_OPTIONS = [
  'open',
  'under_review',
  'evidence_submitted',
  'won',
  'lost',
  'closed',
];

export default function DisputeDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const disputeId = params?.id;

  const [dispute, setDispute] = useState<DisputeDetail | null>(null);
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [status, setStatus] = useState('open');
  const [assignedTo, setAssignedTo] = useState('');
  const [outcome, setOutcome] = useState('');
  const [outcomeReason, setOutcomeReason] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceText, setEvidenceText] = useState('{}');

  const evidencePreview = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(evidenceText), null, 2);
    } catch {
      return evidenceText;
    }
  }, [evidenceText]);

  useEffect(() => {
    const load = async () => {
      if (!disputeId) return;
      setError(null);
      setIsLoading(true);
      try {
        const response = await fetch(`/api/admin/disputes/${disputeId}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load dispute');
        }

        setDispute(payload.dispute);
        setAdmins(payload.admins || []);
        setStatus(payload.dispute.status || 'open');
        setAssignedTo(payload.dispute.assigned_to || '');
        setOutcome(payload.dispute.outcome || '');
        setOutcomeReason(payload.dispute.outcome_reason || '');
        setNotes(payload.dispute.notes || '');
        setEvidenceText(JSON.stringify(payload.dispute.evidence || {}, null, 2));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load dispute');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [disputeId]);

  const handleSave = async () => {
    if (!disputeId) return;

    setSuccess(null);
    setError(null);

    let parsedEvidence: Record<string, unknown>;
    try {
      parsedEvidence = JSON.parse(evidenceText || '{}');
    } catch {
      setError('Evidence must be valid JSON.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/disputes/${disputeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          assigned_to: assignedTo || null,
          outcome: outcome || null,
          outcome_reason: outcomeReason || null,
          notes,
          evidence: parsedEvidence,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update dispute');
      }

      setDispute((prev) => (prev ? { ...prev, ...payload.dispute } : prev));
      setSuccess('Dispute updated successfully.');
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update dispute');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="space-y-4">
        <Link href="/disputes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to disputes
        </Link>
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          Dispute not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/disputes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to disputes
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-foreground">Dispute {dispute.id.slice(0, 8)}...</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Created {formatDateTime(dispute.created_at)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}
      {success && <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-500">{success}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Dispute Details</h2>
          <p className="text-sm text-muted-foreground">Reason: {dispute.reason || 'Not specified'}</p>
          <p className="text-sm text-muted-foreground">
            Amount: {formatCurrency(dispute.amount, dispute.currency)}
          </p>
          <p className="text-sm text-muted-foreground">
            Evidence due: {dispute.evidence_due_by ? formatDate(dispute.evidence_due_by) : 'Not set'}
          </p>
          <p className="text-sm text-muted-foreground">
            Evidence submitted: {dispute.evidence_submitted_at ? formatDateTime(dispute.evidence_submitted_at) : 'No'}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Transaction</h2>
          <p className="text-sm text-muted-foreground">
            ID: <span className="font-mono text-foreground">{dispute.transactions?.id || 'N/A'}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Event: {dispute.transactions?.events?.name || 'Unknown event'}
          </p>
          <p className="text-sm text-muted-foreground">
            Attendee: {dispute.transactions?.attendees?.display_name || dispute.transactions?.attendees?.face_tag || 'Unknown'}
          </p>
          <p className="text-sm text-muted-foreground">
            Provider: <span className="capitalize">{dispute.transactions?.payment_provider || '-'}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Charged: {dispute.transactions ? formatCurrency(dispute.transactions.gross_amount, dispute.transactions.currency) : '-'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Resolution Workflow</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-foreground font-medium">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-foreground"
            >
              {STATUS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-foreground font-medium">Assigned Admin</span>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-foreground"
            >
              <option value="">Unassigned</option>
              {admins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.name} ({admin.email})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-foreground font-medium">Outcome</span>
            <input
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder="won / lost / closed"
              className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-foreground"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-foreground font-medium">Outcome Reason</span>
            <input
              value={outcomeReason}
              onChange={(e) => setOutcomeReason(e.target.value)}
              placeholder="Reason for outcome"
              className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-foreground"
            />
          </label>
        </div>

        <label className="space-y-1 text-sm block">
          <span className="text-foreground font-medium">Internal Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-foreground"
            placeholder="Add internal investigation notes"
          />
        </label>

        <label className="space-y-1 text-sm block">
          <span className="text-foreground font-medium">Evidence (JSON)</span>
          <textarea
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-input bg-muted px-3 py-2 font-mono text-xs text-foreground"
          />
        </label>

        <details className="rounded-lg border border-border bg-muted/30 p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">Evidence Preview</summary>
          <pre className="mt-2 whitespace-pre-wrap break-all text-xs text-muted-foreground">{evidencePreview}</pre>
        </details>
      </div>
    </div>
  );
}
