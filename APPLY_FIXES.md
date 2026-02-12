# FaceFindr Production Fixes - Implementation Guide

## How to Apply These Fixes

All fix files are provided in the `fixes/` directory. Apply them as follows:

---

## 1. Replace `turbo.json` (Root)

**Why:** Current file uses deprecated `pipeline` key, should use `tasks`

```bash
cp fixes/turbo.json turbo.json
```

**Or manually change:**
```diff
- "pipeline": {
+ "tasks": {
```

---

## 2. Replace `apps/web/next.config.js`

**Why:** Adds standalone output for Docker, security headers, CSP

```bash
cp fixes/apps/web/next.config.js apps/web/next.config.js
```

---

## 3. Replace `apps/admin/next.config.js`

**Why:** Adds standalone output for Docker, stricter CSP for admin

```bash
cp fixes/apps/admin/next.config.js apps/admin/next.config.js
```

---

## 4. Add `apps/admin/src/app/api/health/route.ts`

**Why:** Missing health check endpoint for monitoring

```bash
mkdir -p apps/admin/src/app/api/health
cp fixes/apps/admin/src/app/api/health/route.ts apps/admin/src/app/api/health/route.ts
```

---

## 5. Add `apps/web/Dockerfile`

**Why:** Required for Docker deployment

```bash
cp fixes/apps/web/Dockerfile apps/web/Dockerfile
```

---

## 6. Add `apps/admin/Dockerfile`

**Why:** Required for Docker deployment

```bash
cp fixes/apps/admin/Dockerfile apps/admin/Dockerfile
```

---

## 7. Add `docker-compose.yml` (Root)

**Why:** Enables full Docker stack deployment

```bash
cp fixes/docker-compose.yml docker-compose.yml
```

---

## 8. Add `apps/mobile/eas.json`

**Why:** Required for Expo EAS builds

```bash
cp fixes/apps/mobile/eas.json apps/mobile/eas.json
```

---

## 9. Add `apps/web/vercel.json`

**Why:** Optimizes Vercel deployment, sets function timeouts

```bash
cp fixes/apps/web/vercel.json apps/web/vercel.json
```

---

## 10. Add `apps/admin/vercel.json`

**Why:** Optimizes Vercel deployment for admin

```bash
cp fixes/apps/admin/vercel.json apps/admin/vercel.json
```

---

## 11. Add `.github/workflows/ci-cd.yml`

**Why:** Enables automated CI/CD pipeline

```bash
mkdir -p .github/workflows
cp fixes/.github/workflows/ci-cd.yml .github/workflows/ci-cd.yml
```

---

## 12. Replace `.env.example` with Production Template

**Why:** Current example may have been committed with real-ish values

```bash
cp fixes/.env.production.example .env.example
```

---

## Quick Apply Script

Create and run this script from the repo root:

```bash
#!/bin/bash
# apply-fixes.sh

set -e

echo "Applying FaceFindr production fixes..."

# Root configs
cp fixes/turbo.json turbo.json
cp fixes/docker-compose.yml docker-compose.yml
cp fixes/.env.production.example .env.example

# Web app
cp fixes/apps/web/next.config.js apps/web/next.config.js
cp fixes/apps/web/Dockerfile apps/web/Dockerfile
cp fixes/apps/web/vercel.json apps/web/vercel.json

# Admin app
cp fixes/apps/admin/next.config.js apps/admin/next.config.js
cp fixes/apps/admin/Dockerfile apps/admin/Dockerfile
cp fixes/apps/admin/vercel.json apps/admin/vercel.json
mkdir -p apps/admin/src/app/api/health
cp fixes/apps/admin/src/app/api/health/route.ts apps/admin/src/app/api/health/route.ts

# Mobile app
cp fixes/apps/mobile/eas.json apps/mobile/eas.json

# CI/CD
mkdir -p .github/workflows
cp fixes/.github/workflows/ci-cd.yml .github/workflows/ci-cd.yml

echo "✅ All fixes applied!"
echo ""
echo "Next steps:"
echo "1. Generate new ADMIN_JWT_SECRET: openssl rand -hex 32"
echo "2. Rotate all other secrets (Supabase, Stripe, AWS)"
echo "3. Create .env.local files for each app"
echo "4. Test locally: pnpm dev"
echo "5. Deploy to Vercel"
```

---

## Secret Rotation Commands

```bash
# Generate new ADMIN_JWT_SECRET
openssl rand -hex 32

# AWS - Create new access key via CLI
aws iam create-access-key --user-name facefindr-rekognition

# Stripe - Roll keys via Dashboard
# https://dashboard.stripe.com/apikeys

# Supabase - Regenerate via Dashboard
# https://supabase.com/dashboard/project/_/settings/api
```

---

## Verification After Fixes

```bash
# 1. Install dependencies
pnpm install

# 2. Build shared package
pnpm --filter @facefind/shared build

# 3. Type check everything
pnpm type-check

# 4. Run locally
pnpm dev

# 5. Test health endpoints
curl http://localhost:3000/api/health
curl http://localhost:3001/api/health
```
