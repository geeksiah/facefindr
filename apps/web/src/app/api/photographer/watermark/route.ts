/**
 * Watermark Settings API
 * 
 * Manage photographer watermark configuration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { 
  getWatermarkSettings, 
  saveWatermarkSettings,
  DEFAULT_WATERMARK_SETTINGS 
} from '@/lib/watermark';

// GET - Get watermark settings
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is a photographer
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!photographer) {
      return NextResponse.json({ error: 'Not a photographer' }, { status: 403 });
    }

    const settings = await getWatermarkSettings(user.id);

    return NextResponse.json({
      settings: settings || {
        ...DEFAULT_WATERMARK_SETTINGS,
        photographerId: user.id,
      },
    });

  } catch (error) {
    console.error('Watermark GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get watermark settings' },
      { status: 500 }
    );
  }
}

// POST - Save watermark settings
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is a photographer
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!photographer) {
      return NextResponse.json({ error: 'Not a photographer' }, { status: 403 });
    }

    const body = await request.json();
    
    const result = await saveWatermarkSettings(user.id, {
      watermarkType: body.watermarkType,
      textContent: body.textContent,
      textFont: body.textFont,
      textSize: body.textSize,
      textColor: body.textColor,
      textOpacity: body.textOpacity,
      logoUrl: body.logoUrl,
      logoWidth: body.logoWidth,
      logoOpacity: body.logoOpacity,
      position: body.position,
      margin: body.margin,
      tileSpacing: body.tileSpacing,
      tileAngle: body.tileAngle,
      previewQuality: body.previewQuality,
      previewMaxDimension: body.previewMaxDimension,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    // Return updated settings
    const settings = await getWatermarkSettings(user.id);
    
    return NextResponse.json({
      success: true,
      settings,
    });

  } catch (error) {
    console.error('Watermark POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save watermark settings' },
      { status: 500 }
    );
  }
}
