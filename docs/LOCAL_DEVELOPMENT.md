# Local Development Guide

This guide explains how to run all Ferchr applications locally for development and testing.

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator
- Supabase account with project set up

## Project Structure

```
ferchr/
├── apps/
│   ├── web/          # Main web app (photographers & attendees)
│   ├── admin/        # Admin dashboard (separate deployment)
│   └── mobile/       # React Native/Expo mobile app
├── packages/         # Shared packages
├── supabase/         # Database migrations
└── docs/             # Documentation
```

## Running All Applications

### Option 1: Using Turbo (Recommended)

Run all apps simultaneously from the root:

```bash
# Install dependencies
pnpm install

# Run all apps in development mode
pnpm dev
```

This will start:
- **Web App**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3001
- **Expo Dev Server**: http://localhost:8081

### Option 2: Run Apps Individually

Open separate terminal windows for each app:

**Terminal 1 - Web App (Port 3000)**
```bash
cd apps/web
pnpm dev
# Runs on http://localhost:3000
```

**Terminal 2 - Admin Dashboard (Port 3001)**
```bash
cd apps/admin
pnpm dev --port 3001
# Or set in package.json: "dev": "next dev -p 3001"
# Runs on http://localhost:3001
```

**Terminal 3 - Mobile App (Expo)**
```bash
cd apps/mobile
pnpm start
# Or: npx expo start
# Expo DevTools: http://localhost:8081
```

### Option 3: Custom Ports

You can specify custom ports for each app:

```bash
# Web app on port 3000
cd apps/web && PORT=3000 pnpm dev

# Admin on port 3001
cd apps/admin && PORT=3001 pnpm dev

# Expo on port 8082
cd apps/mobile && npx expo start --port 8082
```

## Environment Variables

### Web App (`apps/web/.env.local`)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# AWS Rekognition (server-side)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REKOGNITION_COLLECTION_ID=ferchr-faces

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Admin Dashboard (`apps/admin/.env.local`)

```env
# Supabase (uses SERVICE ROLE for elevated access)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT Secret for admin sessions
ADMIN_JWT_SECRET=your-secure-random-string-min-32-chars

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

### Mobile App (`apps/mobile/.env`)

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_API_URL=http://localhost:3000
```

### Android Emulator Networking Notes

1. The mobile app normalizes Android emulator localhost traffic to `10.0.2.2`.
2. If `EXPO_PUBLIC_API_URL` points to `http://localhost:3000`, Android requests resolve to `http://10.0.2.2:3000`.
3. Canonical app scheme is `ferchr://` with legacy `facefindr://` accepted during transition.

## Testing the Full Flow

### 1. Start All Services

```bash
# Terminal 1: Start Supabase locally (optional)
supabase start

# Terminal 2: Web app
cd apps/web && pnpm dev

# Terminal 3: Admin dashboard
cd apps/admin && pnpm dev --port 3001

# Terminal 4: Mobile app
cd apps/mobile && npx expo start
```

### 2. Access Points

| Application | URL | Purpose |
|-------------|-----|---------|
| Web App | http://localhost:3000 | Creator/Attendee portal |
| Admin Dashboard | http://localhost:3001 | Platform administration |
| Expo DevTools | http://localhost:8081 | Mobile app development |
| Supabase Studio | http://localhost:54323 | Database management (local) |

### 3. Test Accounts

**Admin Dashboard**
- Email: `admin@ferchr.com`
- Password: `changeme123!`

### 4. Mobile App Testing

**iOS Simulator (Mac)**
```bash
cd apps/mobile
npx expo start --ios
# Press 'i' in terminal to open iOS simulator
```

**Android Emulator**
```bash
cd apps/mobile
npx expo start --android
# Press 'a' in terminal to open Android emulator
```

**Physical Device**
1. Install Expo Go from App Store / Play Store
2. Scan the QR code shown in terminal
3. For local development, ensure your phone is on the same network

## Turbo Configuration

Update `turbo.json` for parallel development:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    }
  }
}
```

Update root `package.json`:

```json
{
  "scripts": {
    "dev": "turbo run dev",
    "dev:web": "turbo run dev --filter=web",
    "dev:admin": "turbo run dev --filter=admin",
    "dev:mobile": "cd apps/mobile && expo start",
    "build": "turbo run build",
    "lint": "turbo run lint"
  }
}
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# Kill process
kill -9 <PID>  # Mac/Linux
taskkill /PID <PID> /F  # Windows
```

### Expo Connection Issues

```bash
# Clear Expo cache
npx expo start --clear

# Use tunnel for remote testing
npx expo start --tunnel
```

### Supabase Connection Issues

```bash
# Verify Supabase is running (local)
supabase status

# Reset local database
supabase db reset
```
