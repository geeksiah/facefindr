/**
 * Verification Service
 * 
 * Handles OTP generation and verification for email and phone.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { sendNotification } from './notification-service';

// ============================================
// TYPES
// ============================================

export type VerificationType = 'email' | 'phone';

export interface VerificationSettings {
  emailVerificationEnabled: boolean;
  emailVerificationRequired: boolean;
  phoneVerificationEnabled: boolean;
  phoneVerificationRequired: boolean;
  userCanChooseVerification: boolean;
}

export interface SendOTPResult {
  success: boolean;
  expiresAt?: Date;
  error?: string;
}

export interface VerifyOTPResult {
  success: boolean;
  error?: string;
}

// ============================================
// GET VERIFICATION SETTINGS
// ============================================

let settingsCache: VerificationSettings | null = null;
let settingsCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getVerificationSettings(): Promise<VerificationSettings> {
  const now = Date.now();
  
  if (settingsCache && (now - settingsCacheTime) < CACHE_TTL) {
    return settingsCache;
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_notification_settings')
    .select('*')
    .single();

  settingsCache = {
    emailVerificationEnabled: data?.email_verification_enabled ?? true,
    emailVerificationRequired: data?.email_verification_required ?? false,
    phoneVerificationEnabled: data?.phone_verification_enabled ?? false,
    phoneVerificationRequired: data?.phone_verification_required ?? false,
    userCanChooseVerification: data?.user_can_choose_verification ?? true,
  };

  settingsCacheTime = now;
  return settingsCache;
}

// ============================================
// SEND OTP
// ============================================

export async function sendOTP(
  options: {
    userId?: string;
    email?: string;
    phone?: string;
    type: VerificationType;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<SendOTPResult> {
  const { userId, email, phone, type, ipAddress, userAgent } = options;
  const supabase = createServiceClient();

  // Validate input
  if (type === 'email' && !email) {
    return { success: false, error: 'Email is required' };
  }
  if (type === 'phone' && !phone) {
    return { success: false, error: 'Phone number is required' };
  }

  // Check rate limiting (max 5 OTPs per hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { count } = await supabase
    .from('verification_codes')
    .select('id', { count: 'exact' })
    .or(
      type === 'email' 
        ? `email.eq.${email}` 
        : `phone.eq.${phone}`
    )
    .gte('created_at', oneHourAgo);

  if ((count || 0) >= 5) {
    return { success: false, error: 'Too many verification attempts. Please try again later.' };
  }

  // Generate OTP using database function
  const { data, error } = await supabase.rpc('create_verification_code', {
    p_user_id: userId || null,
    p_type: type,
    p_email: type === 'email' ? email : null,
    p_phone: type === 'phone' ? phone : null,
    p_expiry_minutes: 10,
  });

  if (error || !data || data.length === 0) {
    return { success: false, error: error?.message || 'Failed to generate code' };
  }

  const { code, expires_at } = data[0];

  // Send OTP via appropriate channel
  if (type === 'email' && email) {
    // For email, we can use Supabase's built-in email or our notification service
    if (userId) {
      await sendNotification({
        userId,
        templateCode: 'verification_otp',
        variables: {
          otp_code: code,
          expiry_minutes: '10',
        },
        channels: ['email'],
      });
    } else {
      // For non-logged-in users, send directly
      // In production, use email service directly
      console.log(`[OTP Email] Would send to ${email}: ${code}`);
    }
  } else if (type === 'phone' && phone) {
    // Send SMS
    if (userId) {
      await sendNotification({
        userId,
        templateCode: 'verification_otp',
        variables: {
          otp_code: code,
          expiry_minutes: '10',
        },
        channels: ['sms'],
      });
    } else {
      // For non-logged-in users, send directly via SMS provider
      console.log(`[OTP SMS] Would send to ${phone}: ${code}`);
    }
  }

  // Update verification code with IP/UA
  await supabase
    .from('verification_codes')
    .update({ ip_address: ipAddress, user_agent: userAgent })
    .eq('code', code)
    .or(
      type === 'email' 
        ? `email.eq.${email}` 
        : `phone.eq.${phone}`
    );

  return { 
    success: true, 
    expiresAt: new Date(expires_at),
  };
}

// ============================================
// VERIFY OTP
// ============================================

export async function verifyOTP(
  options: {
    code: string;
    email?: string;
    phone?: string;
    userId?: string;
  }
): Promise<VerifyOTPResult> {
  const { code, email, phone, userId } = options;
  const supabase = createServiceClient();

  if (!email && !phone) {
    return { success: false, error: 'Email or phone is required' };
  }

  // Use database function to verify
  const { data, error } = await supabase.rpc('verify_code', {
    p_code: code,
    p_email: email || null,
    p_phone: phone || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data) {
    return { success: false, error: 'Invalid or expired code' };
  }

  // If we have a userId, update their verification status
  if (userId) {
    if (email) {
      // Email verification is handled by Supabase Auth
      // Just mark in our preferences table
      await supabase
        .from('user_notification_preferences')
        .upsert({
          user_id: userId,
          // email is verified through auth
        }, { onConflict: 'user_id' });
    }

    if (phone) {
      await supabase
        .from('user_notification_preferences')
        .upsert({
          user_id: userId,
          phone_number: phone,
          phone_verified: true,
          phone_verified_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    }
  }

  return { success: true };
}

// ============================================
// CHECK VERIFICATION STATUS
// ============================================

export interface VerificationStatus {
  emailVerified: boolean;
  phoneVerified: boolean;
  requiresEmailVerification: boolean;
  requiresPhoneVerification: boolean;
  canProceed: boolean;
}

export async function checkVerificationStatus(userId: string): Promise<VerificationStatus> {
  const supabase = createServiceClient();
  const settings = await getVerificationSettings();

  // Get user's email verification from auth
  const { data: authData } = await supabase.auth.admin.getUserById(userId);
  const emailVerified = authData?.user?.email_confirmed_at != null;

  // Get phone verification from preferences
  const { data: prefs } = await supabase
    .from('user_notification_preferences')
    .select('phone_verified')
    .eq('user_id', userId)
    .single();

  const phoneVerified = prefs?.phone_verified ?? false;

  // Determine requirements
  const requiresEmail = settings.emailVerificationEnabled && settings.emailVerificationRequired;
  const requiresPhone = settings.phoneVerificationEnabled && settings.phoneVerificationRequired;

  // Can proceed if all required verifications are done
  const canProceed = 
    (!requiresEmail || emailVerified) && 
    (!requiresPhone || phoneVerified);

  return {
    emailVerified,
    phoneVerified,
    requiresEmailVerification: requiresEmail && !emailVerified,
    requiresPhoneVerification: requiresPhone && !phoneVerified,
    canProceed,
  };
}

// ============================================
// RESEND OTP
// ============================================

export async function resendOTP(
  options: {
    userId?: string;
    email?: string;
    phone?: string;
    type: VerificationType;
  }
): Promise<SendOTPResult> {
  // Simply call sendOTP again - it handles rate limiting
  return sendOTP(options);
}
