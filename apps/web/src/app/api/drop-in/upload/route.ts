export const dynamic = 'force-dynamic';

/**
 * Drop-In Photo Upload API
 *
 * Credit-based flow:
 * - Upload photo
 * - Deduct configured Drop-In credits
 * - Mark as paid (credit-backed) and trigger processing
 */

import { NextRequest, NextResponse } from 'next/server';

import { resolveDropInCreditRules } from '@/lib/drop-in/credit-rules';
import { resolveDropInPricingConfig } from '@/lib/drop-in/pricing';
import { resolveAttendeeProfileByUser } from '@/lib/profiles/ids';
import { createClient, createClientWithAccessToken, createServiceClient } from '@/lib/supabase/server';

function extractMissingColumnName(error: any): string | null {
  if (error?.code !== '42703' || typeof error?.message !== 'string') return null;

  const quoted = error.message.match(/column\s+"([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];

  const bare = error.message.match(/column\s+([a-zA-Z0-9_]+)/i);
  return bare?.[1] || null;
}

function needsFaceTag(error: any): boolean {
  if (error?.code !== '23502' || typeof error?.message !== 'string') return false;
  const message = error.message.toLowerCase();
  return message.includes('face_tag') || message.includes('face_tag_suffix');
}

async function tryInsertAttendeeProfile(
  serviceClient: ReturnType<typeof createServiceClient>,
  payload: Record<string, any>
) {
  return serviceClient
    .from('attendees')
    .insert(payload)
    .select('id, display_name')
    .single();
}

async function ensureAttendeeProfile(
  serviceClient: ReturnType<typeof createServiceClient>,
  user: { id: string; email?: string | null; user_metadata?: Record<string, any> }
) {
  let { data: attendee } = await resolveAttendeeProfileByUser(serviceClient, user.id, user.email);
  if (attendee) return attendee;

  const usernameSeed =
    String(user.user_metadata?.username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '') ||
    String(user.user_metadata?.display_name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '') ||
    String(user.email || '')
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '') ||
    `user_${Date.now()}`;
  const username = usernameSeed.slice(0, 8) || 'user0001';
  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'User';
  const normalizedCountryCode =
    typeof user.user_metadata?.country_code === 'string' &&
    /^[A-Za-z]{2}$/.test(user.user_metadata.country_code.trim())
      ? user.user_metadata.country_code.trim().toUpperCase()
      : null;

  const nextFaceTag = (base: string) => {
    const suffix = Math.floor(1000 + Math.random() * 9000).toString();
    const tagBase = base.replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user';
    return {
      faceTag: `@${tagBase}${suffix}`,
      suffix,
    };
  };
  const initialTag = nextFaceTag(username);

  let payload: Record<string, any> = {
    id: user.id,
    display_name: displayName,
    email: user.email,
    username,
    country_code: normalizedCountryCode,
    face_tag: initialTag.faceTag,
    face_tag_suffix: initialTag.suffix,
  };

  for (let attempt = 0; attempt < 12; attempt++) {
    const createResult = await tryInsertAttendeeProfile(serviceClient, payload);
    if (!createResult.error && createResult.data) {
      return {
        id: createResult.data.id,
        display_name: (createResult.data as any).display_name || displayName,
      };
    }

    const error = createResult.error;
    if (!error) break;

    const missingColumn = extractMissingColumnName(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      const { [missingColumn]: _omitted, ...nextPayload } = payload;
      void _omitted;
      payload = nextPayload;
      continue;
    }

    if (needsFaceTag(error)) {
      const nextTag = nextFaceTag(username);
      payload.face_tag = nextTag.faceTag;
      payload.face_tag_suffix = nextTag.suffix;
      continue;
    }

    if (
      error.code === '23505' &&
      typeof error.message === 'string' &&
      (error.message.toLowerCase().includes('username') ||
        error.message.toLowerCase().includes('face_tag') ||
        error.message.toLowerCase().includes('username_registry'))
    ) {
      const nextTag = nextFaceTag(username);
      payload.username = `${username.slice(0, 6)}${Math.floor(10 + Math.random() * 89)}`;
      payload.face_tag = nextTag.faceTag;
      payload.face_tag_suffix = nextTag.suffix;
      continue;
    }

    break;
  }

  const byId = await serviceClient
    .from('attendees')
    .select('id, display_name')
    .eq('id', user.id)
    .limit(1)
    .maybeSingle();
  if (byId.data?.id) {
    return {
      id: byId.data.id,
      display_name: (byId.data as any).display_name || displayName,
    };
  }

  if (user.email) {
    const byEmail = await serviceClient
      .from('attendees')
      .select('id, display_name')
      .eq('email', user.email)
      .limit(1)
      .maybeSingle();
    if (byEmail.data?.id) {
      return {
        id: byEmail.data.id,
        display_name: (byEmail.data as any).display_name || displayName,
      };
    }
  }

  return null;
}

async function triggerDropInProcessing(
  dropInPhotoId: string,
  accessToken: string | null,
  cookieHeader: string | null
): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const processSecret = process.env.DROP_IN_PROCESS_SECRET;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (processSecret) {
    headers['x-drop-in-process-secret'] = processSecret;
  } else if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  } else if (cookieHeader) {
    headers.cookie = cookieHeader;
  } else {
    return false;
  }

  try {
    const response = await fetch(`${baseUrl}/api/drop-in/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ dropInPhotoId }),
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const supabase = accessToken ? createClientWithAccessToken(accessToken) : await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [pricing, rules] = await Promise.all([
      resolveDropInPricingConfig(),
      resolveDropInCreditRules(),
    ]);

    const serviceClient = createServiceClient();
    const attendee = await ensureAttendeeProfile(serviceClient, {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata || {},
    });

    if (!attendee) {
      return NextResponse.json({ error: 'Failed to create attendee profile' }, { status: 500 });
    }

    const formData = await request.formData();
    const photoEntries = formData.getAll('photo');
    const file = formData.get('photo') as File;
    const giftMessage = formData.get('giftMessage') as string | null;
    const includeGift = formData.get('includeGift') === 'true';
    const locationLat = formData.get('locationLat') ? parseFloat(formData.get('locationLat') as string) : null;
    const locationLng = formData.get('locationLng') ? parseFloat(formData.get('locationLng') as string) : null;
    const locationName = formData.get('locationName') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Photo is required' }, { status: 400 });
    }
    if (photoEntries.length > 1) {
      return NextResponse.json({ error: 'Only one photo can be uploaded per drop-in submission' }, { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
    }

    if (includeGift && giftMessage && giftMessage.length > 200) {
      return NextResponse.json({ error: 'Gift message must be 200 characters or less' }, { status: 400 });
    }

    const uploadCreditsRequired = rules.upload;
    const giftCreditsRequired = includeGift ? rules.gift : 0;
    const totalCreditsRequired = uploadCreditsRequired + giftCreditsRequired;

    const { data: attendeeBalance } = await serviceClient
      .from('attendees')
      .select('drop_in_credits')
      .eq('id', attendee.id)
      .maybeSingle();
    const availableCredits = Number(attendeeBalance?.drop_in_credits || 0);
    if (availableCredits < totalCreditsRequired) {
      return NextResponse.json(
        {
          error: `Insufficient credits (${totalCreditsRequired} required)`,
          requiredCredits: totalCreditsRequired,
          availableCredits,
        },
        { status: 402 }
      );
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const filename = `drop-in-${timestamp}-${randomStr}.${ext}`;
    const storagePath = `drop-ins/${attendee.id}/${filename}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await serviceClient.storage
      .from('media')
      .upload(storagePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    const uploadAmountEquivalent = uploadCreditsRequired * pricing.creditUnitCents;
    const giftAmountEquivalent = includeGift ? giftCreditsRequired * pricing.creditUnitCents : null;
    const creditBackedTxRef = `credits_${Date.now()}_${attendee.id.slice(0, 8)}`;

    const { data: dropInPhoto, error: dbError } = await serviceClient
      .from('drop_in_photos')
      .insert({
        uploader_id: attendee.id,
        storage_path: storagePath,
        original_filename: file.name,
        file_size: file.size,
        is_discoverable: false,
        discovery_scope: 'app_only',
        upload_payment_status: 'paid',
        upload_payment_amount: uploadAmountEquivalent,
        is_gifted: includeGift,
        gift_payment_status: includeGift ? 'paid' : null,
        gift_payment_amount: giftAmountEquivalent,
        gift_message: includeGift && giftMessage ? giftMessage : null,
        upload_payment_transaction_id: creditBackedTxRef,
        location_lat: locationLat,
        location_lng: locationLng,
        location_name: locationName,
        face_processing_status: 'pending',
      })
      .select('id')
      .single();

    if (dbError || !dropInPhoto?.id) {
      await serviceClient.storage.from('media').remove([storagePath]);
      return NextResponse.json({ error: 'Failed to create drop-in record' }, { status: 500 });
    }

    const { data: creditsConsumed, error: creditsError } = await serviceClient.rpc('use_drop_in_credits', {
      p_attendee_id: attendee.id,
      p_action: includeGift ? 'drop_in_upload_with_gift' : 'drop_in_upload',
      p_credits_needed: totalCreditsRequired,
      p_metadata: {
        drop_in_photo_id: dropInPhoto.id,
        include_gift: includeGift,
        upload_credits_required: uploadCreditsRequired,
        gift_credits_required: giftCreditsRequired,
      },
    });

    if (creditsError || !creditsConsumed) {
      await serviceClient.from('drop_in_photos').delete().eq('id', dropInPhoto.id);
      await serviceClient.storage.from('media').remove([storagePath]);
      return NextResponse.json(
        {
          error: `Insufficient credits (${totalCreditsRequired} required)`,
          requiredCredits: totalCreditsRequired,
          availableCredits,
        },
        { status: 402 }
      );
    }

    const processingTriggered = await triggerDropInProcessing(
      dropInPhoto.id,
      accessToken,
      request.headers.get('cookie')
    );

    const { data: remaining } = await serviceClient
      .from('attendees')
      .select('drop_in_credits')
      .eq('id', attendee.id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      dropInPhotoId: dropInPhoto.id,
      creditsUsed: totalCreditsRequired,
      uploadCreditsRequired,
      giftCreditsRequired,
      remainingCredits: Number(remaining?.drop_in_credits || 0),
      processingTriggered,
      message: 'Drop-In uploaded successfully',
    });
  } catch (error) {
    console.error('Drop-in upload error:', error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: detail ? `Failed to process upload: ${detail}` : 'Failed to process upload' },
      { status: 500 }
    );
  }
}
