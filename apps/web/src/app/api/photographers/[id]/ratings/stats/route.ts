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
  const normalizedIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
  const faceTag = normalizedIdentifier.startsWith('@')
    ? normalizedIdentifier
    : `@${normalizedIdentifier}`;

  const withUserId = await supabase
    .from('photographers')
    .select('id')
    .or(
      `id.eq.${normalizedIdentifier},user_id.eq.${normalizedIdentifier},public_profile_slug.eq.${normalizedIdentifier},face_tag.eq.${faceTag}`
    )
    .limit(1)
    .maybeSingle();

  if (!withUserId.error || !isMissingColumnError(withUserId.error, 'user_id')) {
    return withUserId;
  }

  return supabase
    .from('photographers')
    .select('id')
    .or(
      `id.eq.${normalizedIdentifier},public_profile_slug.eq.${normalizedIdentifier},face_tag.eq.${faceTag}`
    )
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
    const { data: ratings, error: ratingsError } = await supabase
      .from('photographer_ratings')
      .select('rating')
      .eq('photographer_id', photographerId)
      .eq('is_public', true);

    if (ratingsError) {
      throw ratingsError;
    }

    if (!ratings || ratings.length === 0) {
      return NextResponse.json({
        average_rating: 0,
        raw_average_rating: 0,
        total_ratings: 0,
        rating_breakdown: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
        },
      });
    }

    const totalRatings = ratings.length;
    const rawAverageRating = ratings.reduce((sum, row) => sum + Number(row.rating || 0), 0) / totalRatings;
    const adjustedAverage = getAdjustedAverage(rawAverageRating, totalRatings);
    const breakdown: Record<string, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (const row of ratings) {
      const value = String(Math.max(1, Math.min(5, Number(row.rating || 0))));
      breakdown[value] = (breakdown[value] || 0) + 1;
    }

    return NextResponse.json({
      average_rating: Math.round(adjustedAverage * 100) / 100,
      raw_average_rating: Math.round(rawAverageRating * 100) / 100,
      total_ratings: totalRatings,
      rating_breakdown: breakdown,
    });

  } catch (error: any) {
    console.error('Get rating stats error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to get rating stats' },
      { status: 500 }
    );
  }
}

