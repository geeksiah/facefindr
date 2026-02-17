# Ferchr Launch Gate Audit
Date: 2026-02-17
Auditor: Codex
Branch: `main`
Commit audited: `807605a6`

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
