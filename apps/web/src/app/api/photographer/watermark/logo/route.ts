export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { checkFeature } from '@/lib/subscription/enforcement';
import {
  createStorageSignedUrl,
  deleteStorageObjects,
  uploadStorageObject,
} from '@/lib/storage/provider';
import { createClient } from '@/lib/supabase/server';

const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/webp', 'image/jpeg', 'image/svg+xml']);

function normalizeBrandingPath(rawValue: string | null | undefined): string | null {
  if (!rawValue || typeof rawValue !== 'string') return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^\/+/, '');
  }

  try {
    const parsed = new URL(trimmed);
    const path = decodeURIComponent(parsed.pathname || '').replace(/^\/+/, '');
    if (!path) return null;
    const branded = path.match(/branding\/(.+)$/i);
    return branded?.[1] ? branded[1].replace(/^\/+/, '') : null;
  } catch {
    return null;
  }
}

function getFileExtension(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext && /^[a-z0-9]+$/.test(ext)) return ext;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/svg+xml') return 'svg';
  return 'jpg';
}

async function requirePhotographerUser(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: photographer } = await supabase
    .from('photographers')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!photographer?.id) {
    return { error: NextResponse.json({ error: 'Not a creator account' }, { status: 403 }) };
  }

  return { user };
}

export async function GET() {
  try {
    const supabase = createClient();
    const auth = await requirePhotographerUser(supabase);
    if (auth.error) return auth.error;

    const { data: settings } = await supabase
      .from('watermark_settings')
      .select('logo_url, updated_at')
      .eq('photographer_id', auth.user.id)
      .maybeSingle();

    const logoPath = normalizeBrandingPath(settings?.logo_url || null);
    const logoSignedUrl = logoPath
      ? await createStorageSignedUrl('branding', logoPath, 60 * 30, { supabaseClient: supabase })
      : null;

    return NextResponse.json({
      logoPath,
      logoUrl: logoSignedUrl,
      updatedAt: settings?.updated_at || null,
    });
  } catch (error) {
    console.error('Watermark logo GET error:', error);
    return NextResponse.json({ error: 'Failed to load watermark logo' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const auth = await requirePhotographerUser(supabase);
    if (auth.error) return auth.error;

    const canUseCustomWatermark = await checkFeature(auth.user.id, 'custom_watermark');
    if (!canUseCustomWatermark) {
      return NextResponse.json(
        { error: 'Custom watermark is not enabled on your current plan.' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file upload' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Use PNG, JPG, WEBP, or SVG.' },
        { status: 400 }
      );
    }

    if (file.size <= 0 || file.size > MAX_LOGO_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File size must be between 1B and 5MB.' },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from('watermark_settings')
      .select('logo_url')
      .eq('photographer_id', auth.user.id)
      .maybeSingle();

    const oldLogoPath = normalizeBrandingPath(existing?.logo_url || null);
    const ext = getFileExtension(file);
    const logoPath = `watermarks/${auth.user.id}/logo-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    await uploadStorageObject('branding', logoPath, bytes, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: true,
      supabaseClient: supabase,
    });

    const { error: upsertError } = await supabase
      .from('watermark_settings')
      .upsert(
        {
          photographer_id: auth.user.id,
          logo_url: logoPath,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'photographer_id' }
      );

    if (upsertError) {
      await deleteStorageObjects('branding', [logoPath]).catch(() => {});
      return NextResponse.json(
        { error: upsertError.message || 'Failed to save logo reference' },
        { status: 400 }
      );
    }

    if (oldLogoPath && oldLogoPath !== logoPath) {
      await deleteStorageObjects('branding', [oldLogoPath]).catch(() => {});
    }

    const signedUrl = await createStorageSignedUrl('branding', logoPath, 60 * 30, {
      supabaseClient: supabase,
    });

    return NextResponse.json({
      success: true,
      logoPath,
      logoUrl: signedUrl,
    });
  } catch (error) {
    console.error('Watermark logo POST error:', error);
    return NextResponse.json({ error: 'Failed to upload watermark logo' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = createClient();
    const auth = await requirePhotographerUser(supabase);
    if (auth.error) return auth.error;

    const { data: existing } = await supabase
      .from('watermark_settings')
      .select('logo_url')
      .eq('photographer_id', auth.user.id)
      .maybeSingle();

    const logoPath = normalizeBrandingPath(existing?.logo_url || null);
    if (logoPath) {
      await deleteStorageObjects('branding', [logoPath]).catch(() => {});
    }

    const { error } = await supabase
      .from('watermark_settings')
      .upsert(
        {
          photographer_id: auth.user.id,
          logo_url: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'photographer_id' }
      );

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to clear logo' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Watermark logo DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete watermark logo' }, { status: 500 });
  }
}
