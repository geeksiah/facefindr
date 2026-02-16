# Ferchr Production Release Gate Matrix

Date: 2026-02-15
Policy: Critical + High are hard blockers (`Conditional Go` not allowed)

## Executive Gate
- Decision: `GO`
- Reason: Workspace `type-check`, `lint`, and `build` now pass for web/admin/mobile/shared after runtime/perf fixes on creator and attendee flows.
- Open blockers: `None (manual emulator smoke still required before release sign-off)`

## Baseline Snapshot (Current Run)
| Check | Result | Notes |
|---|---|---|
| `git status --short` | Dirty baseline | existing in-progress work across apps + audit docs + migrations |
| `pnpm type-check` | Pass | all workspace packages pass |
| Targeted lint (`web/admin/mobile`) | Pass (warnings) | web/admin/mobile lint run completed with warnings and no lint errors |
| `pnpm build` | Pass | turbo build completed for `@facefind/web`, `@facefind/admin`, `@facefind/shared` |

## Migration Safety Checklist
| Gate | Status | Notes |
|---|---|---|
| `RB1 Brand Cutover` | In Progress | Canonical brand is `Ferchr`; legacy `facefindr://` deep-link parsing retained for compatibility. |
| `UR1 User Type Migration` | In Progress | Canonical role is `creator`; legacy `photographer` values are normalized in app/shared and migration scripts. |
| `MB1 Android Emulator Stability` | Pending Verification | Runbook documented at `docs/MOBILE_EMULATOR_STABILITY.md`; required profile is `Medium Phone API 36.1 (Android 16)`. API 34/33 baseline deferred on this workstation due local resource constraints. |

## Scoped Replacement Policy
1. Replace exact UI/content instances of `FaceFindr` and `facefindr` with `Ferchr` and `ferchr`.
2. Rename `photographer` to `creator` only for role values, role labels, route/API namespaces, and deep-link/profile semantics.
3. Keep physical database identifiers unchanged (`photographers`, `photographer_id`, existing FK topology).

## Compatibility Window
1. Database migrations: `054_creator_user_type_compat.sql`, `055_creator_plan_type_compat.sql`, `056_actor_type_creator.sql`.
2. Legacy compatibility retained for two releases:
   1. Accepted role input: `photographer`.
   2. Legacy route namespaces: `/api/photographer/*`, `/api/photographers/*`.
   3. Legacy deep-link scheme: `facefindr://`.
3. Decommission target: remove legacy aliases after telemetry confirms no meaningful legacy traffic.

## Resolved Since Previous Gate
| ID | Status | Evidence |
|---|---|---|
| C1 Admin AuthZ | Resolved | `apps/admin/src/app/api/admin/events/[id]/settings/route.ts`, `apps/admin/src/app/api/admin/events/[id]/cover/route.ts` |
| C2 PayPal webhook signature bypass | Resolved | `apps/web/src/lib/payments/paypal.ts`, `apps/web/src/app/api/webhooks/paypal/route.ts` |
| C3 Webhook replay/idempotency ledger | Resolved | `apps/web/src/lib/payments/webhook-ledger.ts`, `supabase/migrations/050_webhook_idempotency_and_dropin_payment_refs.sql`, webhook routes |
| C4 Drop-in payment ref type mismatch | Resolved | `supabase/migrations/050_webhook_idempotency_and_dropin_payment_refs.sql` |
| C5 Public drop-in processing endpoint | Resolved | `apps/web/src/app/api/drop-in/process/route.ts`, `apps/web/src/app/api/drop-in/webhook/route.ts` |
| H2 Notification contract drift | Resolved | `apps/web/src/app/api/notifications/route.ts`, mobile notifications + store |
| H3 Mobile endpoint mismatches | Resolved | `apps/mobile/app/face-scan.tsx`, `apps/mobile/app/checkout.tsx` |
| H4 Mobile/web auth transport mismatch (targeted core routes) | Resolved | social/privacy/export + notifications/checkout/faces bearer support |
| H5 Cron fail-open | Resolved | `apps/web/src/app/api/cron/payouts/route.ts` |
| H7 Drop-in notification ID mismatch | Resolved | `apps/web/src/app/api/drop-in/discover/route.ts`, `apps/mobile/app/(attendee)/drop-in/discover.tsx`, `apps/web/src/app/(dashboard)/dashboard/drop-in/discover/page.tsx` |
| H8 Drop-in registration query mismatch | Resolved | `apps/web/src/app/api/drop-in/process/route.ts` |
| H1 Checkout idempotency | Resolved | `apps/web/src/app/api/checkout/route.ts`, `supabase/migrations/051_idempotency_and_payout_concurrency.sql` |
| H6 Payout concurrency | Resolved | `apps/web/src/lib/payments/payout-service.ts`, `supabase/migrations/051_idempotency_and_payout_concurrency.sql` |
| H9 Announcement delivery lifecycle | Resolved | `apps/admin/src/lib/announcement-delivery.ts`, `apps/admin/src/app/api/admin/announcements/route.ts`, `apps/admin/src/app/api/admin/announcements/[id]/send/route.ts`, `supabase/migrations/052_announcement_delivery_lifecycle.sql` |
| H10 Time model normalization | Resolved | `supabase/migrations/053_event_time_model_normalization.sql`, `apps/web/src/lib/events/time.ts`, event write/read/display paths across web/admin/mobile |
| H11 Admin secret hygiene | Resolved | `apps/admin/src/lib/jwt-secret.ts`, `apps/admin/src/lib/auth.ts`, `apps/admin/src/middleware.ts` |
| H12 Build/deploy readiness blocker | Resolved | Root `pnpm build` now passes for web/admin/shared after runtime/type fixes and React alias alignment. |

## Open High Blockers (Release Blocking)
- None.

## MB1 Run Log Template
Use this block for each emulator run and keep one entry per execution.

```md
### MB1 Run - [YYYY-MM-DD]
- AVD: `Medium Phone API 36.1 (Android 16)`
- Tester: `[name]`
- Build/Commit: `[hash or branch]`
- Waiver: `API 34/33 deferred due local resource constraints`

#### Smoke Results
- Auth (creator + attendee): `Pass | Fail` - [notes]
- Event view + media list: `Pass | Fail` - [notes]
- Creator upload flow: `Pass | Fail` - [notes]
- Face scan flow: `Pass | Fail` - [notes]
- Checkout start: `Pass | Fail` - [notes]
- Notifications open/read: `Pass | Fail` - [notes]
- Drop-in discover/upload entry: `Pass | Fail` - [notes]
- Deep link `ferchr://...`: `Pass | Fail` - [notes]
- Deep link `facefindr://...` (legacy): `Pass | Fail` - [notes]
- Cold boot repeat run: `Pass | Fail` - [notes]

#### Stability Criteria
- No crashes: `Pass | Fail`
- No blank screens: `Pass | Fail`
- No unhandled fetch/network errors: `Pass | Fail`
- Correct role-based routing: `Pass | Fail`
- Expected deep-link routing: `Pass | Fail`

#### Final MB1 Verdict
- MB1 Status: `Pass | Fail`
- Defects filed: `[ticket IDs or none]`
- Release impact: `[none | blocker | follow-up]`
```

## Gate Rule Outcome
- `Go`: Met.
- `No-Go`: Not met.
- `Conditional Go`: Disallowed by policy.
