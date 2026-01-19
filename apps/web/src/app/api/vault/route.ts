/**
 * Photo Vault API
 * 
 * GET - Get user's vault photos and usage
 * POST - Add photo to vault
 * DELETE - Remove photo from vault
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createClientWithAccessToken, createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const supabase = accessToken
      ? createClientWithAccessToken(accessToken)
      : await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const albumId = searchParams.get('albumId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    // Get vault photos
    let query = supabase
      .from('photo_vault')
      .select(`
        id,
        media_id,
        event_id,
        file_path,
        thumbnail_path,
        original_filename,
        file_size_bytes,
        album_id,
        title,
        is_favorite,
        taken_at,
        uploaded_at,
        events(name)
      `, { count: 'exact' })
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('uploaded_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (albumId) {
      query = query.eq('album_id', albumId);
    }

    const { data: photos, error, count } = await query;

    if (error) {
      console.error('Error fetching vault photos:', error);
      return NextResponse.json(
        { error: 'Failed to fetch photos' },
        { status: 500 }
      );
    }

    // Get user's storage usage
    const { data: usage } = await supabase
      .from('storage_usage')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Get user's active subscription
    const { data: subscription } = await supabase
      .from('storage_subscriptions')
      .select(`
        id,
        status,
        billing_cycle,
        current_period_end,
        storage_plans(name, slug, storage_limit_mb, photo_limit, features)
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    // Get albums
    const { data: albums } = await supabase
      .from('photo_albums')
      .select('id, name, photo_count, cover_photo_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    const photosWithUrls = await Promise.all(
      (photos || []).map(async (photo: any) => {
        const rawThumbnailPath = photo.thumbnail_path || photo.file_path;
        const thumbnailPath = rawThumbnailPath?.startsWith('/') ? rawThumbnailPath.slice(1) : rawThumbnailPath;
        const filePath = photo.file_path?.startsWith('/') ? photo.file_path.slice(1) : photo.file_path;

        const [thumbnailUrl, fileUrl] = await Promise.all([
          thumbnailPath
            ? supabase.storage.from('media').createSignedUrl(thumbnailPath, 3600)
            : Promise.resolve({ data: null }),
          filePath
            ? supabase.storage.from('media').createSignedUrl(filePath, 3600)
            : Promise.resolve({ data: null }),
        ]);

        return {
          ...photo,
          thumbnailUrl: thumbnailUrl?.data?.signedUrl || null,
          fileUrl: fileUrl?.data?.signedUrl || null,
        };
      })
    );

    return NextResponse.json({
      photos: photosWithUrls,
      totalPhotos: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
      usage: usage ? {
        totalPhotos: usage.total_photos,
        totalSizeBytes: usage.total_size_bytes,
        storageLimitBytes: usage.storage_limit_bytes,
        photoLimit: usage.photo_limit,
        usagePercent: usage.storage_limit_bytes > 0 
          ? Math.round((usage.total_size_bytes / usage.storage_limit_bytes) * 100)
          : 0,
        photosPercent: usage.photo_limit > 0
          ? Math.round((usage.total_photos / usage.photo_limit) * 100)
          : 0,
      } : null,
      subscription: subscription ? {
        planName: subscription.storage_plans?.name,
        planSlug: subscription.storage_plans?.slug,
        billingCycle: subscription.billing_cycle,
        currentPeriodEnd: subscription.current_period_end,
        features: subscription.storage_plans?.features,
      } : null,
      albums: albums || [],
    });
  } catch (error) {
    console.error('Vault GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const supabase = accessToken
      ? createClientWithAccessToken(accessToken)
      : await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { mediaId, eventId, albumId, title, isFavorite, dropInPhotoId } = body;

    if (!mediaId && !dropInPhotoId) {
      return NextResponse.json(
        { error: 'Media ID or Drop-In Photo ID is required' },
        { status: 400 }
      );
    }

    // Check if user can add to vault
    const { data: canAdd } = await supabase.rpc('can_add_to_vault', {
      p_user_id: user.id,
      p_file_size_bytes: 0,
    });

    if (!canAdd) {
      return NextResponse.json(
        { error: 'Storage limit reached. Please upgrade your plan.' },
        { status: 403 }
      );
    }

    // Check if already in vault
    let existing = null;
    if (mediaId) {
      const { data } = await supabase
        .from('photo_vault')
        .select('id, is_favorite')
        .eq('user_id', user.id)
        .eq('media_id', mediaId)
        .single();
      existing = data;
    }

    if (existing) {
      if (typeof isFavorite === 'boolean') {
        const { data: updated, error: updateError } = await supabase
          .from('photo_vault')
          .update({ is_favorite: isFavorite })
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError) {
          return NextResponse.json({ error: 'Failed to update favorite' }, { status: 500 });
        }

        return NextResponse.json({ photo: updated });
      }

      return NextResponse.json(
        { error: 'Photo already in vault' },
        { status: 400 }
      );
    }

    let vaultInsert: any = {
      user_id: user.id,
      album_id: albumId,
      title: title,
      is_favorite: !!isFavorite,
    };

    if (mediaId) {
      const { data: media } = await supabase
        .from('media')
        .select('storage_path, thumbnail_path, original_filename, file_size, event_id')
        .eq('id', mediaId)
        .single();

      if (!media) {
        return NextResponse.json(
          { error: 'Media not found' },
          { status: 404 }
        );
      }

      vaultInsert = {
        ...vaultInsert,
        media_id: mediaId,
        event_id: eventId || media.event_id,
        file_path: media.storage_path,
        thumbnail_path: media.thumbnail_path,
        original_filename: media.original_filename,
        file_size_bytes: media.file_size || 0,
      };
    }

    if (dropInPhotoId) {
      const serviceClient = createServiceClient();
      const { data: dropInPhoto } = await serviceClient
        .from('drop_in_photos')
        .select('id, storage_path, thumbnail_path, original_filename, file_size, uploader_id')
        .eq('id', dropInPhotoId)
        .single();

      if (!dropInPhoto) {
        return NextResponse.json({ error: 'Drop-in photo not found' }, { status: 404 });
      }

      const { data: existingDropIn } = await supabase
        .from('photo_vault')
        .select('id, is_favorite')
        .eq('user_id', user.id)
        .eq('file_path', dropInPhoto.storage_path)
        .single();

      if (existingDropIn) {
        if (typeof isFavorite === 'boolean') {
          const { data: updated, error: updateError } = await supabase
            .from('photo_vault')
            .update({ is_favorite: isFavorite })
            .eq('id', existingDropIn.id)
            .select()
            .single();

          if (updateError) {
            return NextResponse.json({ error: 'Failed to update favorite' }, { status: 500 });
          }

          return NextResponse.json({ photo: updated });
        }

        return NextResponse.json(
          { error: 'Photo already in vault' },
          { status: 400 }
        );
      }

      const { data: match } = await serviceClient
        .from('drop_in_matches')
        .select('id')
        .eq('drop_in_photo_id', dropInPhotoId)
        .eq('matched_attendee_id', user.id)
        .single();

      if (!match && dropInPhoto.uploader_id !== user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      vaultInsert = {
        ...vaultInsert,
        file_path: dropInPhoto.storage_path,
        thumbnail_path: dropInPhoto.thumbnail_path,
        original_filename: dropInPhoto.original_filename,
        file_size_bytes: dropInPhoto.file_size || 0,
      };
    }

    // Add to vault
    const { data: vaultPhoto, error } = await supabase
      .from('photo_vault')
      .insert(vaultInsert)
      .select()
      .single();

    if (error) {
      console.error('Error adding to vault:', error);
      return NextResponse.json(
        { error: 'Failed to add photo to vault' },
        { status: 500 }
      );
    }

    return NextResponse.json({ photo: vaultPhoto });
  } catch (error) {
    console.error('Vault POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const photoId = searchParams.get('id');

    if (!photoId) {
      return NextResponse.json(
        { error: 'Photo ID is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('photo_vault')
      .delete()
      .eq('id', photoId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error removing from vault:', error);
      return NextResponse.json(
        { error: 'Failed to remove photo from vault' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Vault DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
