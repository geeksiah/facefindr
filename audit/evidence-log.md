# Evidence Log

Date: 2026-02-15
Environment: local workspace (`c:\\Users\\abbas\\Documents\\facefindr`)

## Commands Run (This Remediation Pass)
1. `git status --short`
2. Contract/mismatch scans via `rg -n ...` across `apps/mobile`, `apps/web`, `apps/admin`
3. Targeted file inspection (`Get-Content`) for:
- checkout, faces/search, notifications, social follow, drop-in discover/process, webhook handlers
4. Type checks:
- `pnpm --filter @facefind/web type-check`
- `pnpm --filter @facefind/admin type-check`
- `pnpm --filter @facefindr/mobile type-check`
- `pnpm type-check`
5. Lint checks:
- `pnpm --filter @facefindr/mobile lint -- --quiet`
- `pnpm --filter @facefind/web lint -- --quiet`
- `pnpm --filter @facefind/admin lint -- --quiet`
- `pnpm lint`
6. Build checks:
- `pnpm build`
7. Dependency recovery for broken Next binary links:
- `pnpm install` (failed due prepare script spawn permissions)
- `pnpm install --ignore-scripts`
- `pnpm install --force --ignore-scripts`
- `pnpm install --force --ignore-scripts --prefer-offline=false`
8. Additional targeted verification (current pass):
- `pnpm --filter @facefind/web type-check`
- `pnpm --filter @facefind/admin type-check`
- `pnpm --filter @facefind/web lint -- --quiet`
- `pnpm --filter @facefind/admin lint -- --quiet`
9. Additional announcement lifecycle verification:
- `pnpm --filter @facefind/admin type-check`
- `pnpm --filter @facefind/admin lint -- --quiet`
- `pnpm type-check`
- `pnpm build` (after dependency rehydrate with `pnpm install --force --ignore-scripts`)
10. H10 normalization verification (current pass):
- `pnpm --filter @facefind/web type-check`
- `pnpm --filter @facefind/web lint -- --quiet`
- `pnpm --filter @facefindr/mobile type-check`
- `pnpm --filter @facefindr/mobile lint -- --quiet`
- `pnpm --filter @facefind/admin lint -- --quiet`
- `pnpm build`
- `pnpm type-check`
11. Environment resilience actions (current pass):
- Rehydrated intermittent broken Next package links by removing broken `next@14.2.35...` virtual-store folder and running `pnpm install --force --ignore-scripts`, then re-ran build/type-check.

## Verification Results
| Check | Result | Evidence |
|---|---|---|
| `pnpm --filter @facefind/web type-check` | Pass | `tsc --noEmit` completed |
| `pnpm --filter @facefind/admin type-check` | Pass | `tsc --noEmit` completed |
| `pnpm --filter @facefindr/mobile type-check` | Pass | `tsc --noEmit` completed |
| `pnpm type-check` | Pass | turbo run type-check successful |
| `pnpm --filter @facefindr/mobile lint -- --quiet` | Pass | no errors |
| `pnpm --filter @facefind/web lint -- --quiet` | Pass | no errors, warnings only |
| `pnpm --filter @facefind/admin lint -- --quiet` | Pass | no errors, warnings only |
| `pnpm lint` | Pass | workspace lint completed; warning debt remains |
| `pnpm build` | Pass | web/admin/shared build succeeded |
| `pnpm --filter @facefind/web lint -- --quiet` | Pass | no errors |
| `pnpm --filter @facefind/web type-check` | Pass | `tsc --noEmit` completed |
| `pnpm --filter @facefindr/mobile lint -- --quiet` | Pass | no errors |
| `pnpm --filter @facefindr/mobile type-check` | Pass | `tsc --noEmit` completed |

## Key Implemented Artifacts
- `apps/web/src/lib/payments/webhook-ledger.ts`
- `supabase/migrations/050_webhook_idempotency_and_dropin_payment_refs.sql`
- `supabase/migrations/051_idempotency_and_payout_concurrency.sql`
- `supabase/migrations/052_announcement_delivery_lifecycle.sql`
- `supabase/migrations/053_event_time_model_normalization.sql`
- `apps/web/src/lib/payments/payout-service.ts`
- `apps/admin/src/lib/jwt-secret.ts`
- `apps/admin/src/lib/auth.ts`
- `apps/admin/src/middleware.ts`
- `apps/admin/src/lib/announcement-delivery.ts`
- `apps/web/src/lib/events/time.ts`
- `apps/mobile/src/lib/date.ts`
- `apps/admin/src/app/api/admin/announcements/route.ts`
- `apps/admin/src/app/api/admin/announcements/[id]/send/route.ts`
- `apps/admin/src/app/(dashboard)/announcements/page.tsx`
- Hardened/updated APIs across:
  - `apps/web/src/app/api/webhooks/*`
  - `apps/web/src/app/api/checkout/route.ts`
  - `apps/web/src/app/api/faces/search/route.ts`
  - `apps/web/src/app/api/notifications/route.ts`
  - `apps/web/src/app/api/drop-in/process/route.ts`
  - `apps/web/src/app/api/cron/payouts/route.ts`
  - `apps/admin/src/app/api/admin/events/[id]/settings/route.ts`
  - `apps/admin/src/app/api/admin/events/[id]/cover/route.ts`
- Mobile parity updates across:
  - `apps/mobile/app/checkout.tsx`
  - `apps/mobile/app/face-scan.tsx`
  - `apps/mobile/app/photo/[id].tsx`
  - `apps/mobile/app/social/following.tsx`
  - `apps/mobile/app/social/followers.tsx`
  - `apps/mobile/app/(attendee)/profile.tsx`
  - `apps/mobile/app/(photographer)/profile.tsx`
  - `apps/mobile/app/(attendee)/notifications.tsx`
  - `apps/mobile/app/(photographer)/notifications.tsx`
  - `apps/mobile/src/stores/notifications-store.ts`
- Time-model updates across:
  - `apps/web/src/app/(dashboard)/dashboard/events/actions.ts`
  - `apps/web/src/app/api/events/[id]/settings/route.ts`
  - `apps/admin/src/app/api/admin/events/[id]/settings/route.ts`
  - `apps/mobile/app/create-event.tsx`
  - `apps/mobile/app/(attendee)/events.tsx`
  - `apps/mobile/app/(photographer)/events.tsx`
  - `apps/mobile/app/(photographer)/upload.tsx`
  - `apps/mobile/app/event/[id].tsx`
  - `apps/mobile/app/p/[slug].tsx`

## Remaining Blocking Scope (for gate)
- None (Critical/High gate blockers closed).
