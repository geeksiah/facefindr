# Mobile Emulator Stability Runbook

## Scope
This runbook validates Android emulator stability for the Ferchr mobile app with canonical branding and creator-role navigation.

## Required AVD Profiles
1. `Medium Phone` - Android 16 (API 36.1) - Google APIs image.

## Resource Waiver
1. Baseline Pixel 8 API 34 and Pixel 5 API 33 profiles are deferred for this workstation due local disk/download constraints.
2. Stability validation is approved on `Medium Phone API 36.1` for this release cycle.
3. When resources are available, rerun the same matrix on API 34/API 33 and append results.

## Environment Setup
1. Install dependencies: `pnpm install`.
2. Start backend/web API reachable from emulator.
3. Set `EXPO_PUBLIC_API_URL` if not using localhost.
4. Start mobile app: `pnpm --filter @ferchr/mobile dev`.

### API URL Normalization
- Android emulator localhost requests are normalized to `10.0.2.2`.
- Example expected local API base: `http://10.0.2.2:3000`.
- Custom API hosts from `EXPO_PUBLIC_API_URL` are used as provided (with trailing slash normalization).

## Smoke Matrix (Execute on Required AVD)
1. Auth: sign in/sign up as `creator` and as `attendee`.
2. Event view: open event details and navigate media lists.
3. Upload path: creator upload flow from dashboard.
4. Face scan: run attendee scan and verify result screen renders.
5. Checkout start: initiate checkout from matched media.
6. Notifications: open notifications list, mark read, return.
7. Drop-in discover/upload: run discover list and upload entry points.
8. Deep links: open `ferchr://...` and legacy `facefindr://...` URLs.
9. Repeat run after emulator cold boot to confirm no warm-cache-only behavior.

## Pass/Fail Criteria
Pass only if all criteria hold for the required AVD:
1. No app crashes.
2. No blank screens during tested flows.
3. No unhandled fetch/network errors in logs.
4. Role-based navigation routes creator and attendee correctly.
5. Deep links resolve to expected routes for canonical and legacy schemes.

## Recording Results
Log results in `audit/release-gate-matrix.md` under:
- `MB1 Android Emulator Stability`
- Include tested AVD name, date, and any defects.
- Include waiver note: `API 34/33 deferred due local resource constraints`.
