/**
 * FaceTag Claim API
 * 
 * POST - Claim a FaceTag for the authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { username, userType } = body;

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    if (!userType || !['attendee', 'photographer'].includes(userType)) {
      return NextResponse.json(
        { error: 'Valid user type is required' },
        { status: 400 }
      );
    }

    // Clean and validate username
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (cleanUsername.length < 4) {
      return NextResponse.json({
        success: false,
        error: 'Username must be at least 4 characters',
      });
    }

    if (cleanUsername.length > 8) {
      return NextResponse.json({
        success: false,
        error: 'Username must be at most 8 characters',
      });
    }

    if (/^[0-9]/.test(cleanUsername)) {
      return NextResponse.json({
        success: false,
        error: 'Username cannot start with a number',
      });
    }

    // Check if user already has a FaceTag
    const { data: existingTag } = await supabase
      .from('username_registry')
      .select('face_tag')
      .eq('user_id', user.id)
      .single();

    if (existingTag) {
      return NextResponse.json({
        success: false,
        error: 'You already have a FaceTag',
        existingTag: existingTag.face_tag,
      });
    }

    // Generate a random unique number for this username
    let randomNumber: number;
    let faceTag: string;
    let attempts = 0;
    const maxAttempts = 100;

    // Keep trying until we find a unique number
    while (attempts < maxAttempts) {
      randomNumber = Math.floor(1000 + Math.random() * 9000);
      faceTag = `@${cleanUsername}${randomNumber}`;

      // Check if this FaceTag already exists
      const { data: existing } = await supabase
        .from('username_registry')
        .select('id')
        .eq('face_tag', faceTag)
        .limit(1);

      if (!existing || existing.length === 0) {
        break;
      }

      attempts++;
    }

    // If still not found after max attempts, use 5-digit number
    if (attempts >= maxAttempts) {
      randomNumber = Math.floor(10000 + Math.random() * 90000);
      faceTag = `@${cleanUsername}${randomNumber}`;
    }

    // Insert into registry
    const { error: insertError } = await supabase
      .from('username_registry')
      .insert({
        username: cleanUsername,
        sequence_number: randomNumber!,
        user_id: user.id,
        user_type: userType,
        face_tag: faceTag!,
      });

    if (insertError) {
      // Handle race condition - someone else claimed this number
      if (insertError.code === '23505') {
        // Retry with a new random number
        let retryNumber: number;
        let retryTag: string;
        
        for (let i = 0; i < 10; i++) {
          retryNumber = Math.floor(1000 + Math.random() * 9000);
          retryTag = `@${cleanUsername}${retryNumber}`;
          
          const { error: retryError } = await supabase
            .from('username_registry')
            .insert({
              username: cleanUsername,
              sequence_number: retryNumber,
              user_id: user.id,
              user_type: userType,
              face_tag: retryTag,
            });

          if (!retryError) {
            // Update user's profile with the FaceTag
            const table = userType === 'photographer' ? 'photographers' : 'attendees';
            await supabase
              .from(table)
              .update({ face_tag: retryTag, username: cleanUsername })
              .eq('user_id', user.id);

            return NextResponse.json({
              success: true,
              faceTag: retryTag,
              username: cleanUsername,
              number: retryNumber,
            });
          }
        }
        
        return NextResponse.json(
          { error: 'Failed to claim FaceTag. Please try again.' },
          { status: 500 }
        );
      }

      console.error('Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to claim FaceTag' },
        { status: 500 }
      );
    }

    // Update user's profile with the FaceTag
    const table = userType === 'photographer' ? 'photographers' : 'attendees';
    await supabase
      .from(table)
      .update({ face_tag: faceTag!, username: cleanUsername })
      .eq('user_id', user.id);

    return NextResponse.json({
      success: true,
      faceTag: faceTag!,
      username: cleanUsername,
      number: randomNumber!,
    });
  } catch (error) {
    console.error('FaceTag claim error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
