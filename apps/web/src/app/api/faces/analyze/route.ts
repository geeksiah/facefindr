export const dynamic = 'force-dynamic';

import { DetectFacesCommand } from '@aws-sdk/client-rekognition';
import { NextRequest, NextResponse } from 'next/server';

import { rekognitionClient } from '@/lib/aws/rekognition';
import { checkRateLimit, getClientIP, rateLimitHeaders, rateLimits } from '@/lib/rate-limit';
import { createClient, createClientWithAccessToken } from '@/lib/supabase/server';

function decodeBase64Image(raw: string): Uint8Array {
  const base64 = raw.includes('base64,') ? raw.split('base64,')[1] : raw;
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);
  const rateLimit = checkRateLimit(clientIP, rateLimits.faceOps);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const supabase = accessToken ? createClientWithAccessToken(accessToken) : createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const image = typeof body?.image === 'string' ? body.image : '';
    if (!image) {
      return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
    }

    const imageBytes = decodeBase64Image(image);
    const response = await rekognitionClient.send(
      new DetectFacesCommand({
        Image: { Bytes: imageBytes },
        Attributes: ['ALL'],
      })
    );

    const faces = response.FaceDetails || [];
    const primary = faces[0];

    return NextResponse.json({
      faceDetected: Boolean(primary),
      facesDetected: faces.length,
      primaryFace: primary
        ? {
            confidence: primary.Confidence || 0,
            pose: {
              yaw: primary.Pose?.Yaw || 0,
              pitch: primary.Pose?.Pitch || 0,
              roll: primary.Pose?.Roll || 0,
            },
            boundingBox: primary.BoundingBox || null,
            eyesOpen: primary.EyesOpen?.Value ?? null,
            mouthOpen: primary.MouthOpen?.Value ?? null,
          }
        : null,
    });
  } catch (error: any) {
    if (error?.name === 'InvalidImageFormatException') {
      return NextResponse.json({ error: 'Invalid image format' }, { status: 400 });
    }
    console.error('Face analyze error:', error);
    return NextResponse.json({ error: 'Failed to analyze face' }, { status: 500 });
  }
}

