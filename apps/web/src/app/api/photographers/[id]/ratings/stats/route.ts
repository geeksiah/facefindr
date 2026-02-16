export const dynamic = 'force-dynamic';

/**
 * Creator Rating Stats API
 * 
 * Get rating statistics for a photographer
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: photographerId } = params;
    const supabase = createClient();

    // Get rating stats from materialized view or calculate
    const { data: stats, error } = await supabase
      .from('photographer_rating_stats')
      .select('average_rating, total_ratings')
      .eq('photographer_id', photographerId)
      .single();

    if (error) {
      // If materialized view doesn't exist or has no data, calculate from ratings table
      const { data: ratings } = await supabase
        .from('photographer_ratings')
        .select('rating')
        .eq('photographer_id', photographerId)
        .eq('is_public', true);

      if (!ratings || ratings.length === 0) {
        return NextResponse.json({
          average_rating: 0,
          total_ratings: 0,
          rating_breakdown: {},
        });
      }

      const totalRatings = ratings.length;
      const averageRating = ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings;

      // Calculate breakdown
      const breakdown = ratings.reduce((acc, r) => {
        acc[r.rating] = (acc[r.rating] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return NextResponse.json({
        average_rating: Math.round(averageRating * 100) / 100,
        total_ratings: totalRatings,
        rating_breakdown: breakdown,
      });
    }

    return NextResponse.json({
      average_rating: stats.average_rating || 0,
      total_ratings: stats.total_ratings || 0,
    });

  } catch (error: any) {
    console.error('Get rating stats error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to get rating stats' },
      { status: 500 }
    );
  }
}

