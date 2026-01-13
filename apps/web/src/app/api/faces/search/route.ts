import { NextRequest, NextResponse } from 'next/server';
import { SearchFacesByImageCommand } from '@aws-sdk/client-rekognition';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { rekognitionClient } from '@/lib/aws/rekognition';

// ============================================
// FACE SEARCH API
// Search for photos matching an attendee's face
// ============================================

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { image, eventId } = await request.json();

    if (!image) {
      return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(image, 'base64');

    const serviceClient = createServiceClient();
    const matches: Array<{
      eventId: string;
      eventName: string;
      mediaId: string;
      thumbnailUrl: string;
      similarity: number;
    }> = [];

    // If specific event ID provided, search only that event
    if (eventId) {
      const collectionId = `facefindr-event-${eventId}`;

      try {
        const searchCommand = new SearchFacesByImageCommand({
          CollectionId: collectionId,
          Image: { Bytes: imageBuffer },
          MaxFaces: 100,
          FaceMatchThreshold: 80,
        });

        const searchResult = await rekognitionClient.send(searchCommand);

        if (searchResult.FaceMatches && searchResult.FaceMatches.length > 0) {
          // Get event details
          const { data: event } = await supabase
            .from('events')
            .select('name')
            .eq('id', eventId)
            .single();

          // Get media details for matches
          const mediaIds = searchResult.FaceMatches.map(m => m.Face?.ExternalImageId).filter(Boolean);
          
          const { data: mediaItems } = await serviceClient
            .from('media')
            .select('id, thumbnail_path, storage_path')
            .in('id', mediaIds);

          const mediaMap = new Map(mediaItems?.map(m => [m.id, m]) || []);

          for (const match of searchResult.FaceMatches) {
            const mediaItem = mediaMap.get(match.Face?.ExternalImageId || '');
            if (mediaItem) {
              matches.push({
                eventId,
                eventName: event?.name || 'Unknown Event',
                mediaId: mediaItem.id,
                thumbnailUrl: mediaItem.thumbnail_path || mediaItem.storage_path,
                similarity: match.Similarity || 0,
              });
            }
          }
        }
      } catch (error: any) {
        if (error.name !== 'ResourceNotFoundException') {
          console.error('Search error:', error);
        }
      }
    } else {
      // Search across all events with face recognition enabled
      const { data: events } = await supabase
        .from('events')
        .select('id, name')
        .eq('face_recognition_enabled', true)
        .eq('status', 'active');

      if (events && events.length > 0) {
        for (const event of events) {
          const collectionId = `facefindr-event-${event.id}`;

          try {
            const searchCommand = new SearchFacesByImageCommand({
              CollectionId: collectionId,
              Image: { Bytes: imageBuffer },
              MaxFaces: 50,
              FaceMatchThreshold: 80,
            });

            const searchResult = await rekognitionClient.send(searchCommand);

            if (searchResult.FaceMatches && searchResult.FaceMatches.length > 0) {
              const mediaIds = searchResult.FaceMatches.map(m => m.Face?.ExternalImageId).filter(Boolean);
              
              const { data: mediaItems } = await serviceClient
                .from('media')
                .select('id, thumbnail_path, storage_path')
                .in('id', mediaIds);

              const mediaMap = new Map(mediaItems?.map(m => [m.id, m]) || []);

              for (const match of searchResult.FaceMatches) {
                const mediaItem = mediaMap.get(match.Face?.ExternalImageId || '');
                if (mediaItem) {
                  matches.push({
                    eventId: event.id,
                    eventName: event.name,
                    mediaId: mediaItem.id,
                    thumbnailUrl: mediaItem.thumbnail_path || mediaItem.storage_path,
                    similarity: match.Similarity || 0,
                  });
                }
              }
            }
          } catch (error: any) {
            // Collection might not exist for this event
            if (error.name !== 'ResourceNotFoundException') {
              console.error('Search error for event:', event.id, error);
            }
            continue;
          }
        }
      }
    }

    // Sort by similarity
    matches.sort((a, b) => b.similarity - a.similarity);

    // Group by event
    const groupedMatches: Record<string, typeof matches> = {};
    for (const match of matches) {
      if (!groupedMatches[match.eventId]) {
        groupedMatches[match.eventId] = [];
      }
      groupedMatches[match.eventId].push(match);
    }

    return NextResponse.json({
      totalMatches: matches.length,
      matches,
      groupedMatches,
    });

  } catch (error) {
    console.error('Face search error:', error);
    return NextResponse.json(
      { error: 'Failed to search for matches' },
      { status: 500 }
    );
  }
}
