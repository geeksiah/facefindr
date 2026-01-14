/**
 * FaceTag Preview API
 * 
 * GET - Preview what FaceTag will be generated for a username
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Clean and validate username
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Validation checks
    if (cleanUsername.length < 4) {
      return NextResponse.json({
        valid: false,
        error: 'Username must be at least 4 characters',
        cleanedUsername: cleanUsername,
      });
    }

    if (cleanUsername.length > 8) {
      return NextResponse.json({
        valid: false,
        error: 'Username must be at most 8 characters',
        cleanedUsername: cleanUsername.slice(0, 8),
      });
    }

    if (/^[0-9]/.test(cleanUsername)) {
      return NextResponse.json({
        valid: false,
        error: 'Username cannot start with a number',
        cleanedUsername: cleanUsername,
      });
    }

    const supabase = await createClient();

    // Check if this username has any existing users
    const { data: existingEntries, error, count } = await supabase
      .from('username_registry')
      .select('sequence_number', { count: 'exact' })
      .ilike('username', cleanUsername)
      .limit(1);

    if (error) {
      console.error('Error checking username:', error);
      return NextResponse.json(
        { error: 'Failed to check username availability' },
        { status: 500 }
      );
    }

    // Generate a sample random number for preview (1000-9999)
    const sampleNumber = Math.floor(1000 + Math.random() * 9000);
    const previewTag = `@${cleanUsername}${sampleNumber}`;
    const isFirstUser = (count || 0) === 0;

    return NextResponse.json({
      valid: true,
      cleanedUsername: cleanUsername,
      sampleNumber: sampleNumber,
      previewTag: previewTag,
      isFirstUser: isFirstUser,
      // Note: Actual number will be randomly generated and may differ
      isRandomized: true,
    });
  } catch (error) {
    console.error('FaceTag preview error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
