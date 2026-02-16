/**
 * Ferchr Database Types
 * Auto-generated types should be placed here after running:
 * pnpm db:generate
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ============================================
// ENUMS
// ============================================

export type CanonicalUserRole = 'creator' | 'attendee';
export type LegacyCreatorRole = 'photographer';
export type UserRole = CanonicalUserRole | LegacyCreatorRole;
export type AccountStatus = 'active' | 'suspended' | 'pending_verification';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';
export type SubscriptionPlan = 'free' | 'starter' | 'pro' | 'studio';
export type EventStatus = 'draft' | 'active' | 'closed' | 'archived' | 'expired';
export type MediaType = 'photo' | 'video';
export type WalletProvider = 'stripe';
export type WalletStatus = 'pending' | 'active' | 'restricted';
export type EntitlementType = 'single' | 'bulk';
export type AccessTokenRole = 'event_owner' | 'attendee';

// ============================================
// CORE TABLES
// ============================================

export interface Creator {
  id: string;
  email: string;
  password_hash?: string;
  display_name: string | null;
  business_name: string | null;
  profile_photo_url: string | null;
  status: AccountStatus;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface Attendee {
  id: string;
  email: string | null;
  password_hash?: string;
  display_name: string | null;
  face_tag: string;
  face_tag_suffix: string;
  profile_photo_url: string | null;
  status: AccountStatus;
  email_verified: boolean;
  date_of_birth: string | null;
  last_face_refresh: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  photographer_id: string;
  plan_code: SubscriptionPlan;
  status: SubscriptionStatus;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  photographer_id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  location: string | null;
  event_date: string | null;
  status: EventStatus;
  is_public: boolean;
  face_recognition_enabled: boolean;
  live_mode_enabled: boolean;
  attendee_access_enabled: boolean;
  face_ops_used: number;
  face_ops_limit: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface EventAccessToken {
  id: string;
  event_id: string;
  token: string;
  role: AccessTokenRole;
  label: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface Media {
  id: string;
  event_id: string;
  storage_path: string;
  original_filename: string | null;
  media_type: MediaType;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  thumbnail_path: string | null;
  watermarked_path: string | null;
  faces_detected: number;
  faces_indexed: boolean;
  created_at: string;
  deleted_at: string | null;
}

export interface FaceEmbedding {
  id: string;
  event_id: string;
  media_id: string;
  face_id: string;
  rekognition_face_id: string;
  bounding_box: Json | null;
  confidence: number | null;
  created_at: string;
}

export interface AttendeeFaceProfile {
  id: string;
  attendee_id: string;
  rekognition_face_id: string;
  is_primary: boolean;
  source: 'initial_scan' | 'event_scan' | 'manual_update';
  confidence: number | null;
  created_at: string;
}

// ============================================
// MONETIZATION TABLES
// ============================================

export interface Wallet {
  id: string;
  photographer_id: string;
  provider: WalletProvider;
  stripe_account_id: string;
  status: WalletStatus;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  details_submitted: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventPricing {
  id: string;
  event_id: string;
  price_per_media: number;
  unlock_all_price: number | null;
  currency: string;
  is_free: boolean;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  event_id: string;
  wallet_id: string;
  attendee_id: string | null;
  attendee_email: string | null;
  stripe_payment_intent_id: string;
  stripe_checkout_session_id: string | null;
  gross_amount: number;
  platform_fee: number;
  stripe_fee: number;
  net_amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  created_at: string;
  updated_at: string;
}

export interface Entitlement {
  id: string;
  event_id: string;
  transaction_id: string;
  attendee_id: string | null;
  attendee_face_hash: string | null;
  media_id: string | null;
  entitlement_type: EntitlementType;
  created_at: string;
}

// ============================================
// CONSENT & AUDIT TABLES
// ============================================

export interface AttendeeConsent {
  id: string;
  attendee_id: string | null;
  event_id: string;
  session_id: string | null;
  consent_type: 'biometric' | 'marketing';
  consent_version: string;
  ip_address: string | null;
  user_agent: string | null;
  granted_at: string;
  withdrawn_at: string | null;
}

export interface DownloadLog {
  id: string;
  media_id: string;
  entitlement_id: string | null;
  attendee_id: string | null;
  ip_address: string | null;
  downloaded_at: string;
}

export interface AuditLog {
  id: string;
  actor_type: 'creator' | 'photographer' | 'attendee' | 'system' | 'admin';
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Json | null;
  ip_address: string | null;
  created_at: string;
}

// ============================================
// DATABASE SCHEMA TYPE
// ============================================

export interface Database {
  public: {
    Tables: {
      photographers: {
        Row: Creator;
        Insert: Omit<Creator, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Creator, 'id'>>;
      };
      attendees: {
        Row: Attendee;
        Insert: Omit<Attendee, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Attendee, 'id'>>;
      };
      subscriptions: {
        Row: Subscription;
        Insert: Omit<Subscription, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Subscription, 'id'>>;
      };
      events: {
        Row: Event;
        Insert: Omit<Event, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Event, 'id'>>;
      };
      event_access_tokens: {
        Row: EventAccessToken;
        Insert: Omit<EventAccessToken, 'id' | 'created_at'>;
        Update: Partial<Omit<EventAccessToken, 'id'>>;
      };
      media: {
        Row: Media;
        Insert: Omit<Media, 'id' | 'created_at'>;
        Update: Partial<Omit<Media, 'id'>>;
      };
      face_embeddings: {
        Row: FaceEmbedding;
        Insert: Omit<FaceEmbedding, 'id' | 'created_at'>;
        Update: Partial<Omit<FaceEmbedding, 'id'>>;
      };
      attendee_face_profiles: {
        Row: AttendeeFaceProfile;
        Insert: Omit<AttendeeFaceProfile, 'id' | 'created_at'>;
        Update: Partial<Omit<AttendeeFaceProfile, 'id'>>;
      };
      wallets: {
        Row: Wallet;
        Insert: Omit<Wallet, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Wallet, 'id'>>;
      };
      event_pricing: {
        Row: EventPricing;
        Insert: Omit<EventPricing, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<EventPricing, 'id'>>;
      };
      transactions: {
        Row: Transaction;
        Insert: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Transaction, 'id'>>;
      };
      entitlements: {
        Row: Entitlement;
        Insert: Omit<Entitlement, 'id' | 'created_at'>;
        Update: Partial<Omit<Entitlement, 'id'>>;
      };
      attendee_consents: {
        Row: AttendeeConsent;
        Insert: Omit<AttendeeConsent, 'id' | 'granted_at'>;
        Update: Partial<Omit<AttendeeConsent, 'id'>>;
      };
      download_logs: {
        Row: DownloadLog;
        Insert: Omit<DownloadLog, 'id' | 'downloaded_at'>;
        Update: Partial<Omit<DownloadLog, 'id'>>;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Omit<AuditLog, 'id' | 'created_at'>;
        Update: Partial<Omit<AuditLog, 'id'>>;
      };
    };
  };
}
