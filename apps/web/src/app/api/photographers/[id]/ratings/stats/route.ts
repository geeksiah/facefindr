export const dynamic = 'force-dynamic';

/**
 * Creator Rating Stats API
 * 
 * Get rating statistics for a photographer
 */

import { NextRequest, NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';

const PRIOR_MEAN = 4.0;
const MIN_CONFIDENCE_COUNT = 5;

function isMissingColumnError(error: any, columnName: string) {
  return error?.code === '42703' && typeof error?.message === 'string' && error.message.includes(columnName);
}

function getAdjustedAverage(rawAverage: number, totalRatings: number) {
  if (totalRatings <= 0) return 0;
  return (
    (rawAverage * totalRatings + PRIOR_MEAN * MIN_CONFIDENCE_COUNT) /
    (totalRatings + MIN_CONFIDENCE_COUNT)
  );
}

async function resolvePhotographerByIdentifier(supabase: any, identifier: string) {
  const withUserId = await supabase
    .from('photographers')
    .select('id')
    .or(`id.eq.${identifier},user_id.eq.${identifier}`)
    .limit(1)
    .maybeSingle();

  if (!withUserId.error || !isMissingColumnError(withUserId.error, 'user_id')) {
    return withUserId;
  }

  return supabase
    .from('photographers')
    .select('id')
    .eq('id', identifier)
    .maybeSingle();
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: photographerIdentifier } = params;
    const supabase = createServiceClient();

    const { data: photographer } = await resolvePhotographerByIdentifier(
      supabase,
      photographerIdentifier
    );

    if (!photographer) {
      return NextResponse.json({
        average_rating: 0,
        raw_average_rating: 0,
        total_ratings: 0,
        rating_breakdown: {},
      });
    }
    const photographerId = photographer.id;

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
          raw_average_rating: 0,
          total_ratings: 0,
          rating_breakdown: {},
        });
      }

      const totalRatings = ratings.length;
      const rawAverageRating = ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings;
      const adjustedAverage = getAdjustedAverage(rawAverageRating, totalRatings);

      // Calculate breakdown
      const breakdown = ratings.reduce((acc, r) => {
        acc[r.rating] = (acc[r.rating] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return NextResponse.json({
        average_rating: Math.round(adjustedAverage * 100) / 100,
        raw_average_rating: Math.round(rawAverageRating * 100) / 100,
        total_ratings: totalRatings,
        rating_breakdown: breakdown,
      });
    }

    const rawAverageRating = Number(stats.average_rating || 0);
    const totalRatings = Number(stats.total_ratings || 0);
    const adjustedAverage = getAdjustedAverage(rawAverageRating, totalRatings);

    return NextResponse.json({
      average_rating: Math.round(adjustedAverage * 100) / 100,
      raw_average_rating: rawAverageRating,
      total_ratings: totalRatings,
    });

  } catch (error: any) {
    console.error('Get rating stats error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to get rating stats' },
      { status: 500 }
    );
  }
}

