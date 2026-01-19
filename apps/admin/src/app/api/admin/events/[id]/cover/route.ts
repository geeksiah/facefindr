/**
 * Admin Event Cover Photo API
 */

import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';

// POST - Upload cover photo
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Verify event exists
    const { data: event } = await supabaseAdmin
      .from('events')
      .select('id')
      .eq('id', id)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Upload to covers bucket
    const fileExt = file.name.split('.').pop();
    const fileName = `${id}-${Date.now()}.${fileExt}`;
    const filePath = `${id}/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('covers')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload cover photo' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('covers')
      .getPublicUrl(filePath);

    // Update event with cover image URL
    const { error: updateError } = await supabaseAdmin
      .from('events')
      .update({ cover_image_url: urlData.publicUrl })
      .eq('id', id);

    if (updateError) {
      console.error('Update error:', updateError);
      // Try to clean up uploaded file
      await supabaseAdmin.storage.from('covers').remove([filePath]);
      return NextResponse.json(
        { error: 'Failed to update event' },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: urlData.publicUrl });

  } catch (error) {
    console.error('Cover upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload cover photo' },
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
    const { id } = params;

    // Get current cover image URL
    const { data: event } = await supabaseAdmin
      .from('events')
      .select('cover_image_url')
      .eq('id', id)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Remove from storage if exists
    if (event.cover_image_url) {
      // Extract file path from URL
      const urlParts = event.cover_image_url.split('/');
      const filePath = urlParts.slice(-2).join('/'); // Get last two parts (id/filename)

      // Try to remove from covers bucket
      await supabaseAdmin.storage.from('covers').remove([filePath]);
      // Also try events bucket for backward compatibility
      await supabaseAdmin.storage.from('events').remove([filePath]);
    }

    // Update event to remove cover image URL
    const { error: updateError } = await supabaseAdmin
      .from('events')
      .update({ cover_image_url: null })
      .eq('id', id);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to remove cover photo' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Cover removal error:', error);
    return NextResponse.json(
      { error: 'Failed to remove cover photo' },
      { status: 500 }
    );
  }
}
