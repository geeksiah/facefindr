export const dynamic = 'force-dynamic';

/**
 * Event Cover Photo API
 */

import { NextRequest, NextResponse } from 'next/server';

import { getPhotographerIdCandidates } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// POST - Upload cover photo
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const serviceClient = createServiceClient();

    const { id } = params;
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);
    if (!photographerIdCandidates.length) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    // Verify ownership
    const { data: event } = await serviceClient
      .from('events')
      .select('id, cover_image_url')
      .eq('id', id)
      .in('photographer_id', photographerIdCandidates)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Get the file from form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Invalid file type. Only images are allowed.' }, { status: 400 });
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
    }

    // TODO: Add image optimization using sharp
    // For now, we rely on Next.js Image component optimization when displaying
    // To optimize uploads, install sharp: npm install sharp
    // Then resize/compress images before upload to reduce file size
    
    // Recommended optimization:
    // - Resize to max 1920x1080 (or 2048x2048 for square)
    // - Compress JPEG quality to 85%
    // - Convert to WebP if supported, fallback to JPEG
    // - Target file size: < 500KB

    // Delete old cover image if exists
    if (event.cover_image_url) {
      try {
        const oldPath = event.cover_image_url.split('/').slice(-2).join('/');
        // Try both buckets in case old covers are in 'events' bucket
        await serviceClient.storage.from('covers').remove([oldPath]).catch(() => {});
        await serviceClient.storage.from('events').remove([oldPath]).catch(() => {});
      } catch (e) {
        // Ignore errors when deleting old file
      }
    }

    // Upload new cover image to 'covers' bucket
    const fileExt = file.name.split('.').pop();
    const fileName = `${id}/cover.${fileExt}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await serviceClient.storage
      .from('covers')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Cover upload error:', uploadError);
      return NextResponse.json(
        { error: uploadError.message || 'Failed to upload cover photo to storage' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = serviceClient.storage
      .from('covers')
      .getPublicUrl(fileName);

    // Update event with new cover URL
    const { error: updateError } = await serviceClient
      .from('events')
      .update({ cover_image_url: publicUrl })
      .eq('id', id);

    if (updateError) {
      console.error('Cover update error:', updateError);
      // Try to clean up uploaded file
      await serviceClient.storage.from('covers').remove([fileName]).catch(() => {});
      return NextResponse.json(
        { error: updateError.message || 'Failed to update event with cover photo' },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: publicUrl });

  } catch (error: any) {
    console.error('Upload cover photo error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to upload cover photo' },
      { status: 500 }
    );
  }
}

// DELETE - Remove cover photo
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const serviceClient = createServiceClient();

    const { id } = params;
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);
    if (!photographerIdCandidates.length) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    // Verify ownership
    const { data: event } = await serviceClient
      .from('events')
      .select('id, cover_image_url')
      .eq('id', id)
      .in('photographer_id', photographerIdCandidates)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Delete from storage if exists
    if (event.cover_image_url) {
      try {
        const path = event.cover_image_url.split('/').slice(-2).join('/');
        // Try both buckets in case old covers are in 'events' bucket
        await serviceClient.storage.from('covers').remove([path]).catch(() => {});
        await serviceClient.storage.from('events').remove([path]).catch(() => {});
      } catch (e) {
        // Ignore errors
      }
    }

    // Update event
    const { error: updateError } = await serviceClient
      .from('events')
      .update({ cover_image_url: null })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Remove cover photo error:', error);
    return NextResponse.json(
      { error: 'Failed to remove cover photo' },
      { status: 500 }
    );
  }
}

