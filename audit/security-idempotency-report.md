# Security and Idempotency Report

Date: 2026-02-14
Method: Static code + schema audit, baseline command verification

Update (2026-02-15): Critical security findings from this report were remediated (admin authz boundaries, webhook verification enforcement, webhook replay ledger, drop-in process auth lock). Remaining high-severity open items are summarized in `audit/release-gate-matrix.md`.

## 1) Threat Model: Critical Surfaces
1. AuthN/AuthZ on mutating endpoints with service-role DB access.
2. Payment webhooks, replay handling, and fulfillment side effects.
3. Checkout/session creation race windows and duplicate submits.
4. Biometric + PII data access boundaries (face embeddings, notifications, export).

## 2) Endpoint Auth Matrix (High-Risk)
| Endpoint | Method | Auth Model Found | Finding |
|---|---|---|---|
| `apps/admin/src/app/api/admin/events/[id]/settings/route.ts:53` | `PUT` | None; direct `supabaseAdmin` | `Critical`: unauthenticated write path. |
| `apps/admin/src/app/api/admin/events/[id]/cover/route.ts:10` | `POST` | None; direct `supabaseAdmin` | `Critical`: unauthenticated media upload/update path. |
| `apps/admin/src/app/api/admin/events/[id]/cover/route.ts:88` | `DELETE` | None; direct `supabaseAdmin` | `Critical`: unauthenticated destructive path. |
| `apps/web/src/app/api/drop-in/process/route.ts:18` | `POST` | None; service role client | `Critical`: public processing trigger + writes. |
| `apps/web/src/app/api/wallet/verify-account/route.ts:72` | `POST` | None | `High`: unauthenticated external provider probing/spend vector. |
| `apps/web/src/app/api/cron/payouts/route.ts:23` | `GET` | Optional bearer (`CRON_SECRET`) | `High`: fail-open if secret missing (`route.ts:29`). |
| `apps/web/src/app/api/webhooks/paypal/route.ts:38` | `POST` | Signature attempted | `Critical`: invalid signatures processed (`route.ts:60-63`). |
| `apps/web/src/app/api/webhooks/stripe/route.ts:13` | `POST` | Signature verified | No event-ledger replay dedupe (`High/Critical` depending side effect). |
| `apps/web/src/app/api/webhooks/flutterwave/route.ts:34` | `POST` | Header hash verified | No event-ledger replay dedupe (`High`). |

## 3) Idempotency Matrix
| Operation | Current Behavior | Constraint/Guard Gap | Severity |
|---|---|---|---|
| Checkout create (`/api/checkout`) | Requires body `idempotencyKey`, scans recent pending tx metadata | No DB unique idempotency key; non-atomic insert/update split; duplicate window + `.single()` misuse | High |
| Checkout provider mapping | Uses `finalProvider` for gateway selection | Insert writes provider IDs using `provider` variable (`route.ts:482-485`) | High |
| Stripe webhook fulfillment | Updates tx by session/payment intent | No persisted event ledger or one-time processing marker | Critical |
| Flutterwave webhook fulfillment | Verifies tx then updates by `tx_ref` | No event ledger, no unique `flutterwave_tx_ref` guarantee in schema | Critical |
| PayPal webhook fulfillment | Proceeds even when signature invalid | Signature validation stub + no event ledger | Critical |
| Entitlement grant writes | Inserts on success/refund handlers | No uniqueness constraint to prevent duplicate entitlements per transaction/media | Critical |
| Drop-in upload + webhook | Upload generates server UUID but not persisted as immutable idempotency contract | Webhook lookup is pending-state based; UUID type mismatch on transaction fields | Critical |
| Payout batch | Iterates wallets, inserts payouts | No lock/lease and no unique payout identity | High |

## 4) Required Contracts Missing vs Plan
1. Missing universal mutating API `Idempotency-Key` header contract.
2. Missing webhook event ledger interface (`provider_event_id`, signature status, processing state, retries).
3. Missing one-time fulfillment semantics + deterministic replay response.
4. Missing provider reference uniqueness (`stripe_checkout_session_id`, `flutterwave_tx_ref`, `paypal_order_id`) and entitlement dedupe uniqueness.

## 5) Sensitive Data Classification Map
| Data | Classification | Current Controls | Gaps |
|---|---|---|---|
| Face IDs/embeddings (`rekognition_face_id`) | Restricted biometric | RLS present on face tables | No explicit key rotation/retention enforcement surfaced at API layer; cross-flow audit completeness unclear. |
| Gift message (`drop_in_photos.gift_message`) | Sensitive user content | Access routed through drop-in APIs | Comment says encrypted until view, but schema/API indicate plaintext handling (`039_drop_in_feature.sql:58`, discover route returns gift message). |
| Notification metadata + contact fields | Sensitive PII | RLS + preference tables | Cross-app field drift causes inconsistent read/update semantics. |
| Export requests (`data_export_requests`) | Sensitive privacy payload | RLS policies exist | Mobile auth transport mismatch can break user control paths. |
| Wallet/account verification payloads | Financial/PII | None on endpoint auth | Unauthenticated verification endpoint increases abuse risk. |

## 6) Replay/Security Test Case Status
The requested scenario suite (duplicate submits, webhook replay 2-5x, invalid signature, role escalation, etc.) is `Not Executed` in this repository snapshot because no runnable integration/e2e harness or isolated provider-mock suite is present.

Evidence:
- `package.json` exposes `turbo run test`, but repo scan found no local e2e/integration assets.
- `pnpm -r test --if-present` produced no actionable integration execution output.

This is itself a release blocker under the selected launch policy.

## 7) Security/Idempotency Release Verdict
- Verdict: `NO-GO`
- Blocking categories: auth boundary integrity, webhook authenticity/replay resistance, financial idempotency, drop-in payment data integrity.
