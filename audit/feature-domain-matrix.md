# Feature Domain Matrix (Product + UX + Operational)

Date: 2026-02-14
Coverage: web, admin, mobile, API routes, Supabase migrations

Update (2026-02-15): Core blocking feature-contract gaps identified in this matrix were remediated for notifications, mobile checkout/face-scan routes, drop-in notification identity alignment, and event time normalization. Current gate status is tracked in `audit/release-gate-matrix.md`.

Note: the matrix rows below are the original baseline gap map and are preserved for traceability; release readiness should be assessed from the gate matrix/evidence log.

## Matrix
| Domain | What Exists Today | Gaps by Persona/Lifecycle/State/Parity | Must Be There for Flawless Market Launch |
|---|---|---|---|
| Time | Event date stored and rendered across web/mobile (`events.event_date`). | `DATE`-only model, no event timezone, heavy client local formatting; DST/day-boundary ambiguity for attendee + organizer flows. | Add `event_timezone`, optional `event_start_at_utc`/`event_end_at_utc`, strict UTC storage + locale rendering contract, DST tests. |
| Currency | Runtime currency API, supported currencies, exchange-rate table, formatting helpers. | Mobile/web pricing contracts drift in some flows; stale/manual rates without explicit staleness SLO surfaced to users/operators. | One shared currency contract (minor units, decimal policy, staleness limits, fallback behavior), realtime invalidation and alerting. |
| Payment | Multi-gateway checkout and webhooks exist (Stripe/Flutterwave/PayPal) with enforced webhook verification + event ledger + operation-scope checkout idempotency records. | Remaining risk is operator-facing reconciliation/testing depth rather than core API contract parity. | Deterministic reconciliation dashboards/jobs and provider replay simulation harness in CI. |
| Wallet | Wallet onboarding/verification/payout endpoints exist with auth and payout batch lease/identity protections. | Remaining gaps are mostly operational (batch observability, retry analytics) rather than security/concurrency controls. | Operator-grade payout runbook telemetry, reconciliation counters, and alerting on failed/deduped payout batches. |
| Billing | Web billing screens + transaction history paths exist. | Mobile checkout points to non-existent endpoint; build pipeline not green for full-stack deploy. | Contract-aligned billing APIs for all clients, green CI gate for web/admin/mobile before release. |
| Plans | Runtime plans API and admin pricing stack exist. | Runtime response version uses `Date.now()` (non-deterministic per request); weak cache coherency contract across clients. | Stable config versioning tied to DB update stamps, client-side contract tests and invalidation policy. |
| Announcements | Admin CRUD/send flow with permission checks, country targeting, queued lifecycle, and delivery-state reconciliation from notification outcomes exists. | Provider dispatch workers for SMS/push/WhatsApp are still partial/stubbed in notification service for some channels. | Full worker/outbox dispatch per channel with retries/DLQ and end-to-end provider callback reconciliation. |
| Notifications | Canonical backend schema has `subject/body/status/read_at/metadata/channel`; web API + SSE exist. | Mobile uses legacy fields (`title/message/read/is_read/data`) and direct table writes to non-canonical columns; attendee legacy endpoint returns empty placeholder. | Unified v1 notification DTO across web/mobile/admin; deprecate legacy endpoint; migration shim + schema-safe client adapters. |
| Drop-In | Upload/discover/process/notification APIs and data model exist. | Public process endpoint, webhook UUID type mismatch, ID contract mismatch (`matchId` vs `notificationId`), runtime query against missing column, non-idempotent processing. | Secure job queue pipeline, strict contracts, dedupe constraints, provider-safe payment mapping, operator retry/reconcile tools. |
| Face Scan | `/api/faces/search`, liveness endpoints, refresh flows exist. | Mobile calls `/api/face/match` (missing) with payload mismatch (`imageBase64` vs expected `image`), plus auth transport mismatch risk. | Versioned face-scan API contract, mobile/client parity tests, bearer+cookie compatible auth policy. |
| FaceTag | Preview + claim APIs exist with race retry and validation. | Limited anti-abuse controls (rate/risk scoring) and no explicit moderation/reporting workflow surfaced in product plane. | Add abuse throttling and trust/safety controls for username/tag collision/impersonation patterns. |
| Socials | Follow/search/preferences APIs and profile pages exist. | Mobile social screens call APIs without auth headers while APIs depend on cookie sessions. | Unified mobile auth transport or bearer-aware APIs for all social endpoints; contract tests per flow. |
| User Search | Public-profile filtered search exists. | No explicit anti-enumeration/risk throttles beyond generic limits; transport mismatch on mobile calls. | Search abuse guardrails (rate, query entropy checks, telemetry) and consistent authenticated/anonymous behavior contract. |
| User Following | Follow create/delete/check + notification preference APIs exist. | Mobile-web auth mismatch causes follow/follower state drift and likely 401/retry loops. | Shared SDK contract + deterministic optimistic-update rollback rules with realtime sync. |
| ATC (Access Token/Code) | Web has `event_access_tokens` and share-link token flows. | Mobile enter-code relies on `event_share_links.short_code` (not present in schema); drop-in route assumes `event_access_tokens.attendee_id` which schema lacks. | Single ATC model with explicit fields (`token/code`, owner/attendee mapping, expiry/revocation), cross-app parity and migration. |

## State Coverage Audit Summary
| State | Current Condition | Launch Readiness |
|---|---|---|
| Empty | Present in many UI screens | Partial |
| Loading | Present in many UI screens | Partial |
| Error | Present, but often generic and non-recoverable | Partial |
| Retry | Inconsistent; not standardized for payment/drop-in critical paths | Blocked |
| Offline | No coherent offline strategy for mobile transactional actions | Blocked |
| Re-auth | Cookie/Bearer split causes inconsistent re-auth behavior | Blocked |
| Reconciliation | No explicit cross-domain reconciliation jobs for webhook/data drift | Blocked |

## Mobile vs Web vs Admin Control Plane
- Web: richest functional coverage but major payment/drop-in hardening gaps.
- Admin: solid announcement/permission primitives, but critical unauthenticated event mutation endpoints exist.
- Mobile: broad UI coverage, but multiple contract mismatches block real-world completion of core flows.

## Product-Design "Flawless" Requirements Still Missing
1. One canonical contract per domain (notifications, payment fulfillment, drop-in actions, ATC codes) with versioning.
2. User-safe transactional UX states for `pending`, `retry`, `reconciled`, `failed-permanent`.
3. Operator-grade observability: delivery funnels, replay counters, drift dashboard, per-domain SLO alerts.
4. Cross-app parity tests for every core journey (attendee, photographer, admin, support).
