export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { 
  createLivenessSession, 
  getLivenessSessionResults,
  analyzeMultiAngleLiveness,
  isFaceLivenessAvailable,
} from '@/lib/aws/rekognition';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// FACE LIVENESS API
// SRS §3.3.1: Liveness detection to prevent photo-of-photo attacks
// ============================================

/**
 * POST - Create a new liveness session
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { mode = 'session' } = body;

    // Mode 1: Create Face Liveness session (client-side video capture)
    if (mode === 'session') {
      if (!isFaceLivenessAvailable()) {
        return NextResponse.json({ 
          error: 'Face Liveness API not available in this region',
          fallback: 'multi-angle',
        }, { status: 400 });
      }

      const { session, error } = await createLivenessSession(user.id);

      if (error || !session) {
        return NextResponse.json(
          { error: error || 'Failed to create liveness session' },
          { status: 500 }
        );
      }

      // Store session in database for tracking
      const serviceClient = createServiceClient();
      await serviceClient
        .from('audit_logs')
        .insert({
          actor_type: 'attendee',
          actor_id: user.id,
          action: 'liveness_session_created',
          resource_type: 'face_liveness',
          resource_id: null,
          metadata: { session_id: session.sessionId },
        });

      return NextResponse.json({
        sessionId: session.sessionId,
        mode: 'session',
        expiresIn: 300, // 5 minutes
      });
    }

    // Mode 2: Multi-angle image analysis (fallback)
    if (mode === 'multi-angle') {
      const { images } = body;

      if (!images || !Array.isArray(images) || images.length < 3) {
        return NextResponse.json({
          error: 'At least 3 images required for multi-angle liveness check',
          requiredAngles: [
            { name: 'center', instruction: 'Look straight at the camera' },
            { name: 'left', instruction: 'Turn your head slightly left' },
            { name: 'right', instruction: 'Turn your head slightly right' },
            { name: 'up', instruction: 'Tilt your head slightly up (optional)' },
            { name: 'down', instruction: 'Tilt your head slightly down (optional)' },
          ],
        }, { status: 400 });
      }

      // Convert base64 images to buffers
      const imageBuffers = images.map((img: string) => 
        new Uint8Array(Buffer.from(img, 'base64'))
      );

      const { isLive, confidence, error } = await analyzeMultiAngleLiveness(imageBuffers);

      if (error) {
        return NextResponse.json({ error }, { status: 400 });
      }

      // Log the liveness check
      const serviceClient = createServiceClient();
      await serviceClient
        .from('audit_logs')
        .insert({
          actor_type: 'attendee',
          actor_id: user.id,
          action: 'liveness_check_completed',
          resource_type: 'face_liveness',
          resource_id: null,
          metadata: { 
            mode: 'multi-angle',
            is_live: isLive,
            confidence,
            image_count: images.length,
          },
        });

      return NextResponse.json({
        isLive,
        confidence,
        mode: 'multi-angle',
      });
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });

  } catch (error) {
    console.error('Liveness check error:', error);
    return NextResponse.json(
      { error: 'Failed to perform liveness check' },
      { status: 500 }
    );
  }
}

/**
 * GET - Get liveness session results
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    const { result, error } = await getLivenessSessionResults(sessionId);

    if (error || !result) {
      return NextResponse.json(
        { error: error || 'Failed to get session results' },
        { status: 400 }
      );
    }

    // Log the result
    const serviceClient = createServiceClient();
    await serviceClient
      .from('audit_logs')
      .insert({
        actor_type: 'attendee',
        actor_id: user.id,
        action: 'liveness_session_completed',
        resource_type: 'face_liveness',
        resource_id: null,
        metadata: { 
          session_id: sessionId,
          is_live: result.isLive,
          confidence: result.confidence,
        },
      });

    return NextResponse.json({
      isLive: result.isLive,
      confidence: result.confidence,
      hasReferenceImage: !!result.referenceImage,
    });

  } catch (error) {
    console.error('Get liveness results error:', error);
    return NextResponse.json(
      { error: 'Failed to get liveness results' },
      { status: 500 }
    );
  }
}

