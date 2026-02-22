export const dynamic = 'force-dynamic';

/**
 * Creator Profile Photo API
 * 
 * Upload and delete profile photos.
 */

import { NextRequest, NextResponse } from 'next/server';

import { deleteStorageObjects, getStoragePublicUrl, uploadStorageObject } from '@/lib/storage/provider';
import { createClient } from '@/lib/supabase/server';

function extractStorageObjectPath(rawValue: string | null | undefined): string | null {
  if (!rawValue || typeof rawValue !== 'string') return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed.replace(/^\/+/, '');
  }

  try {
    const parsed = new URL(trimmed);
    const path = decodeURIComponent(parsed.pathname || '').replace(/^\/+/, '');
    if (!path) return null;
    const match = path.match(/avatars\/(.+)$/i);
    return match?.[1] ? match[1].replace(/^\/+/, '') : null;
  } catch {
    return null;
  }
}

// POST - Upload profile photo
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Use JPG, PNG, or WebP.' },
        { status: 400 }
      );
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Max 2MB.' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const ext = file.name.split('.').pop();
    const filename = `${user.id}/profile-${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    try {
      await uploadStorageObject('avatars', filename, file, {
        cacheControl: '3600',
        upsert: true,
      });
    } catch (uploadError: any) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload photo' },
        { status: 400 }
      );
    }

    const photoUrl = getStoragePublicUrl('avatars', filename);
    if (!photoUrl) {
      await deleteStorageObjects('avatars', [filename]).catch(() => {});
      return NextResponse.json(
        { error: 'Failed to resolve profile photo URL' },
        { status: 500 }
      );
    }

    // Update photographer profile
    const { error: updateError } = await supabase
      .from('photographers')
      .update({
        profile_photo_url: photoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Profile update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      photoUrl,
    });

  } catch (error) {
    console.error('Profile photo upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload photo' },
      { status: 500 }
    );
  }
}

// DELETE - Remove profile photo
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current photo URL
    const { data: profile } = await supabase
      .from('photographers')
      .select('profile_photo_url')
      .eq('id', user.id)
      .single();

    if (profile?.profile_photo_url) {
      // Extract filename from URL
      const filename = extractStorageObjectPath(profile.profile_photo_url);

      // Delete from storage
      if (filename) {
        await deleteStorageObjects('avatars', [filename]);
      }
    }

    // Update profile
    const { error } = await supabase
      .from('photographers')
      .update({
        profile_photo_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Profile photo delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete photo' },
      { status: 500 }
    );
  }
}

