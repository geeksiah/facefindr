export const dynamic = 'force-dynamic';

import { IndexFacesCommand, DeleteFacesCommand, ListFacesCommand } from '@aws-sdk/client-rekognition';
import { NextRequest, NextResponse } from 'next/server';

import { rekognitionClient, ATTENDEE_COLLECTION_ID } from '@/lib/aws/rekognition';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// FACE PROFILE REFRESH API
// Update face profile with new images
// SRS §3.3.2: Layer 4 - Self-Declared Appearance Changes
// ============================================

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      images, 
      mode = 'add', // 'add' | 'replace'
      reason,
      promptId 
    } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: 'At least one image is required' }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    // Determine user type
    let userType: 'attendee' | 'photographer' = 'attendee';
    const { data: attendee } = await serviceClient
      .from('attendees')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!attendee) {
      const { data: photographer } = await serviceClient
        .from('photographers')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!photographer) {
        return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
      }
      userType = 'photographer';
    }

    // If replacing, get old embedding IDs first
    let oldEmbeddingIds: string[] = [];
    if (mode === 'replace') {
      const { data: oldEmbeddings } = await serviceClient
        .from('user_face_embeddings')
        .select('id, rekognition_face_id')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (oldEmbeddings) {
        oldEmbeddingIds = oldEmbeddings.map(e => e.id);

        // Delete old faces from Rekognition
        const faceIds = oldEmbeddings
          .map(e => e.rekognition_face_id)
          .filter(Boolean);

        if (faceIds.length > 0) {
          try {
            await rekognitionClient.send(new DeleteFacesCommand({
              CollectionId: ATTENDEE_COLLECTION_ID,
              FaceIds: faceIds,
            }));
          } catch (err) {
            console.warn('Failed to delete old faces from Rekognition:', err);
          }
        }

        // Deactivate old embeddings in database
        await serviceClient
          .from('user_face_embeddings')
          .update({ is_active: false })
          .eq('user_id', user.id);
      }

      // Also clear old attendee_face_profiles
      await serviceClient
        .from('attendee_face_profiles')
        .delete()
        .eq('attendee_id', user.id);
    }

    // Index new faces
    const newEmbeddingIds: string[] = [];
    const results: Array<{ success: boolean; confidence?: number; error?: string }> = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const isPrimary = i === 0;

      try {
        const imageBuffer = Buffer.from(image, 'base64');

        const indexCommand = new IndexFacesCommand({
          CollectionId: ATTENDEE_COLLECTION_ID,
          Image: { Bytes: imageBuffer },
          ExternalImageId: `${user.id}_refresh_${Date.now()}_${i}`,
          MaxFaces: 1,
          QualityFilter: isPrimary ? 'HIGH' : 'MEDIUM',
          DetectionAttributes: isPrimary ? ['ALL'] : ['DEFAULT'],
        });

        const indexResult = await rekognitionClient.send(indexCommand);

        if (!indexResult.FaceRecords || indexResult.FaceRecords.length === 0) {
          results.push({ success: false, error: 'No face detected' });
          continue;
        }

        const faceRecord = indexResult.FaceRecords[0];
        const rekognitionFaceId = faceRecord.Face?.FaceId;
        const confidence = faceRecord.Face?.Confidence || 0;

        if (!rekognitionFaceId) {
          results.push({ success: false, error: 'Failed to process' });
          continue;
        }

        // Store in user_face_embeddings
        const { data: embedding, error: insertError } = await serviceClient
          .from('user_face_embeddings')
          .insert({
            user_id: user.id,
            user_type: userType,
            rekognition_face_id: rekognitionFaceId,
            source: 'refresh',
            confidence,
            is_primary: isPrimary,
            is_active: true,
            metadata: { reason, refresh_mode: mode },
          })
          .select()
          .single();

        if (insertError) {
          results.push({ success: false, error: 'Database error' });
          continue;
        }

        newEmbeddingIds.push(embedding.id);

        // Also store in attendee_face_profiles for backward compatibility
        if (userType === 'attendee') {
          await serviceClient
            .from('attendee_face_profiles')
            .insert({
              attendee_id: user.id,
              rekognition_face_id: rekognitionFaceId,
              is_primary: isPrimary,
              source: 'manual_update',
              confidence,
            });

          // Mark as indexed in backfill status (if table exists)
          try {
            await serviceClient
              .from('face_indexing_backfill_status')
              .upsert({
                attendee_id: user.id,
                rekognition_face_id: rekognitionFaceId,
                indexed_in_global_collection: true,
                indexed_at: new Date().toISOString(),
              }, {
                onConflict: 'attendee_id,rekognition_face_id',
              });
          } catch (err) {
            // Table might not exist yet, that's okay
            console.warn('Could not update backfill status:', err);
          }
        }

        results.push({ success: true, confidence });

      } catch (err) {
        console.error(`Failed to process image ${i}:`, err);
        results.push({ success: false, error: 'Processing failed' });
      }
    }

    // Update last_face_refresh timestamp
    if (userType === 'attendee') {
      await serviceClient
        .from('attendees')
        .update({ last_face_refresh: new Date().toISOString() })
        .eq('id', user.id);
    }

    // If there was a prompt, mark it as completed
    if (promptId) {
      await serviceClient
        .from('refresh_prompts')
        .update({
          prompt_status: 'completed',
          responded_at: new Date().toISOString(),
          response: 'update_photo',
        })
        .eq('id', promptId)
        .eq('user_id', user.id);
    }

    // Log the appearance change if reason provided
    if (reason) {
      await serviceClient
        .from('appearance_changes')
        .insert({
          user_id: user.id,
          change_type: reason,
          change_mode: mode === 'replace' ? 'replace_profile' : 'add_to_profile',
          new_embedding_ids: newEmbeddingIds,
          old_embedding_ids: oldEmbeddingIds,
        });
    }

    const successCount = results.filter(r => r.success).length;

    return NextResponse.json({
      success: successCount > 0,
      processed: results.length,
      successful: successCount,
      failed: results.length - successCount,
      results,
      newEmbeddingIds,
    });

  } catch (error) {
    console.error('Face refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh face profile' },
      { status: 500 }
    );
  }
}

// Respond to a refresh prompt without updating photos
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { promptId, response } = body;

    if (!promptId || !response) {
      return NextResponse.json({ error: 'Prompt ID and response required' }, { status: 400 });
    }

    const validResponses = ['these_are_me', 'not_me', 'dismissed'];
    if (!validResponses.includes(response)) {
      return NextResponse.json({ error: 'Invalid response' }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    const { error } = await serviceClient
      .from('refresh_prompts')
      .update({
        prompt_status: response === 'dismissed' ? 'dismissed' : 'completed',
        responded_at: new Date().toISOString(),
        response,
      })
      .eq('id', promptId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Failed to update prompt:', error);
      return NextResponse.json(
        { error: 'Failed to update prompt' },
        { status: 500 }
      );
    }

    // If "these_are_me", boost confidence for recent matches
    if (response === 'these_are_me') {
      // This tells the system the matches are correct, no action needed
    }

    // If "not_me", we might want to flag recent matches for review
    if (response === 'not_me') {
      // TODO: Implement false positive flagging system
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Prompt response error:', error);
    return NextResponse.json(
      { error: 'Failed to respond to prompt' },
      { status: 500 }
    );
  }
}

