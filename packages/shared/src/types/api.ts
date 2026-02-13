/**
 * FaceFindr API Types
 * Request/Response types for all API endpoints
 */

import type {
  Event,
  EventPricing,
  Media,
  Photographer,
  Subscription,
  SubscriptionPlan,
  Wallet,
} from './database';

// ============================================
// AUTHENTICATION
// ============================================

export interface RegisterRequest {
  email: string;
  password: string;
  display_name?: string;
  business_name?: string;
}

export interface RegisterResponse {
  user_id: string;
  message: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  session_token: string;
  user: Pick<Photographer, 'id' | 'email' | 'display_name' | 'business_name'>;
}

export interface AttendeeRegisterRequest {
  email: string;
  password: string;
  display_name?: string;
  username: string;
}

export interface AttendeeRegisterResponse {
  user_id: string;
  face_tag: string;
  message: string;
}

// ============================================
// SUBSCRIPTION
// ============================================

export interface SubscriptionResponse {
  subscription: Subscription | null;
  limits: PlanLimits;
}

export interface CreateCheckoutSessionRequest {
  plan: SubscriptionPlan;
  success_url: string;
  cancel_url: string;
}

export interface CreateCheckoutSessionResponse {
  checkout_url: string;
}

// ============================================
// EVENTS
// ============================================

export interface CreateEventRequest {
  name: string;
  description?: string;
  event_date?: string;
  location?: string;
  is_public?: boolean;
}

export interface CreateEventResponse {
  event_id: string;
  access_url: string;
}

export interface UpdateEventRequest {
  name?: string;
  description?: string;
  event_date?: string;
  location?: string;
  is_public?: boolean;
  face_recognition_enabled?: boolean;
  live_mode_enabled?: boolean;
  status?: 'active' | 'closed';
}

export interface EventListResponse {
  events: EventWithStats[];
  total: number;
  page: number;
  per_page: number;
}

export interface EventWithStats extends Event {
  photo_count: number;
  face_scan_count: number;
  revenue: number;
}

export interface EventDetailResponse {
  event: Event;
  pricing: EventPricing | null;
  stats: EventStats;
}

export interface EventStats {
  photo_count: number;
  unique_attendees: number;
  face_scans: number;
  downloads: number;
  revenue: number;
  conversion_rate: number;
}

// ============================================
// ACCESS TOKENS
// ============================================

export interface CreateAccessTokenRequest {
  role: 'attendee';
  label?: string;
  expires_at?: string;
}

export interface CreateAccessTokenResponse {
  token: string;
  access_url: string;
  qr_code_data: string;
}

// ============================================
// MEDIA
// ============================================

export interface InitiateUploadRequest {
  filename: string;
  content_type: string;
  file_size: number;
}

export interface InitiateUploadResponse {
  media_id: string;
  upload_url: string;
  fields?: Record<string, string>;
}

export interface CompleteUploadRequest {
  media_id: string;
}

export interface MediaListResponse {
  media: MediaWithFaces[];
  total: number;
  page: number;
  per_page: number;
}

export interface MediaWithFaces extends Media {
  preview_url: string;
  faces: FaceDetection[];
}

export interface FaceDetection {
  face_id: string;
  bounding_box: BoundingBox;
  confidence: number;
}

export interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

// ============================================
// FACE SCANNING
// ============================================

export interface FaceScanResponse {
  matched_media: MatchedMedia[];
  total_matches: number;
  scan_id: string;
}

export interface MatchedMedia {
  media_id: string;
  preview_url: string;
  match_confidence: number;
  is_purchased: boolean;
  price: number | null;
}

// ============================================
// MONETIZATION
// ============================================

export interface ConnectWalletResponse {
  redirect_url: string;
}

export interface WalletStatusResponse {
  wallet: Wallet | null;
  can_accept_payments: boolean;
}

export interface SetPricingRequest {
  price_per_media: number;
  unlock_all_price?: number;
  currency?: string;
  is_free?: boolean;
}

export interface CreatePaymentIntentRequest {
  media_ids?: string[];
  unlock_all?: boolean;
}

export interface CreatePaymentIntentResponse {
  checkout_url: string;
  session_id: string;
}

// ============================================
// ENTITLEMENTS & DOWNLOADS
// ============================================

export interface EntitlementsResponse {
  media_ids: string[];
  has_unlock_all: boolean;
}

export interface DownloadResponse {
  download_url: string;
  expires_at: string;
}

// ============================================
// ANALYTICS
// ============================================

export interface EventAnalyticsResponse {
  event_id: string;
  period: 'day' | 'week' | 'month' | 'all';
  views: number;
  unique_visitors: number;
  face_scans: number;
  downloads: number;
  revenue: number;
  conversion_rate: number;
  device_breakdown: DeviceBreakdown;
  daily_stats: DailyStat[];
}

export interface DeviceBreakdown {
  ios: number;
  android: number;
  web: number;
}

export interface DailyStat {
  date: string;
  views: number;
  scans: number;
  downloads: number;
  revenue: number;
}

export interface PhotographerDashboardResponse {
  total_events: number;
  active_events: number;
  total_photos: number;
  total_revenue: number;
  pending_payout: number;
  recent_sales: RecentSale[];
}

export interface RecentSale {
  event_id: string;
  event_name: string;
  amount: number;
  currency: string;
  created_at: string;
}

// ============================================
// PLAN LIMITS
// ============================================

export interface PlanLimits {
  photos_per_event: number;
  active_events: number;
  face_ops_per_event: number;
  retention_days: number;
  face_recognition_enabled: boolean;
  priority_processing: boolean;
  api_access: boolean;
}

// ============================================
// COMMON
// ============================================

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginationParams {
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface SuccessResponse {
  success: true;
  message?: string;
}

// ============================================
// RUNTIME CONFIG
// ============================================

export interface PlanFeature {
  featureCode: string;
  featureName: string;
  featureType: 'limit' | 'boolean' | 'numeric' | 'text';
  value: number | boolean | string;
  category: string;
}

export interface PlanDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  planType: 'photographer' | 'drop_in';
  isActive: boolean;
  prices: Record<string, number>;
  features: PlanFeature[];
}

export interface CurrencyRule {
  code: string;
  name: string;
  symbol: string;
  symbolPosition: 'before' | 'after';
  decimalPlaces: number;
  countries: string[];
  isActive: boolean;
}

export interface CountryGatewayConfig {
  countryCode: string;
  paymentGateways: string[];
  communicationGateways: {
    email: { enabled: boolean; provider: string | null };
    sms: { enabled: boolean; provider: string | null };
    whatsapp: { enabled: boolean; provider: string | null };
    push: { enabled: boolean; provider: string | null };
  };
}

export interface RuntimeSettingsVersion {
  version: string;
  updatedAt: string;
}
