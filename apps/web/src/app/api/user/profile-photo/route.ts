/**
 * User Profile Photo API
 * 
 * Upload and delete profile photos for both photographers and attendees.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    // Determine user type
    const userType = user.user_metadata?.user_type || 'attendee';
    const table = userType === 'photographer' ? 'photographers' : 'attendees';

    // Generate unique filename
    const ext = file.name.split('.').pop();
    const filename = `${user.id}/profile-${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload photo. Please ensure the avatars bucket exists and is properly configured.' },
        { status: 400 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filename);

    const photoUrl = urlData.publicUrl;

    // Update user profile
    const { error: updateError } = await supabase
      .from(table)
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

    // Determine user type
    const userType = user.user_metadata?.user_type || 'attendee';
    const table = userType === 'photographer' ? 'photographers' : 'attendees';

    // Get current photo URL
    const { data: profile } = await supabase
      .from(table)
      .select('profile_photo_url')
      .eq('id', user.id)
      .single();

    if (profile?.profile_photo_url) {
      // Extract filename from URL
      try {
        const url = new URL(profile.profile_photo_url);
        const pathParts = url.pathname.split('/');
        const filename = pathParts.slice(-2).join('/');

        // Delete from storage
        await supabase.storage.from('avatars').remove([filename]);
      } catch (err) {
        console.error('Error deleting old photo:', err);
      }
    }

    // Update profile
    const { error } = await supabase
      .from(table)
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
