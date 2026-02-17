# Ferchr Launch Gate Audit
Date: 2026-02-17
Auditor: Codex
Branch: `main`
Commit audited: `9871825e`

## Verdict
- Decision: `NO-GO` for real-user launch sign-off in this environment.
- Reason: automated code/build gates are now passing, but required MB1 runtime smoke evidence is still missing and production-env readiness items remain.

## Scope
- Web app (`apps/web`)
- Admin app (`apps/admin`)
- Mobile app (`apps/mobile`)
- Shared package (`packages/shared`)

## Evidence Summary

### 1. Commit and push state
- `git log -1 --oneline --decorate`:
  - `9871825e (HEAD -> main, origin/main) Fix launch blockers: mobile TS errors, web/admin build stability, QR/event regressions`

### 2. CI verify gate (current HEAD)
- Command: `pnpm run ci:verify`
- Result: `PASS`
- Includes:
  - `pnpm --filter @facefind/web build` -> pass
  - `pnpm --filter @facefind/admin build` -> pass
  - `pnpm --filter @ferchr/mobile type-check` -> pass

### 3. Targeted quality checks
- `pnpm --filter @facefind/web lint -- --quiet` -> `PASS`
- `pnpm --filter @facefind/admin type-check` -> `PASS`
- `pnpm --filter @ferchr/mobile lint` -> `PASS with warnings` (`631 warnings`, `0 errors`)

## Blockers Cleared
1. Mobile TypeScript hard errors in attendee profile/vault are fixed.
2. Web/admin React runtime build mismatch (`ReactCurrentDispatcher`) is fixed.
3. Corrupted dependency state (`caniuse-lite`) repaired; web build is stable.
4. Next build worker spawn `EPERM` issues mitigated via worker-thread build config.

## What Is Left Before Real-User GO
1. MB1 runtime smoke evidence is still missing for commit `9871825e`.
   - Required by `audit/release-gate-matrix.md` and `docs/MOBILE_EMULATOR_STABILITY.md`.
   - Must record pass/fail for auth, event view, upload/scan, checkout start, notifications, deep links, and cold boot.
2. Payments env readiness is incomplete in current local env context.
   - Build logs still warn: `STRIPE_SECRET_KEY is not set. Stripe payments will not work.`
   - For launch with payments enabled, production secrets must be verified.
3. Admin build logs emit non-fatal revalidation URL warnings:
   - `http://localhost:undefined?key=undefined&method=revalidateTag...`
   - Build passes, but this indicates runtime revalidation config/env should be validated before launch.

## Recommended Final Launch Checklist (Tomorrow)
1. Execute MB1 smoke on `Medium Phone API 36.1` and paste run log into `audit/release-gate-matrix.md`.
2. Validate production secrets (`Stripe`, `PayPal/Flutterwave` if used, Supabase keys) in deploy environment.
3. Run one live-like sanity pass after deploy:
   - Web attendee flow (`/s/...` -> `/e/...`, QR download+scan, mobile web layout),
   - Admin pricing/storage operations,
   - Mobile release build startup + face scan + event join path.
