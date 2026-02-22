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
import { copyStorageObject, createStorageSignedUrl, deleteStorageObjects } from '@/lib/storage/provider';
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

function normalizeStoragePath(path: string | null | undefined): string | null {
  if (!path || typeof path !== 'string') return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
}

function extractFileExtension(primaryPath: string | null | undefined, fallbackName?: string | null): string {
  const candidates = [primaryPath || '', fallbackName || ''];
  for (const candidate of candidates) {
    const clean = String(candidate).split('?')[0].split('#')[0];
    const lastDot = clean.lastIndexOf('.');
    if (lastDot > -1 && lastDot < clean.length - 1) {
      const ext = clean.slice(lastDot + 1).toLowerCase();
      if (/^[a-z0-9]{2,8}$/.test(ext)) {
        return ext;
      }
    }
  }
  return 'jpg';
}

function buildVaultObjectPath(
  userId: string,
  sourceScope: 'media' | 'dropin',
  sourceId: string,
  kind: 'original' | 'thumbnail',
  extension: string
): string {
  return `vault/${userId}/${sourceScope}/${sourceId}/${kind}.${extension}`;
}

function isUserVaultManagedPath(path: string | null | undefined, userId: string): boolean {
  const normalized = normalizeStoragePath(path);
  if (!normalized) return false;
  return normalized.startsWith(`vault/${userId}/`);
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
      .select('total_photos, total_size_bytes, storage_limit_bytes, photo_limit')
      .eq('user_id', user.id)
      .maybeSingle();

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
      .maybeSingle();

    const { data: freePlan } = await supabase
      .from('storage_plans')
      .select('id, storage_limit_mb')
      .eq('slug', 'free')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

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
          createStorageSignedUrl('media', thumbnailPath, 3600, { supabaseClient: supabase }),
          createStorageSignedUrl('media', filePath, 3600, { supabaseClient: supabase }),
        ]);

        return {
          ...photo,
          thumbnailUrl: thumbnailUrl || null,
          fileUrl: fileUrl || null,
        };
      })
    );

    const limitFromUsage = Number(usage?.storage_limit_bytes);
    const limitFromSubscriptionMb = Number(subscription?.storage_plans?.storage_limit_mb);
    const limitFromFreeMb = Number(freePlan?.storage_limit_mb);
    const resolvedStorageLimitBytes = Number.isFinite(limitFromSubscriptionMb)
      ? (limitFromSubscriptionMb === -1 ? -1 : limitFromSubscriptionMb * 1024 * 1024)
      : Number.isFinite(limitFromFreeMb)
        ? (limitFromFreeMb === -1 ? -1 : limitFromFreeMb * 1024 * 1024)
        : Number.isFinite(limitFromUsage)
          ? limitFromUsage
          : 500 * 1024 * 1024;
    const resolvedTotalPhotos = Number(usage?.total_photos ?? 0);
    const resolvedTotalSizeBytes = Number(usage?.total_size_bytes ?? 0);

    if (
      !usage ||
      usage.storage_limit_bytes === null ||
      usage.storage_limit_bytes === undefined ||
      Number(usage.storage_limit_bytes) !== resolvedStorageLimitBytes
    ) {
      await supabase
        .from('storage_usage')
        .upsert(
          {
            user_id: user.id,
            storage_limit_bytes: resolvedStorageLimitBytes,
            photo_limit: -1,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        .catch((upsertError) => {
          console.warn('Vault usage row repair failed:', upsertError);
        });
    }

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
      usage: {
        totalPhotos: resolvedTotalPhotos,
        totalSizeBytes: resolvedTotalSizeBytes,
        storageLimitBytes: resolvedStorageLimitBytes,
        photoLimit: -1,
        usagePercent: resolvedStorageLimitBytes > 0
          ? Math.round((resolvedTotalSizeBytes / resolvedStorageLimitBytes) * 100)
          : 0,
        photosPercent: 0,
      },
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
    if (mediaId && dropInPhotoId) {
      return NextResponse.json(
        { error: 'Provide either mediaId or dropInPhotoId, not both.' },
        { status: 400 }
      );
    }

    const serviceClient = createServiceClient();

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

    let sourceFilePath: string | null = null;
    let sourceThumbnailPath: string | null = null;
    let sourceOriginalFilename: string | null = null;
    let sourceFileSizeBytes = 0;
    let sourceScope: 'media' | 'dropin' | null = null;
    let sourceIdForPath: string | null = null;
    let resolvedEventId: string | null = null;

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
      };

      sourceFilePath = normalizeStoragePath(media.storage_path);
      sourceThumbnailPath = normalizeStoragePath(media.thumbnail_path);
      sourceOriginalFilename = media.original_filename || null;
      sourceFileSizeBytes = Number(media.file_size || 0);
      sourceScope = 'media';
      sourceIdForPath = String(mediaId);
      resolvedEventId = eventId || media.event_id || null;
    }

    if (dropInPhotoId) {
      const { data: dropInPhoto } = await serviceClient
        .from('drop_in_photos')
        .select('id, storage_path, thumbnail_path, original_filename, file_size, uploader_id')
        .eq('id', dropInPhotoId)
        .single();

      if (!dropInPhoto) {
        return NextResponse.json({ error: 'Drop-in photo not found' }, { status: 404 });
      }

      const sourceFilePathForExisting = normalizeStoragePath(dropInPhoto.storage_path);
      const sourceFileExt = extractFileExtension(sourceFilePathForExisting, dropInPhoto.original_filename);
      const deterministicDropInPath = buildVaultObjectPath(
        user.id,
        'dropin',
        String(dropInPhotoId),
        'original',
        sourceFileExt
      );

      const existingDropInPaths = [deterministicDropInPath, sourceFilePathForExisting].filter(
        (value): value is string => Boolean(value)
      );
      const { data: existingDropIn } = await supabase
        .from('photo_vault')
        .select('id, is_favorite')
        .eq('user_id', user.id)
        .in('file_path', existingDropInPaths)
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
        event_id: resolvedEventId,
      };

      sourceFilePath = sourceFilePathForExisting;
      sourceThumbnailPath = normalizeStoragePath(dropInPhoto.thumbnail_path);
      sourceOriginalFilename = dropInPhoto.original_filename || null;
      sourceFileSizeBytes = Number(dropInPhoto.file_size || 0);
      sourceScope = 'dropin';
      sourceIdForPath = String(dropInPhotoId);
    }

    if (!sourceFilePath || !sourceScope || !sourceIdForPath) {
      return NextResponse.json(
        { error: 'Vault source file path is missing' },
        { status: 400 }
      );
    }

    // Check if user can add to vault using real file size.
    const { data: canAdd } = await supabase.rpc('can_add_to_vault', {
      p_user_id: user.id,
      p_file_size_bytes: sourceFileSizeBytes,
    });

    if (!canAdd) {
      return NextResponse.json(
        { error: 'Storage limit reached. Please upgrade your plan.' },
        { status: 403 }
      );
    }

    const fileExt = extractFileExtension(sourceFilePath, sourceOriginalFilename);
    const destinationFilePath = buildVaultObjectPath(
      user.id,
      sourceScope,
      sourceIdForPath,
      'original',
      fileExt
    );
    const thumbExt = extractFileExtension(sourceThumbnailPath, sourceOriginalFilename || sourceFilePath);
    const destinationThumbnailPath = sourceThumbnailPath
      ? buildVaultObjectPath(user.id, sourceScope, sourceIdForPath, 'thumbnail', thumbExt)
      : null;

    const pathsToPrepare = [destinationFilePath, destinationThumbnailPath].filter(
      (value): value is string => Boolean(value)
    );
    if (pathsToPrepare.length > 0) {
      await deleteStorageObjects('media', pathsToPrepare).catch(() => {});
    }

    const copiedPaths: string[] = [];
    try {
      await copyStorageObject('media', sourceFilePath, destinationFilePath);
    } catch (fileCopyError) {
      console.error('Vault file copy failed:', fileCopyError);
      return NextResponse.json(
        { error: 'Failed to persist photo to vault storage.' },
        { status: 500 }
      );
    }
    copiedPaths.push(destinationFilePath);

    if (sourceThumbnailPath && destinationThumbnailPath) {
      try {
        await copyStorageObject('media', sourceThumbnailPath, destinationThumbnailPath);
      } catch (thumbnailCopyError) {
        console.error('Vault thumbnail copy failed:', thumbnailCopyError);
        await deleteStorageObjects('media', copiedPaths).catch(() => {});
        return NextResponse.json(
          { error: 'Failed to persist vault thumbnail.' },
          { status: 500 }
        );
      }
      copiedPaths.push(destinationThumbnailPath);
    }

    vaultInsert = {
      ...vaultInsert,
      event_id: resolvedEventId,
      file_path: destinationFilePath,
      thumbnail_path: destinationThumbnailPath,
      original_filename: sourceOriginalFilename,
      file_size_bytes: sourceFileSizeBytes,
    };

    // Add to vault
    const { data: vaultPhoto, error } = await supabase
      .from('photo_vault')
      .insert(vaultInsert)
      .select()
      .single();

    if (error) {
      console.error('Error adding to vault:', error);
      const cleanupPaths = [destinationFilePath, destinationThumbnailPath].filter(
        (value): value is string => Boolean(value)
      );
      if (cleanupPaths.length > 0) {
        await deleteStorageObjects('media', cleanupPaths).catch(() => {});
      }
      const rawMessage = String((error as any)?.message || '').toLowerCase();
      if (rawMessage.includes('vault_storage_limit_exceeded')) {
        return NextResponse.json(
          { error: 'Storage limit reached. Please upgrade your plan.' },
          { status: 403 }
        );
      }
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

    const { data: existingRows } = await supabase
      .from('photo_vault')
      .select('id, file_path, thumbnail_path')
      .in('id', uniqueIds)
      .eq('user_id', user.id);

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

    const vaultPathsToRemove = new Set<string>();
    for (const row of existingRows || []) {
      const filePath = normalizeStoragePath(row.file_path);
      const thumbnailPath = normalizeStoragePath(row.thumbnail_path);
      if (isUserVaultManagedPath(filePath, user.id) && filePath) {
        vaultPathsToRemove.add(filePath);
      }
      if (isUserVaultManagedPath(thumbnailPath, user.id) && thumbnailPath) {
        vaultPathsToRemove.add(thumbnailPath);
      }
    }

    if (vaultPathsToRemove.size > 0) {
      await deleteStorageObjects('media', Array.from(vaultPathsToRemove)).catch((removeError) => {
          console.error('Failed to remove vault-managed storage objects:', removeError);
      });
    }

    return NextResponse.json({
      success: true,
      deletedCount: (existingRows || []).length,
    });
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

