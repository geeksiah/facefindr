export const dynamic = 'force-dynamic';

/**
 * Secure Download API
 * 
 * Validates download token and streams the file to the user.
 */

import { NextRequest, NextResponse } from 'next/server';

import { validateAndUseToken, getSignedDownloadUrl } from '@/lib/delivery';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token;
    const ipAddress = request.ip || request.headers.get('x-forwarded-for') || undefined;

    // Validate token
    const validation = await validateAndUseToken(token, ipAddress);

    if (!validation.isValid || !validation.filePath) {
      return NextResponse.json(
        { error: validation.error || 'Invalid download link' },
        { status: 403 }
      );
    }

    // Get signed URL for the file
    const signedUrl = await getSignedDownloadUrl(validation.filePath);

    if (!signedUrl.success || !signedUrl.url) {
      return NextResponse.json(
        { error: signedUrl.error || 'Failed to generate download' },
        { status: 500 }
      );
    }

    // Redirect to the signed URL
    return NextResponse.redirect(signedUrl.url);

  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: 'Download failed' },
      { status: 500 }
    );
  }
}

