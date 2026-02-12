export const dynamic = 'force-dynamic';

import { SearchFacesByImageCommand } from '@aws-sdk/client-rekognition';
import { NextRequest, NextResponse } from 'next/server';

import { rekognitionClient } from '@/lib/aws/rekognition';
import { checkRateLimit, getClientIP, rateLimitHeaders, rateLimits } from '@/lib/rate-limit';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// FACE SEARCH API
// Search for photos matching an attendee's face
// Supports both JSON and FormData formats
// ============================================

export async function POST(request: NextRequest) {
  // Rate limiting for face operations
  const clientIP = getClientIP(request);
  const rateLimit = checkRateLimit(clientIP, rateLimits.faceOps);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let imageBuffer: Buffer;
    let eventId: string | null = null;

    // Check content type to determine how to parse the request
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData (from web scan page)
      const formData = await request.formData();
      eventId = formData.get('eventId') as string | null;
      
      // Get the first image from form data
      let imageFile: File | null = null;
      for (const [key, value] of formData.entries()) {
        if (key.startsWith('image') && value instanceof File) {
          imageFile = value;
          break;
        }
      }

      if (!imageFile) {
        return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
      }

      // Convert File to Buffer
      const arrayBuffer = await imageFile.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else {
      // Handle JSON (from gallery scan page and mobile)
      const body = await request.json();
      const { image } = body;
      eventId = body.eventId || null;

      if (!image) {
        return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
      }

      // Convert base64 to buffer
      imageBuffer = Buffer.from(image, 'base64');
    }

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

          const mediaMap = new Map<string, any>((mediaItems as any[] | undefined)?.map((m: any) => [m.id, m]) || []);

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

              const mediaMap = new Map<string, any>((mediaItems as any[] | undefined)?.map((m: any) => [m.id, m]) || []);

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

