# FaceFindr

**Facial Recognition Photo Delivery Platform**

AI-powered platform that enables photographers to deliver event photos to attendees using facial recognition. Attendees find their photos instantly through face matching, while photographers monetize their work seamlessly.

## 🚀 Features

### For Photographers
- **Bulk Upload**: Upload thousands of photos with automatic face detection
- **Event Management**: Create and manage multiple events with custom settings
- **Monetization**: Set per-photo pricing or "unlock all" bundles
- **Analytics**: Track views, downloads, and revenue in real-time
- **Payouts**: Receive payments directly via Stripe Connect

### For Attendees
- **Instant Face Matching**: Find all photos of yourself in seconds
- **FaceTag Identity**: Unique identifier for automatic photo delivery across events
- **Photo Passport**: Share your FaceTag with photographers for automatic matching
- **Photo Timeline**: Unified gallery of all your photos across events
- **Photo Drop**: Real-time notifications when new photos match your face

## 🛠 Tech Stack

### Web Application
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **State**: React Query + Zustand
- **Forms**: React Hook Form + Zod

### Mobile Application
- **Framework**: React Native + Expo
- **Navigation**: Expo Router
- **Styling**: NativeWind (Tailwind for RN)

### Backend
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage
- **Edge Functions**: Supabase Edge Functions

### External Services
- **Facial Recognition**: AWS Rekognition
- **Payments**: Stripe Connect + Billing
- **Hosting**: Vercel (Web) + Expo EAS (Mobile)

## 📁 Project Structure

```
facefind/
├── apps/
│   ├── web/                 # Next.js web application
│   │   ├── src/
│   │   │   ├── app/         # App router pages
│   │   │   ├── components/  # React components
│   │   │   ├── hooks/       # Custom React hooks
│   │   │   ├── lib/         # Utilities & clients
│   │   │   └── styles/      # Global styles
│   │   └── public/          # Static assets
│   │
│   └── mobile/              # React Native (Expo) app
│       ├── app/             # Expo Router screens
│       └── src/             # Components, hooks, lib
│
├── packages/
│   ├── shared/              # Shared types, constants, utilities
│   │   └── src/
│   │       ├── types/       # TypeScript interfaces
│   │       ├── constants/   # App constants
│   │       └── utils/       # Helper functions
│   │
│   └── ui/                  # Shared UI components (future)
│
├── supabase/                # Database migrations & config
│   └── migrations/          # SQL migration files
│
├── docs/                    # Documentation
└── turbo.json              # Turborepo configuration
```

## 🏁 Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Supabase CLI
- Expo CLI (for mobile development)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/facefind.git
   cd facefind
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   ```

4. **Set up Supabase**
   ```bash
   # Start local Supabase
   supabase start
   
   # Run migrations
   supabase db push
   ```

5. **Start development servers**
   ```bash
   # Start all apps
   pnpm dev
   
   # Or start individually
   pnpm dev:web     # Web app at http://localhost:3000
   pnpm dev:mobile  # Mobile app with Expo
   ```

### Required External Services

1. **Supabase**: Create a project at [supabase.com](https://supabase.com)
2. **Stripe**: Get API keys from [dashboard.stripe.com](https://dashboard.stripe.com)
3. **AWS**: Set up Rekognition access in [AWS Console](https://console.aws.amazon.com)

## 📝 Available Scripts

```bash
# Development
pnpm dev              # Start all apps in development
pnpm dev:web          # Start web app only
pnpm dev:mobile       # Start mobile app only

# Building
pnpm build            # Build all packages
pnpm build:web        # Build web app only

# Code Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Fix ESLint errors
pnpm type-check       # Run TypeScript check
pnpm format           # Format with Prettier

# Database
pnpm db:generate      # Generate TypeScript types
pnpm db:push          # Push schema changes
pnpm db:studio        # Open Supabase Studio
pnpm db:migrate       # Run migrations

# Testing
pnpm test             # Run tests
pnpm test:coverage    # Run tests with coverage
```

## 🗄 Database Schema

Key tables:

- `photographers` - Photographer accounts
- `attendees` - Attendee accounts with FaceTag
- `subscriptions` - SaaS subscription state
- `events` - Photo events/galleries
- `media` - Uploaded photos
- `face_embeddings` - AWS Rekognition references
- `transactions` - Payment records
- `entitlements` - Download access grants

## 🔐 Authentication Flow

1. **Photographers**: Email/password + optional social login
2. **Attendees**: Email/password, social login, or anonymous event access
3. **Session**: JWT tokens via Supabase Auth, 30-day expiry

## 💳 Monetization

- **Subscriptions**: Starter ($15), Pro ($39), Studio ($99)
- **Attendee Payments**: Per-photo or unlock-all pricing
- **Platform Fees**: 10-20% based on plan
- **Print Sales**: Direct platform revenue (future)

## 🔒 Security & Compliance

- GDPR, CCPA, BIPA compliant
- Biometric consent required before face scanning
- Data encryption at rest and in transit
- Event-scoped face data isolation
- No cross-event matching without explicit consent

## 📱 Mobile App

The mobile app (React Native/Expo) supports:

**For Photographers:**
- Event management
- Photo uploads from camera roll
- Sales tracking
- Push notifications for new sales

**For Attendees:**
- QR code scanning for event access
- Face scanning via camera
- Photo browsing & purchase
- Photo Passport management
- Photo Drop notifications

## 🚢 Deployment

### Web (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Mobile (Expo EAS)

```bash
# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

## 📖 Documentation

- [Software Requirements Specification](./docs/SRS.md)
- [System Architecture](./docs/ARCHITECTURE.md)
- [API Documentation](./docs/API.md)
- [Database Schema](./docs/DATABASE.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a pull request

## 📄 License

Proprietary - All rights reserved.

---

Built with ❤️ by the FaceFindr Team
