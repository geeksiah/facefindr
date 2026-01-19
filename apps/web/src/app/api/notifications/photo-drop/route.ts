import { NextRequest, NextResponse } from 'next/server';

import { searchFacesByImage } from '@/lib/aws/rekognition';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// PHOTO DROP NOTIFICATION API
// SRS §6.4: Push notifications when photos match attendees
// ============================================

interface MatchResult {
  attendeeId: string;
  similarity: number;
  mediaId: string;
}

/**
 * POST - Process uploaded photos and queue notifications
 * Called internally after photo upload with face detection
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { eventId, mediaIds } = body;

    if (!eventId || !mediaIds || !Array.isArray(mediaIds)) {
      return NextResponse.json({ 
        error: 'eventId and mediaIds array required' 
      }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    // Verify photographer owns this event
    const { data: event, error: eventError } = await serviceClient
      .from('events')
      .select('id, photographer_id, name, live_mode_enabled, face_recognition_enabled')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (event.photographer_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    if (!event.face_recognition_enabled) {
      return NextResponse.json({ 
        message: 'Face recognition not enabled for this event',
        matchCount: 0,
        notificationCount: 0,
      });
    }

    // Get all registered attendees with face profiles
    const { data: attendeesWithFaces } = await serviceClient
      .from('attendee_face_profiles')
      .select(`
        attendee_id,
        rekognition_face_id,
        attendees!inner(id, face_tag)
      `)
      .eq('is_primary', true);

    if (!attendeesWithFaces || attendeesWithFaces.length === 0) {
      return NextResponse.json({ 
        message: 'No registered attendees to match against',
        matchCount: 0,
        notificationCount: 0,
      });
    }

    // Get face embeddings for the uploaded photos
    const { data: mediaFaces } = await serviceClient
      .from('face_embeddings')
      .select('media_id, rekognition_face_id')
      .in('media_id', mediaIds);

    if (!mediaFaces || mediaFaces.length === 0) {
      return NextResponse.json({ 
        message: 'No faces detected in uploaded photos',
        matchCount: 0,
        notificationCount: 0,
      });
    }

    // Match faces using pre-registered face collection
    const matches: MatchResult[] = [];

    // For each media, check if any faces match registered attendees
    for (const mediaFace of mediaFaces) {
      // Get the media image for searching
      const { data: media } = await serviceClient
        .from('media')
        .select('storage_path')
        .eq('id', mediaFace.media_id)
        .single();

      if (!media) continue;

      // Download image and search against attendee collection
      try {
        const { data: imageData } = await serviceClient.storage
          .from('photos')
          .download(media.storage_path);

        if (imageData) {
          const imageBytes = new Uint8Array(await imageData.arrayBuffer());
          
          // Search against attendee face collection
          const searchResult = await searchFacesByImage(
            'attendees', // Use attendee collection
            imageBytes,
            50, // Max matches
            85  // High threshold for accurate matching
          );

          for (const match of searchResult.matches) {
            // Find which attendee this face belongs to
            const attendee = attendeesWithFaces.find(
              a => a.rekognition_face_id === match.faceId
            );

            if (attendee) {
              matches.push({
                attendeeId: attendee.attendee_id,
                similarity: match.similarity,
                mediaId: mediaFace.media_id,
              });
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to search faces for media ${mediaFace.media_id}:`, err);
      }
    }

    // Insert matches into photo_drop_matches
    if (matches.length > 0) {
      const matchInserts = matches.map(m => ({
        event_id: eventId,
        media_id: m.mediaId,
        attendee_id: m.attendeeId,
        similarity: m.similarity,
        notified: false,
      }));

      await serviceClient
        .from('photo_drop_matches')
        .upsert(matchInserts, {
          onConflict: 'event_id,media_id,attendee_id',
          ignoreDuplicates: true,
        });
    }

    // Queue notifications using database function
    const { data: notificationResult } = await serviceClient
      .rpc('process_photo_matches_for_notification', {
        p_event_id: eventId,
        p_media_ids: mediaIds,
      });

    return NextResponse.json({
      success: true,
      matchCount: matches.length,
      uniqueAttendees: new Set(matches.map(m => m.attendeeId)).size,
      notificationCount: notificationResult || 0,
      isLiveMode: event.live_mode_enabled,
    });

  } catch (error) {
    console.error('Photo drop processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process photo drops' },
      { status: 500 }
    );
  }
}

/**
 * GET - Get pending photo drops for current user
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    const serviceClient = createServiceClient();

    // Get pending photo drops
    const { data: drops, error } = await serviceClient
      .rpc('get_pending_photo_drops', {
        p_attendee_id: user.id,
        p_event_id: eventId || null,
      });

    if (error) {
      console.error('Get pending drops error:', error);
      return NextResponse.json(
        { error: 'Failed to get pending photo drops' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      drops: drops || [],
      totalPending: drops?.reduce((sum: number, d: any) => sum + (d.match_count || 0), 0) || 0,
    });

  } catch (error) {
    console.error('Get photo drops error:', error);
    return NextResponse.json(
      { error: 'Failed to get photo drops' },
      { status: 500 }
    );
  }
}
