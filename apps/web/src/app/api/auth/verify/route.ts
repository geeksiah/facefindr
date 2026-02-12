export const dynamic = 'force-dynamic';

/**
 * Verification API
 * 
 * Send and verify OTP codes for email and phone verification.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  sendOTP,
  verifyOTP,
  getVerificationSettings,
  checkVerificationStatus,
} from '@/lib/notifications';
import { checkRateLimit, getClientIP, rateLimitHeaders, rateLimits } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

// GET - Get verification settings and status
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const settings = await getVerificationSettings();
    let status: Awaited<ReturnType<typeof checkVerificationStatus>> | null = null;

    if (user) {
      status = await checkVerificationStatus(user.id);
    }

    return NextResponse.json({
      settings: {
        emailEnabled: settings.emailVerificationEnabled,
        emailRequired: settings.emailVerificationRequired,
        phoneEnabled: settings.phoneVerificationEnabled,
        phoneRequired: settings.phoneVerificationRequired,
        userCanChoose: settings.userCanChooseVerification,
      },
      status,
    });

  } catch (error) {
    console.error('Verify GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get verification settings' },
      { status: 500 }
    );
  }
}

// POST - Send or verify OTP
export async function POST(request: NextRequest) {
  // Rate limiting for auth operations
  const clientIP = getClientIP(request);
  const rateLimit = checkRateLimit(clientIP, rateLimits.auth);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();
    const { action, type, email, phone, code } = body;

    // Get client info
    const ipAddress = request.ip || request.headers.get('x-forwarded-for') || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    if (action === 'send') {
      // Send OTP
      if (!type || (type === 'email' && !email) || (type === 'phone' && !phone)) {
        return NextResponse.json(
          { error: 'Type and email/phone are required' },
          { status: 400 }
        );
      }

      const result = await sendOTP({
        userId: user?.id,
        email: type === 'email' ? email : undefined,
        phone: type === 'phone' ? phone : undefined,
        type,
        ipAddress,
        userAgent,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        expiresAt: result.expiresAt,
        message: type === 'email' 
          ? 'Verification code sent to your email'
          : 'Verification code sent to your phone',
      });
    }

    if (action === 'verify') {
      // Verify OTP
      if (!code || (!email && !phone)) {
        return NextResponse.json(
          { error: 'Code and email/phone are required' },
          { status: 400 }
        );
      }

      const result = await verifyOTP({
        code,
        email,
        phone,
        userId: user?.id,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Invalid or expired code' },
          { status: 400 }
        );
      }

      // Get updated status
      let status: Awaited<ReturnType<typeof checkVerificationStatus>> | null = null;
      if (user) {
        status = await checkVerificationStatus(user.id);
      }

      return NextResponse.json({
        success: true,
        verified: true,
        status,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "send" or "verify"' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Verify POST error:', error);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}

