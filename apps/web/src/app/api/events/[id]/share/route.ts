/**
 * Event Sharing API
 * 
 * Manage share links, QR codes, and public settings for events.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateQRCode, generateEventUrls, generateEmbedCode } from '@/lib/sharing';
import { generateAccessCode } from '@/lib/sharing/share-service';

// GET - Get sharing info for an event
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    // Get event with sharing info
    const { data: event, error } = await supabase
      .from('events')
      .select(`
        id, name, public_slug, short_link, is_publicly_listed,
        allow_anonymous_scan, require_access_code, public_access_code,
        qr_code_url, status
      `)
      .eq('id', id)
      .eq('photographer_id', user.id)
      .single();

    if (error || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Get share links
    const { data: shareLinks } = await supabase
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

    // Generate QR code URL
    const qrCode = await generateQRCode(urls.directUrl, { size: 512 });

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
      urls,
      qrCode,
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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();

    // Verify ownership
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('id', id)
      .eq('photographer_id', user.id)
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
    const { error: updateError } = await supabase
      .from('events')
      .update(updates)
      .eq('id', id);

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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();

    // Verify ownership
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('id', id)
      .eq('photographer_id', user.id)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Generate unique token
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;

    // Create share link
    const { data: shareLink, error } = await supabase
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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get('linkId');

    if (!linkId) {
      return NextResponse.json({ error: 'Link ID required' }, { status: 400 });
    }

    // Verify ownership through event
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('id', id)
      .eq('photographer_id', user.id)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Deactivate the link
    const { error } = await supabase
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
