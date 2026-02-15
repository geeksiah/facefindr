# Concurrency Readiness Report

Date: 2026-02-15

Update (2026-02-15): Checkout idempotency persistence, webhook event ledgering, payout batch lease/identity controls, drop-in process auth hardening, announcement delivery-state truth modeling, and event time normalization were implemented. Current release gate blockers (Critical/High) are closed in `audit/release-gate-matrix.md`; remaining work is operational depth (`WS10` verification harness/reconciliation automation).

## Summary
Core concurrency controls on critical financial and drop-in paths are now in place, with remaining risk concentrated in automated resilience verification and operator reconciliation tooling depth.

Note: baseline findings below are retained for historical traceability from the pre-remediation audit snapshot.

## Race-Prone Flow Assessment
| Flow | Current Implementation | Concurrency Risk | Decision |
|---|---|---|---|
| Checkout create/finalize | Metadata-based duplicate checks + later metadata update | Parallel requests can create duplicate pending rows and divergent checkout refs | Needs DB constraint + transactional refactor |
| Webhook processing + entitlement grants | No event ledger, no one-time processing flag | Replay/parallel deliveries can re-run status writes and entitlement inserts | Needs DB constraint + transactional refactor |
| Wallet payout batching | Iterates wallets and inserts payouts without lock/lease | Dual workers can process same wallet before balances reflect completion | Needs distributed lock/job queue |
| Drop-in processing trigger | Public endpoint starts processing with service role | Repeated triggers can duplicate matches/notifications and spike infra cost | Needs distributed lock/job queue + auth gate |
| Drop-in match insertion | Plain insert into `drop_in_matches` | No uniqueness dedupe on photo+attendee+face id | Needs DB constraint |
| Notification read-state updates | Mixed contracts (`read_at` vs `read/is_read`) | Cross-client racing updates produce stale/unread drift | Needs contract unification + transactional API path |
| Announcement fanout | Bulk inserts to notifications then announcement marked sent | No worker/outbox guarantees for delivery ordering/retry | Needs job queue/outbox |

## Transaction and Locking Findings
1. No explicit SQL transaction boundaries around multi-step checkout writes (`apps/web/src/app/api/checkout/route.ts:473`, `apps/web/src/app/api/checkout/route.ts:536`).
2. Webhook handlers perform direct updates/inserts without event-level idempotency locks (`apps/web/src/app/api/webhooks/stripe/route.ts:37`, `apps/web/src/app/api/webhooks/flutterwave/route.ts:60`, `apps/web/src/app/api/webhooks/paypal/route.ts:68`).
3. Batch payouts are processed in-process loop with no leader election or lease (`apps/web/src/lib/payments/payout-service.ts:222`, `apps/web/src/lib/payments/payout-service.ts:268`).
4. Cron endpoint can be called repeatedly and, if misconfigured, publicly (`apps/web/src/app/api/cron/payouts/route.ts:29`).
5. Drop-in process endpoint is directly callable and not deduped (`apps/web/src/app/api/drop-in/process/route.ts:18`, `apps/web/src/app/api/drop-in/process/route.ts:165`).

## Schema-Level Concurrency Gaps
| Table | Missing Guard | Evidence |
|---|---|---|
| `transactions` | Unique constraints for `stripe_checkout_session_id`, `flutterwave_tx_ref`, `paypal_order_id` | `supabase/migrations/001_initial_schema.sql:249`, `supabase/migrations/002_payment_providers.sql:59`, `supabase/migrations/002_payment_providers.sql:60` |
| `entitlements` | Unique dedupe key per transaction/media/bulk scope | `supabase/migrations/001_initial_schema.sql:270` |
| `drop_in_matches` | Unique dedupe key on `(drop_in_photo_id, matched_attendee_id, rekognition_face_id)` | `supabase/migrations/039_drop_in_feature.sql:88` |
| `payouts` | Unique payout identity key (`provider_payout_id` not unique) | `supabase/migrations/002_payment_providers.sql:71` |
| Webhook events | Dedicated ledger table absent | migration scan (`supabase/migrations`) found no webhook-event table |

## Cross-Instance Safety
| Component | Current State | Required State |
|---|---|---|
| Scheduler/Cron | Stateless endpoint invocation | Single-run lease or queue worker ownership |
| Payment fulfillment | Handler-local processing | Durable event ledger + idempotent state machine |
| Drop-in processing | Inline trigger from webhook and UI | Queue-based worker with job identity and terminal states |
| Rate limiting | In-memory per instance (`apps/web/src/lib/rate-limit.ts`) | Distributed rate limiter for API edge safety |

## Decision Table (Requested Format)
| Flow | Safe As-Is | Needs DB Constraint | Needs Transactional Refactor | Needs Distributed Lock/Queue |
|---|---|---|---|---|
| Checkout create | No | Yes | Yes | Optional |
| Webhook fulfillment | No | Yes | Yes | Optional |
| Payout batch/retry | No | Yes | Yes | Yes |
| Drop-in processing | No | Yes | Yes | Yes |
| Notification read-state | No | Yes (contract-level) | Yes | No |
| Announcement fanout | No | Optional | Yes | Yes |

## Concurrency Verdict
- Verdict: `GO` for current release-gate policy (no open Critical/High), with follow-on hardening recommended for automated replay/concurrency verification.
