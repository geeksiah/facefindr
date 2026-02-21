export const dynamic = 'force-dynamic';

/**
 * Photo Vault API
 * 
 * GET - Get user's vault photos and usage
 * POST - Add photo to vault
 * DELETE - Remove photo from vault
 */

import { NextRequest, NextResponse } from 'next/server';

import { stripe } from '@/lib/payments/stripe';
import { createClient, createClientWithAccessToken, createServiceClient } from '@/lib/supabase/server';

function readMetadataFlag(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

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
        payment_provider,
        external_subscription_id,
        metadata,
        cancelled_at,
        storage_plans(name, slug, storage_limit_mb, features)
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

    const subscriptionMetadata =
      subscription?.metadata && typeof subscription.metadata === 'object'
        ? (subscription.metadata as Record<string, unknown>)
        : {};
    const cancelAtPeriodEnd = readMetadataFlag(subscriptionMetadata, 'cancel_at_period_end');
    const autoRenewPreference = readMetadataFlag(subscriptionMetadata, 'auto_renew_preference');
    const resolvedAutoRenew =
      autoRenewPreference !== null ? autoRenewPreference : !(cancelAtPeriodEnd === true);

    return NextResponse.json({
      photos: photosWithUrls,
      totalPhotos: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
      usage: usage ? {
        totalPhotos: usage.total_photos,
        totalSizeBytes: usage.total_size_bytes,
        storageLimitBytes: usage.storage_limit_bytes,
        photoLimit: -1,
        usagePercent: usage.storage_limit_bytes > 0 
          ? Math.round((usage.total_size_bytes / usage.storage_limit_bytes) * 100)
          : 0,
        photosPercent: 0,
      } : null,
      subscription: subscription ? {
        planName: subscription.storage_plans?.name,
        planSlug: subscription.storage_plans?.slug,
        billingCycle: subscription.billing_cycle,
        currentPeriodEnd: subscription.current_period_end,
        features: subscription.storage_plans?.features,
        paymentProvider: subscription.payment_provider || null,
        autoRenew: resolvedAutoRenew,
        canToggleAutoRenew:
          String(subscription.storage_plans?.slug || 'free').toLowerCase() !== 'free' &&
          String(subscription.payment_provider || '').toLowerCase() === 'stripe' &&
          Boolean(subscription.external_subscription_id),
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
    let existing: any = null;
    if (mediaId) {
      const { data } = await supabase
        .from('photo_vault')
        .select('id, is_favorite')
        .eq('user_id', user.id)
        .eq('media_id', mediaId)
        .single();
      existing = data as any;
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
    const photoId = searchParams.get('id');
    const body = await request.json().catch(() => ({}));
    const photoIds = Array.isArray(body?.photoIds)
      ? body.photoIds.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
      : [];
    const idsToDelete = photoId ? [photoId, ...photoIds] : photoIds;
    const uniqueIds = Array.from(new Set(idsToDelete));

    if (uniqueIds.length === 0) {
      return NextResponse.json(
        { error: 'Photo ID is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('photo_vault')
      .delete()
      .in('id', uniqueIds)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error removing from vault:', error);
      return NextResponse.json(
        { error: 'Failed to remove photo from vault' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, deletedCount: uniqueIds.length });
  } catch (error) {
    console.error('Vault DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '').trim();

    if (action !== 'assign_album' && action !== 'favorite' && action !== 'toggle_auto_renew') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    if (action === 'toggle_auto_renew') {
      if (typeof body?.autoRenew !== 'boolean') {
        return NextResponse.json({ error: 'autoRenew must be boolean' }, { status: 400 });
      }

      const autoRenew = Boolean(body.autoRenew);
      const serviceClient = createServiceClient();
      const { data: subscription } = await serviceClient
        .from('storage_subscriptions')
        .select('id, plan_id, payment_provider, external_subscription_id, metadata')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (!subscription?.id) {
        return NextResponse.json({ error: 'No active vault subscription found' }, { status: 404 });
      }

      const { data: plan } = await serviceClient
        .from('storage_plans')
        .select('slug')
        .eq('id', subscription.plan_id)
        .maybeSingle();
      if (String(plan?.slug || 'free').toLowerCase() === 'free') {
        return NextResponse.json(
          { error: 'Auto-renew is not available on free vault plan' },
          { status: 400 }
        );
      }

      const provider = String(subscription.payment_provider || '').toLowerCase();
      const externalSubscriptionId = String(subscription.external_subscription_id || '').trim();
      if (provider !== 'stripe' || !externalSubscriptionId) {
        return NextResponse.json(
          { error: 'Auto-renew toggle is only supported for Stripe-managed vault subscriptions' },
          { status: 400 }
        );
      }
      if (!stripe) {
        return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
      }

      await stripe.subscriptions.update(externalSubscriptionId, {
        cancel_at_period_end: !autoRenew,
      });

      const existingMetadata =
        subscription.metadata && typeof subscription.metadata === 'object'
          ? (subscription.metadata as Record<string, unknown>)
          : {};
      const nextMetadata = {
        ...existingMetadata,
        auto_renew_preference: autoRenew,
        cancel_at_period_end: !autoRenew,
      };

      const { error: updateError } = await serviceClient
        .from('storage_subscriptions')
        .update({
          metadata: nextMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

      if (updateError) {
        return NextResponse.json({ error: 'Failed to update vault subscription' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        autoRenew,
        cancelAtPeriodEnd: !autoRenew,
      });
    }

    if (action === 'favorite') {
      const photoId = typeof body?.photoId === 'string' ? body.photoId : '';
      const isFavorite = Boolean(body?.isFavorite);
      if (!photoId) {
        return NextResponse.json({ error: 'photoId is required' }, { status: 400 });
      }

      const { error } = await supabase
        .from('photo_vault')
        .update({
          is_favorite: isFavorite,
          updated_at: new Date().toISOString(),
        })
        .eq('id', photoId)
        .eq('user_id', user.id);

      if (error) {
        return NextResponse.json({ error: 'Failed to update favorite' }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    const photoIds = Array.isArray(body?.photoIds)
      ? body.photoIds.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
      : [];
    const uniquePhotoIds = Array.from(new Set(photoIds));
    if (uniquePhotoIds.length === 0) {
      return NextResponse.json({ error: 'photoIds are required' }, { status: 400 });
    }

    const albumId =
      body?.albumId === null || body?.albumId === ''
        ? null
        : typeof body?.albumId === 'string'
          ? body.albumId
          : null;

    if (albumId) {
      const { data: album, error: albumError } = await supabase
        .from('photo_albums')
        .select('id')
        .eq('id', albumId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (albumError || !album) {
        return NextResponse.json({ error: 'Album not found' }, { status: 404 });
      }
    }

    const { error } = await supabase
      .from('photo_vault')
      .update({
        album_id: albumId,
        updated_at: new Date().toISOString(),
      })
      .in('id', uniquePhotoIds)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to update album assignment' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updatedCount: uniquePhotoIds.length,
      albumId,
    });
  } catch (error) {
    console.error('Vault PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

