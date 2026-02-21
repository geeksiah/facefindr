export const dynamic = 'force-dynamic';

/**
 * Event Sharing API
 * 
 * Manage share links, QR codes, and public settings for events.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getPhotographerIdCandidates } from '@/lib/profiles/ids';
import { generateQRCode, generateTransparentQRCode, generateEventUrls, generateEmbedCode, shortenUrl } from '@/lib/sharing/qr-service';
import { generateAccessCode } from '@/lib/sharing/share-service';
import { createClient, createServiceClient } from '@/lib/supabase/server';

function getMissingColumnName(error: any): string | null {
  if (error?.code !== '42703' || typeof error?.message !== 'string') return null;
  const quotedMatch = error.message.match(/column \"([^\"]+)\"/i);
  const bareMatch = error.message.match(/column\s+([a-zA-Z0-9_.]+)/i);
  const rawName = quotedMatch?.[1] || bareMatch?.[1] || null;
  if (!rawName) return null;
  return rawName.includes('.') ? rawName.split('.').pop() || rawName : rawName;
}

async function fetchEventShareRecord(serviceClient: any, eventId: string, photographerIds: string[]) {
  const selectColumns = [
    'id',
    'name',
    'public_slug',
    'short_link',
    'is_publicly_listed',
    'allow_anonymous_scan',
    'require_access_code',
    'public_access_code',
    'qr_code_url',
    'status',
  ];

  while (selectColumns.length > 0) {
    const result = await serviceClient
      .from('events')
      .select(selectColumns.join(', '))
      .eq('id', eventId)
      .in('photographer_id', photographerIds)
      .maybeSingle();

    if (!result.error) return result.data || null;

    const missing = getMissingColumnName(result.error);
    if (missing && selectColumns.includes(missing)) {
      const nextColumns = selectColumns.filter((column) => column !== missing);
      selectColumns.splice(0, selectColumns.length, ...nextColumns);
      continue;
    }

    if (result.error?.code === 'PGRST116') return null;
    throw result.error;
  }

  return null;
}

// GET - Get sharing info for an event
export async function GET(
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

    // Get event with sharing info
    const event = await fetchEventShareRecord(serviceClient, id, photographerIdCandidates);
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Get share links
    const { data: shareLinks } = await serviceClient
      .from('event_share_links')
      .select('*')
      .eq('event_id', id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    // Generate URLs
    const urls = generateEventUrls(
      event.public_slug || id,
      event.short_link,
      event.require_access_code ? event.public_access_code : undefined
    );

    // Generate shortened URL (async, non-blocking)
    let shortUrl = urls.directUrl;
    try {
      shortUrl = await shortenUrl(urls.directUrl);
    } catch (e) {
      // Use direct URL if shortening fails
    }

    // Generate QR code URLs (with white background for display, transparent for download)
    const qrCode = await generateQRCode(urls.directUrl, { size: 512 });
    const qrCodeTransparent = await generateTransparentQRCode(urls.directUrl, 512);

    // Generate embed code
    const embedCode = generateEmbedCode(event.public_slug || id);

    return NextResponse.json({
      event: {
        id: event.id,
        name: event.name,
        publicSlug: event.public_slug,
        shortLink: event.short_link,
        isPubliclyListed: event.is_publicly_listed,
        allowAnonymousScan: event.allow_anonymous_scan,
        requireAccessCode: event.require_access_code,
        accessCode: event.public_access_code,
        status: event.status,
      },
      urls: {
        ...urls,
        shortUrl, // Add the TinyURL shortened link
      },
      qrCode,
      qrCodeTransparent, // For download
      embedCode,
      shareLinks: shareLinks || [],
    });

  } catch (error) {
    console.error('Get share info error:', error);
    return NextResponse.json(
      { error: 'Failed to get sharing info' },
      { status: 500 }
    );
  }
}

// PUT - Update sharing settings
export async function PUT(
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
    const body = await request.json();
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);
    if (!photographerIdCandidates.length) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    // Verify ownership
    const { data: event } = await serviceClient
      .from('events')
      .select('id')
      .eq('id', id)
      .in('photographer_id', photographerIdCandidates)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Build update object
    const updates: Record<string, any> = {};

    if (body.isPubliclyListed !== undefined) {
      updates.is_publicly_listed = body.isPubliclyListed;
    }
    if (body.allowAnonymousScan !== undefined) {
      updates.allow_anonymous_scan = body.allowAnonymousScan;
    }
    if (body.requireAccessCode !== undefined) {
      updates.require_access_code = body.requireAccessCode;
      // Generate new access code if enabling
      if (body.requireAccessCode && !body.accessCode) {
        updates.public_access_code = generateAccessCode();
      }
    }
    if (body.accessCode !== undefined) {
      updates.public_access_code = body.accessCode.toUpperCase();
    }
    if (body.customSlug !== undefined) {
      // Validate slug format
      const slug = body.customSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      updates.public_slug = slug;
    }

    // Update event
    let updateError: any = null;
    const updatePayload = { ...updates };
    for (let attempt = 0; attempt < 8; attempt++) {
      const result = await serviceClient
        .from('events')
        .update(updatePayload)
        .eq('id', id);
      updateError = result.error;
      if (!updateError) break;

      const missingColumn = getMissingColumnName(updateError);
      if (!missingColumn || !(missingColumn in updatePayload)) {
        break;
      }

      delete updatePayload[missingColumn];
      if (!Object.keys(updatePayload).length) {
        updateError = null;
        break;
      }
    }

    if (updateError) {
      // Check for unique constraint violation
      if (updateError.code === '23505') {
        return NextResponse.json(
          { error: 'This URL slug is already in use' },
          { status: 400 }
        );
      }
      throw updateError;
    }
    if (Object.keys(updates).length > 0 && Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: 'No compatible sharing setting columns are available. Apply latest migrations.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Update share settings error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

// POST - Create a new share link
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
    const body = await request.json();
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);
    if (!photographerIdCandidates.length) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    // Verify ownership
    const { data: event } = await serviceClient
      .from('events')
      .select('id')
      .eq('id', id)
      .in('photographer_id', photographerIdCandidates)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Generate unique token
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;

    // Create share link
    const { data: shareLink, error } = await serviceClient
      .from('event_share_links')
      .insert({
        event_id: id,
        token,
        label: body.label,
        link_type: body.type || 'direct',
        require_code: body.requireCode || false,
        access_code: body.accessCode?.toUpperCase(),
        expires_at: body.expiresAt,
        max_uses: body.maxUses,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ shareLink });

  } catch (error) {
    console.error('Create share link error:', error);
    return NextResponse.json(
      { error: 'Failed to create share link' },
      { status: 500 }
    );
  }
}

// DELETE - Revoke a share link
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
    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get('linkId');
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);
    if (!photographerIdCandidates.length) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    if (!linkId) {
      return NextResponse.json({ error: 'Link ID required' }, { status: 400 });
    }

    // Verify ownership through event
    const { data: event } = await serviceClient
      .from('events')
      .select('id')
      .eq('id', id)
      .in('photographer_id', photographerIdCandidates)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Deactivate the link
    const { error } = await serviceClient
      .from('event_share_links')
      .update({ is_active: false })
      .eq('id', linkId)
      .eq('event_id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Delete share link error:', error);
    return NextResponse.json(
      { error: 'Failed to delete share link' },
      { status: 500 }
    );
  }
}

