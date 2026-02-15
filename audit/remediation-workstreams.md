# Remediation Workstreams (Current State)

Date: 2026-02-15
Release Policy: zero open Critical/High before deploy

## Completed in This Pass
1. WS1 Security Boundary Hotfixes: Completed
- Admin event settings/cover APIs now require admin auth + permission checks.
- Drop-in process route now requires internal secret or authenticated owner.
- Wallet verify-account route now requires auth.
- Payout cron route is fail-closed when `CRON_SECRET` is missing.

2. WS2 Webhook Ledger + Payment Idempotency Core: Completed (core)
- Webhook ledger implemented and wired for Stripe/Flutterwave/PayPal.
- Provider event uniqueness and processing state tracking added.
- PayPal webhook signature verification now enforced with provider API verification.

3. WS4 Drop-In Payment/Processing Hardening: Completed (core)
- Drop-in payment provider reference columns normalized for provider IDs.
- Discover/notification identifier contract aligned across web/mobile.
- Registration check query fixed to valid schema source.

4. WS5 Notification Contract Unification: Completed (core)
- Canonical notification payload served by `/api/notifications`.
- Mobile notifications/store migrated to canonical `subject/body/read_at/metadata/status/channel` semantics.

5. WS6 Mobile API/Auth Parity: Completed (targeted core flows)
- Mobile face-scan uses `/api/faces/search` and correct payload.
- Mobile checkout uses `/api/checkout`, provider mapping, and `Idempotency-Key`.
- Social/profile calls now send bearer auth consistently.

6. WS3 Checkout Contract v1: Completed
- Checkout route now relies on persisted operation-scope idempotency records instead of metadata/time-window dedupe.
- Deterministic replay path remains enforced via `api_idempotency_keys`.

7. WS7 Payout Concurrency + Cron Safety: Completed
- Batch payout lease/lock semantics now enforced via `payout_batch_runs`.
- Deterministic `payout_identity_key` dedupe now enforced in payout creation path.
- Batch and retry payout flows now pass explicit identity keys to prevent duplicate worker execution.

8. WS1 Admin Secret Hygiene Hardening: Completed
- Admin JWT secret resolution centralized and production misconfiguration now fails closed.
- Admin middleware no longer implicitly uses `"undefined"` as JWT verify secret.

9. WS9 Announcement Delivery Worker: Completed (control-plane truth model)
- Announcement send path now queues notification rows and marks lifecycle as `queued` instead of immediately `sent`.
- Delivery status is now reconciled from actual notification outcomes (`pending/sent/delivered/failed/read`) with aggregate counters and summaries.
- Admin announcements list now shows queue/delivered/failed truth derived from delivery sync state.

10. WS8 Time/Currency/Plans Normalization: Completed (time model scope)
- Added timezone-aware event model fields and migration backfill (`event_timezone`, `event_start_at_utc`, `event_end_at_utc`).
- Event create/update flows now normalize date + timezone and persist deterministic UTC anchors.
- Web/mobile/admin event surfaces now use date-only safe formatting and timezone-aware rendering helpers.

## Remaining Release-Blocking Workstreams
1. WS10 Verification Harness + Reconciliation Jobs: In Progress
- Remaining: deterministic concurrency/replay/resilience test harness and drift auto-reconciliation.

## Acceptance Status
- Critical blockers: 0 open.
- High blockers: 0 open.
- Gate: `GO` (policy condition satisfied: zero Critical/High).
