/**
 * Get My Rating API
 * 
 * Get current user's rating for a photographer
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ rating: null });
    }

    const { id: photographerId } = params;

    // Check if user is an attendee
    const { data: attendee } = await supabase
      .from('attendees')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!attendee) {
      return NextResponse.json({ rating: null });
    }

    // Get user's rating
    const { data: rating, error } = await supabase
      .from('photographer_ratings')
      .select('rating, review_text, created_at')
      .eq('photographer_id', photographerId)
      .eq('attendee_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine
      throw error;
    }

    return NextResponse.json({
      rating: rating?.rating || null,
      reviewText: rating?.review_text || null,
      createdAt: rating?.created_at || null,
    });

  } catch (error: any) {
    console.error('Get my rating error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to get rating' },
      { status: 500 }
    );
  }
}
