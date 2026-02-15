# Data Sync and Contract Report

Date: 2026-02-14

Update (2026-02-15): Cross-app contract mismatches for mobile notifications payload shape, mobile checkout/face-scan endpoint paths, and drop-in discover notification identity were remediated. Current open sync-related blockers are tracked in `audit/release-gate-matrix.md`.

## 1) Canonical Source-of-Truth Map
| Domain Entity | Canonical Source | Consumers |
|---|---|---|
| Notifications | `notifications` table + web notification service DTO (`subject/body/status/read_at/metadata/channel`) | web APIs/SSE, admin announcement queue, mobile (currently drifted) |
| Transactions/Fulfillment | `transactions` + provider webhooks | web checkout, billing UIs, payout balance view |
| Entitlements | `entitlements` table | gallery access, download checks |
| Drop-In upload/match/notify | `drop_in_photos`, `drop_in_matches`, `drop_in_notifications` | web dashboard/gallery + mobile drop-in screens |
| Plans | subscription tables + `getAllPlans/getPlanByCode` | web billing, admin pricing, mobile runtime consumers |
| Currency | `supported_currencies`, `exchange_rates` | runtime currency endpoint + client formatters |
| ATC/share access | `event_access_tokens` and `event_share_links` | web event sharing/join and mobile enter-code (drift) |
| Social graph | `follows` + profile tables | web/mobile social screens |
| Face identity | face embedding/profile tables | face scan/search/refresh/drop-in match |

## 2) Contract Mismatch Report
| ID | Contract Area | Producer | Consumer | Mismatch |
|---|---|---|---|---|
| M1 | Notification payload | Backend canonical fields | Mobile store/screens | Mobile expects `title/message/read/is_read/data`; backend emits/stores `subject/body/read_at/metadata/status/channel`. |
| M2 | Notification update API | `/api/notifications` marks via service functions | Mobile direct Supabase table updates | Mobile writes `is_read/read` columns; canonical path uses `read_at` and status transitions. |
| M3 | Face scan API | Web supports `/api/faces/search` with `image` payload | Mobile calls `/api/face/match` with `imageBase64` | Route + payload mismatch. |
| M4 | Checkout API | Web exposes `/api/checkout` | Mobile calls `/api/checkout/create` | Route mismatch. |
| M5 | Pricing field name | DB uses `event_pricing.price_per_media` | Mobile queries `single_photo_price` | Field mismatch. |
| M6 | Drop-in action identifier | Discover returns `matchId` (`drop_in_matches.id`) | Mobile sends as `notificationId` to notifications route | Identifier type mismatch. |
| M7 | ATC code model | Web uses tokenized `event_access_tokens.token` and `event_share_links.token` | Mobile expects `event_share_links.short_code` | Column absent in schema; incompatible onboarding flow. |
| M8 | Drop-in registration lookup | Schema says `event_access_tokens` has no `attendee_id` | Drop-in process route queries `attendee_id` | Runtime query mismatch. |
| M9 | Auth transport | Most web APIs use cookie session in `createClient()` | Mobile sends bearer token or no auth | Cross-app auth divergence causes inconsistent sync/state refresh. |
| M10 | Announcement status semantics | Admin marks announcement `sent` after enqueue | Users/operators expect delivery truth | State transition does not reflect delivery outcome. |

## 3) Drift Scenarios and Recovery Procedure Gaps
| Drift Scenario | Current Behavior | Recovery Gap |
|---|---|---|
| Replayed webhook | Handlers re-run without durable event dedupe | No event-ledger replay quarantine or reconcile job |
| Duplicate checkout submit | Metadata scan may miss races | No deterministic idempotent response backed by unique key |
| Mobile notification read | Mobile writes legacy columns | Read-state drift between web/mobile/admin |
| Drop-in payment success | Webhook writes non-UUID external ID to UUID column | Payment can stay pending; no repair job |
| Announcement dispatch | Marked sent before real delivery | No per-channel retry/dead-letter reconciliation |
| Payout dual run | Multiple workers can process same wallet | No lease/lock or idempotent payout claim |

## 4) Consistency Guarantees (Current vs Required)
| Domain | Current Declared/Observed | Required Launch Guarantee |
|---|---|---|
| Payments | Eventual and replay-prone | Exactly-once externally visible fulfillment per provider event |
| Notifications | Mixed eventual consistency + schema drift | Eventual consistency with single canonical contract and bounded lag |
| Drop-In | Eventual, trigger-based, non-idempotent | Queue-backed eventual consistency with dedupe and retry semantics |
| Plans/Currency runtime | Poll/SSE with non-stable versioning | Stable monotonic version and fail-closed cache policy |
| Social follow counts | API + DB updates, transport mismatch on mobile | Eventual sync with verified auth parity and conflict handling |

## 5) Sync SLO + Monitoring Requirements
1. Notification sync lag p95 < 10s across web/mobile for create/read transitions.
2. Webhook processing idempotency: replayed event side effects delta must be 0.
3. Checkout duplicate-submit rate with same idempotency key: exactly 1 transaction and stable replay response.
4. Drop-in processing duplicate job rate: 0 duplicate `drop_in_matches` rows for same face tuple.
5. Runtime config propagation (plans/currency): p95 < 30s to clients; monotonic version checks.
6. Payout batch safety: no duplicate payouts per wallet+period identity key.

## 6) Data Sync Verdict
- Verdict: `NO-GO` until contracts are unified and drift recovery/reconciliation mechanisms are implemented for payment, notifications, and drop-in.
