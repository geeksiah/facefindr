# FaceFindr Deployment Guide

Complete guide for deploying FaceFindr to production across various hosting platforms.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   Web App    │    │    Admin     │    │     Mobile App       │  │
│  │   (Vercel)   │    │   (Vercel)   │    │  (App Store/Play)    │  │
│  │ facefindr.com│    │admin.facef...│    │                      │  │
│  └──────┬───────┘    └──────┬───────┘    └──────────┬───────────┘  │
│         │                   │                       │              │
│         └───────────────────┼───────────────────────┘              │
│                             │                                      │
│                             ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Supabase (Backend)                        │  │
│  │  • PostgreSQL Database                                       │  │
│  │  • Authentication                                            │  │
│  │  • Realtime subscriptions                                    │  │
│  │  • Storage (photos)                                          │  │
│  │  • Edge Functions                                            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌────────────────────┐  ┌────────────────────┐                   │
│  │   AWS Rekognition  │  │   Payment Gateway  │                   │
│  │   (Face Detection) │  │ (Stripe/Flutterwave│                   │
│  └────────────────────┘  └────────────────────┘                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Option 1: Vercel (Recommended for Next.js)

### Prerequisites
- Vercel account (https://vercel.com)
- GitHub/GitLab/Bitbucket repository
- Supabase project

### Deploy Web App

**1. Connect Repository**
```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy from project root
cd apps/web
vercel
```

**2. Configure Environment Variables**

In Vercel Dashboard → Project → Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=xxx
AWS_REKOGNITION_COLLECTION_ID=facefindr-faces
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_APP_URL=https://facefindr.com
```

**3. Configure Domain**
- Go to Project → Settings → Domains
- Add your custom domain (e.g., `facefindr.com`)
- Update DNS records as instructed

### Deploy Admin Dashboard (Separate Project)

**1. Create New Vercel Project**
```bash
cd apps/admin
vercel
```

**2. Configure Environment Variables**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...  # SERVICE ROLE, not anon!
ADMIN_JWT_SECRET=your-secure-random-string-64-chars
NEXT_PUBLIC_APP_URL=https://admin.facefindr.com
```

**3. Configure Domain**
- Add `admin.facefindr.com` as custom domain
- Keep this URL private/internal

### Vercel Configuration Files

**`apps/web/vercel.json`**
```json
{
  "framework": "nextjs",
  "regions": ["iad1"],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET,POST,PUT,DELETE,OPTIONS" }
      ]
    }
  ]
}
```

**`apps/admin/vercel.json`**
```json
{
  "framework": "nextjs",
  "regions": ["iad1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    }
  ]
}
```

---

## Option 2: AWS (Full Control)

### Architecture on AWS

```
                    ┌─────────────────┐
                    │   CloudFront    │
                    │      (CDN)      │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  S3 Bucket  │    │   App Runner │   │   App Runner │
│  (Static)   │    │   (Web App)  │   │   (Admin)   │
└─────────────┘    └──────┬──────┘    └──────┬──────┘
                          │                   │
                          └─────────┬─────────┘
                                    │
                          ┌─────────▼─────────┐
                          │      Supabase     │
                          │   (External DB)   │
                          └───────────────────┘
```

### Method A: AWS App Runner (Easiest)

**1. Create ECR Repository**
```bash
aws ecr create-repository --repository-name facefindr-web
aws ecr create-repository --repository-name facefindr-admin
```

**2. Build and Push Docker Images**

Create `apps/web/Dockerfile`:
```dockerfile
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker build -t facefindr-web ./apps/web
docker tag facefindr-web:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/facefindr-web:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/facefindr-web:latest
```

**3. Create App Runner Service**
```bash
aws apprunner create-service \
  --service-name facefindr-web \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/facefindr-web:latest",
      "ImageRepositoryType": "ECR"
    }
  }' \
  --instance-configuration '{
    "Cpu": "1024",
    "Memory": "2048"
  }'
```

### Method B: AWS Amplify (Simpler)

**1. Connect Repository**
- Go to AWS Amplify Console
- Click "New App" → "Host web app"
- Connect your GitHub repository

**2. Configure Build Settings**

`amplify.yml`:
```yaml
version: 1
applications:
  - frontend:
      phases:
        preBuild:
          commands:
            - npm install -g pnpm
            - pnpm install
        build:
          commands:
            - pnpm build
      artifacts:
        baseDirectory: apps/web/.next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
    appRoot: apps/web
```

**3. Set Environment Variables**
- Go to App Settings → Environment Variables
- Add all required variables

### Method C: EC2 + Load Balancer (Full Control)

**1. Launch EC2 Instance**
```bash
# Create launch template
aws ec2 create-launch-template \
  --launch-template-name facefindr-template \
  --launch-template-data '{
    "ImageId": "ami-0abcdef1234567890",
    "InstanceType": "t3.medium",
    "KeyName": "your-key-pair"
  }'
```

**2. User Data Script**
```bash
#!/bin/bash
yum update -y
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs git
npm install -g pnpm pm2

cd /home/ec2-user
git clone https://github.com/your-repo/facefindr.git
cd facefindr

# Install and build
pnpm install
pnpm build

# Start with PM2
pm2 start apps/web/node_modules/.bin/next --name "facefindr-web" -- start
pm2 startup
pm2 save
```

**3. Configure Application Load Balancer**
- Create ALB with HTTPS listener
- Add target group pointing to EC2 instances
- Configure health checks on `/api/health`

---

## Option 3: DigitalOcean

### App Platform (Easiest)

**1. Create App**
- Go to DigitalOcean → Apps → Create App
- Connect GitHub repository

**2. Configure Components**

```yaml
# .do/app.yaml
name: facefindr
region: nyc
services:
  - name: web
    source:
      repo: your-github-repo
      branch: main
      source_dir: apps/web
    build_command: pnpm install && pnpm build
    run_command: pnpm start
    http_port: 3000
    instance_count: 2
    instance_size_slug: professional-xs
    envs:
      - key: NEXT_PUBLIC_SUPABASE_URL
        value: ${SUPABASE_URL}
        scope: RUN_AND_BUILD_TIME

  - name: admin
    source:
      repo: your-github-repo
      branch: main
      source_dir: apps/admin
    build_command: pnpm install && pnpm build
    run_command: pnpm start
    http_port: 3000
    instance_count: 1
    instance_size_slug: professional-xs
```

### Droplet (Manual)

```bash
# SSH into droplet
ssh root@your-droplet-ip

# Install dependencies
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs nginx certbot python3-certbot-nginx

# Install pnpm and pm2
npm install -g pnpm pm2

# Clone and setup
git clone https://github.com/your-repo/facefindr.git
cd facefindr
pnpm install
pnpm build

# Configure Nginx
cat > /etc/nginx/sites-available/facefindr << 'EOF'
server {
    listen 80;
    server_name facefindr.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name admin.facefindr.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -s /etc/nginx/sites-available/facefindr /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# SSL with Let's Encrypt
certbot --nginx -d facefindr.com -d admin.facefindr.com

# Start apps with PM2
cd apps/web && pm2 start pnpm --name "web" -- start
cd ../admin && pm2 start "pnpm start --port 3001" --name "admin"
pm2 startup && pm2 save
```

---

## Option 4: Railway

**1. Create Project**
```bash
npm install -g @railway/cli
railway login
railway init
```

**2. Configure Services**

`railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "pnpm start",
    "healthcheckPath": "/api/health"
  }
}
```

**3. Deploy**
```bash
railway up
```

---

## Option 5: Render

**1. Create `render.yaml`**
```yaml
services:
  - type: web
    name: facefindr-web
    env: node
    region: oregon
    buildCommand: pnpm install && pnpm build
    startCommand: pnpm start
    envVars:
      - key: NEXT_PUBLIC_SUPABASE_URL
        sync: false
      - key: NODE_ENV
        value: production

  - type: web
    name: facefindr-admin
    env: node
    region: oregon
    rootDir: apps/admin
    buildCommand: pnpm install && pnpm build
    startCommand: pnpm start
    envVars:
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
```

---

## Supabase Configuration

### Production Setup

**1. Create Production Project**
- Go to https://supabase.com
- Create new project in desired region
- Note down project URL and keys

**2. Run Migrations**
```bash
# Link to production project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

**3. Configure Auth**
- Go to Authentication → URL Configuration
- Set Site URL: `https://facefindr.com`
- Add Redirect URLs:
  - `https://facefindr.com/**`
  - `https://admin.facefindr.com/**`
  - `facefindr://` (for mobile deep links)

**4. Enable Realtime**
```sql
-- Run in SQL Editor
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
-- etc.
```

**5. Configure Storage**
- Create buckets: `photos`, `avatars`, `event-covers`
- Set up RLS policies for each bucket

---

## Mobile App Deployment

### iOS (App Store)

**1. Build for Production**
```bash
cd apps/mobile

# Install EAS CLI
npm install -g eas-cli

# Configure
eas build:configure

# Build for iOS
eas build --platform ios --profile production
```

**2. Submit to App Store**
```bash
eas submit --platform ios
```

### Android (Play Store)

**1. Build APK/AAB**
```bash
eas build --platform android --profile production
```

**2. Submit to Play Store**
```bash
eas submit --platform android
```

### EAS Configuration

`apps/mobile/eas.json`:
```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "ios": {
        "resourceClass": "m-medium"
      },
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your@email.com",
        "ascAppId": "1234567890"
      },
      "android": {
        "serviceAccountKeyPath": "./play-store-key.json"
      }
    }
  }
}
```

---

## CI/CD Pipeline

### GitHub Actions

`.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          
      - name: Install pnpm
        run: npm install -g pnpm
        
      - name: Install dependencies
        run: pnpm install
        
      - name: Build
        run: pnpm build --filter=web
        
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: apps/web

  deploy-admin:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy Admin to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_ADMIN_PROJECT_ID }}
          working-directory: apps/admin
```

---

## Security Checklist

### Before Going Live

- [ ] All API keys are in environment variables (not code)
- [ ] Service role key only used in admin app
- [ ] Admin dashboard on separate domain
- [ ] HTTPS enabled everywhere
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Database RLS policies tested
- [ ] Webhook secrets configured
- [ ] Error tracking (Sentry) configured
- [ ] Backups enabled on Supabase
- [ ] CDN configured for static assets
- [ ] Geo-restriction configured if needed

### Environment Variable Security

| Variable | Where to Use | Security Level |
|----------|--------------|----------------|
| `SUPABASE_ANON_KEY` | Web, Mobile | Public (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin only | **SECRET** - Server only |
| `STRIPE_SECRET_KEY` | Web API routes | **SECRET** - Server only |
| `AWS_SECRET_ACCESS_KEY` | Web API routes | **SECRET** - Server only |
| `ADMIN_JWT_SECRET` | Admin only | **SECRET** - Server only |

---

## Monitoring & Logging

### Vercel
- Built-in analytics at vercel.com/analytics
- Logs at vercel.com/logs

### AWS
- CloudWatch for logs and metrics
- X-Ray for distributed tracing

### Recommended Tools
- **Sentry**: Error tracking
- **LogRocket**: Session replay
- **Datadog**: Full observability

---

## Cost Estimates

| Platform | Web + Admin | Database | Total/Month |
|----------|-------------|----------|-------------|
| Vercel (Pro) | $40 | Supabase Pro $25 | ~$65 |
| AWS (App Runner) | $50-100 | Supabase Pro $25 | ~$75-125 |
| DigitalOcean | $24-48 | Supabase Pro $25 | ~$50-75 |
| Railway | $20-50 | Supabase Pro $25 | ~$45-75 |
| Render | $25-50 | Supabase Pro $25 | ~$50-75 |

*Note: Costs vary based on traffic. Mobile app hosting is via app stores (free for basic).*
