# Ferchr Launch Gate Audit
Date: 2026-02-17
Auditor: Codex
Branch: `main`
Commit audited: `04ddfbc1`

## Verdict
- Decision: `NO-GO` for final real-user launch sign-off from this environment.
- Reason: automated build/type gates are passing after blocker fixes, but required runtime smoke evidence (MB1) is still missing and launch env readiness has unresolved warnings.

## Scope
- Web app (`apps/web`)
- Admin app (`apps/admin`)
- Mobile app (`apps/mobile`)

## Evidence Summary

### 1. Commit and push state
- `git log -1 --oneline --decorate`
  - `807605a6 (HEAD -> main, origin/main) Fix launch blockers across web event, search, drop-in pricing, and QR UX`
- `git push origin main`
  - `main -> main` successful

### 2. Build/type gates (current HEAD)
- `pnpm --filter @facefind/web build` -> `PASS`
- `pnpm --filter @facefind/admin build` -> `PASS` (with warnings)
- `pnpm --filter @ferchr/mobile type-check` -> `PASS`
- `pnpm --filter @facefind/web lint -- --quiet` -> `PASS`
- `pnpm --filter @facefind/admin type-check` -> `PASS`
- `pnpm --filter @ferchr/mobile lint` -> `PASS with warnings` (`631 warnings`, `0 errors`)

### 3. CI verify command status
- `pnpm run ci:verify` -> timed out in this shell session due command timeout limit, but the three underlying checks were rerun individually and all passed:
  - web build pass
  - admin build pass
  - mobile type-check pass

## Blockers Cleared in `807605a6`
1. Event public page access/lookup hardening (slug fallback and preview path).
2. Drop-in pricing resolution now reads admin plan configuration (with legacy fallback).
3. Event gallery URL loading/lightbox behavior fixed (blank thumbs/open failures addressed).
4. Social search relevance and exact FaceTag matching improved; suggestion routing corrected.
5. Creator connections API no longer false-fails with `Not a photographer` for valid creators.
6. Lightbox overlay now portals to `document.body` to avoid top-gap clipping.
7. QR download UX now shows loading state; QR logo export path hardened.
8. Dashboard mobile responsiveness tuned for event management pages.

## Remaining Launch Risks (Blocking Real-User GO)
1. MB1 runtime smoke evidence is still missing for commit `807605a6`.
   - Required by `audit/release-gate-matrix.md` and `docs/MOBILE_EMULATOR_STABILITY.md`.
   - Must include auth, event view, upload/scan, checkout start, notifications, deep links, and cold boot repeat.
2. Payment env readiness not confirmed in launch env.
   - Web build warning persists in local run: `STRIPE_SECRET_KEY is not set. Stripe payments will not work.`
3. Admin revalidation env/config warning still appears during build:
   - `TypeError: Failed to parse URL from http://localhost:undefined?key=undefined&method=revalidateTag...`
   - Build passes, but this must be verified in production-config context.
4. Mobile dependency doctor could not be executed in this offline-restricted session:
   - `expo doctor` unsupported via local CLI; `npx expo-doctor` failed due cached-only registry access.

## Required Final Steps Before GO
1. Run MB1 on `Medium Phone API 36.1` and record results in `audit/release-gate-matrix.md`.
2. Validate production secrets/config for payments and revalidation endpoints.
3. Run one post-deploy live sanity sweep:
   - Web attendee flow (`/s/...` -> `/e/...`, QR download + scan, mobile web layout),
   - Admin pricing/settings paths,
   - Mobile release build cold boot + scan + event link open.

## Progressive Gate Pass #2 (Remaining Modules)
Run date: `2026-02-17`  
Audited commit: `04ddfbc1`

### Automated Gate Evidence
- `pnpm run ci:verify` -> `PASS`
  - web build pass
  - admin build pass
  - mobile type-check pass
- `pnpm test` -> `PASS` with `0` tests executed (no runnable test tasks configured)
- `pnpm type-check` -> `PASS` across all workspace packages
- `pnpm lint` -> `PASS` with warnings (no lint errors)

### Progressive Module Matrix
| Outcome Area | Status | Evidence |
|---|---|---|
| Creator account + identity + event CRUD | `PARTIAL` | Core routes compile and build, but runtime smoke still missing |
| Creator subscriptions + plan activation | `BLOCKED` | Checkout route creates Stripe subscription session, but Stripe webhook handler does not process subscription lifecycle writes to `subscriptions` |
| Creator watermark protection for paid previews | `BLOCKED` | Watermark service is explicitly placeholder and returns original URL |
| Creator collaborator invites/permission workflow | `PARTIAL` | Permissions exist, but invite notification dispatch is still TODO |
| Creator connections/facetag add flow | `PARTIAL` | Route resolves creator identity, but has fail-open path when table is missing (`success` returned) |
| Attendee privacy/search/follow basics | `PARTIAL` | API wiring exists, but no runtime proof in this pass; user-reported regressions still need live confirmation |
| Attendee face search + event-linked retrieval | `RISK` | Face search supports event-bound mode, but no-event mode searches all active face-enabled events (privacy/consistency risk for strict linkage requirement) |
| Attendee vault upgrade + billing | `BLOCKED` | Vault subscribe sets Stripe metadata `type=storage_subscription`, but reviewed webhook handler has no storage-subscription activation branch |
| Drop-In capture/process/notify pipeline | `PARTIAL` | Upload + process + notify routes exist; production async depends on webhook + process secret wiring |
| Drop-In sender lifecycle state integrity | `RISK` | Current model exposes payment/processing/notification states but not full required sender lifecycle (`sent/searching/found/awaiting response/accepted/rejected/failed`) |
| Notifications/realtime | `PARTIAL` | Main notifications API and SSE route exist; legacy attendee notifications route still returns empty placeholder |
| System assurance (security/stability/payment consistency) | `NO-GO` | Build passes, but critical runtime contract gaps and env warnings remain |

### Hard Blockers Found in Code
1. Watermark enforcement is not production-grade.
   - `apps/web/src/lib/watermark/watermark-service.ts:164`
   - `apps/web/src/lib/watermark/watermark-service.ts:186`
   - `apps/web/src/lib/watermark/watermark-service.ts:197`
2. Stripe webhook does not handle creator subscription activation writes.
   - `apps/web/src/app/api/subscriptions/checkout/route.ts:135`
   - `apps/web/src/app/api/webhooks/stripe/route.ts:59`
3. Vault paid subscription activation path is incomplete in reviewed webhook.
   - `apps/web/src/app/api/vault/subscribe/route.ts:115`
   - `apps/web/src/app/api/webhooks/stripe/route.ts:118`
4. Collaborator invite notification not implemented.
   - `apps/web/src/app/api/events/[id]/collaborators/route.ts:230`
5. Creator connections API has fail-open behavior when table is missing.
   - `apps/web/src/app/api/photographers/connections/route.ts:135`
6. Face search can run cross-event when `eventId` omitted (strict attendee-event linkage not guaranteed).
   - `apps/web/src/app/api/faces/search/route.ts:137`
7. Legacy attendee notifications endpoint is still placeholder.
   - `apps/web/src/app/api/attendee/notifications/route.ts:20`

### Environment/Runtime Risks Still Open
1. `STRIPE_SECRET_KEY is not set. Stripe payments will not work.` warning still appears in gate output.
2. Admin build still logs revalidation URL parsing errors with undefined env values.
3. MB1 emulator smoke for this audited commit is not yet recorded.

### Progressive Pass #2 Verdict
- Decision: `NO-GO`
- Reason: compile/build gates pass, but core production assurances requested (payment lifecycle correctness, watermark enforcement, strict identity/event linkage, and complete drop-in state integrity) are not yet satisfied with current runtime evidence and codepath coverage.
