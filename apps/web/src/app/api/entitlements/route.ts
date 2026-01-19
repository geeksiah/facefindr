/**
 * Entitlements API
 * 
 * Check and manage photo access entitlements.
 */

import { NextRequest, NextResponse } from 'next/server';

import { 
  checkEntitlement, 
  getAttendeeEntitlements,
  generateDownloadToken,
  Resolution 
} from '@/lib/delivery';
import { createClient } from '@/lib/supabase/server';

// GET - Get entitlements or check specific photo access
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mediaId = searchParams.get('mediaId');
    const eventId = searchParams.get('eventId');
    const resolution = (searchParams.get('resolution') || 'web') as Resolution;

    // If mediaId provided, check specific access
    if (mediaId) {
      const access = await checkEntitlement(user.id, mediaId, resolution);
      return NextResponse.json(access);
    }

    // Otherwise, get all entitlements
    const entitlements = await getAttendeeEntitlements(user.id, eventId || undefined);
    return NextResponse.json({ entitlements });

  } catch (error) {
    console.error('Entitlements GET error:', error);
    return NextResponse.json(
      { error: 'Failed to check entitlements' },
      { status: 500 }
    );
  }
}

// POST - Request download token
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { mediaId, resolution = 'web' } = body;

    if (!mediaId) {
      return NextResponse.json(
        { error: 'Media ID is required' },
        { status: 400 }
      );
    }

    const ipAddress = request.ip || request.headers.get('x-forwarded-for') || undefined;
    
    const result = await generateDownloadToken(
      user.id,
      mediaId,
      resolution as Resolution,
      ipAddress
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      downloadUrl: result.token?.downloadUrl,
      expiresAt: result.token?.expiresAt,
    });

  } catch (error) {
    console.error('Entitlements POST error:', error);
    return NextResponse.json(
      { error: 'Failed to generate download' },
      { status: 500 }
    );
  }
}
