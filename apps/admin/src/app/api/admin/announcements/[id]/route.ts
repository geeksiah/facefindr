import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: announcement, error } = await supabaseAdmin
      .from('platform_announcements')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !announcement) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }

    return NextResponse.json({ announcement });
  } catch (error) {
    console.error('Get announcement error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('announcements.create'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('platform_announcements')
      .select('*')
      .eq('id', params.id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }

    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: 'Only draft announcements can be edited' },
        { status: 409 }
      );
    }

    const body = await request.json();

    const updates = {
      title: typeof body.title === 'string' ? body.title.trim() : existing.title,
      content: typeof body.content === 'string' ? body.content.trim() : existing.content,
      target: typeof body.target === 'string' ? body.target : existing.target,
      send_email:
        typeof body.send_email === 'boolean' ? body.send_email : Boolean(existing.send_email),
      send_push:
        typeof body.send_push === 'boolean' ? body.send_push : Boolean(existing.send_push),
      send_sms:
        typeof body.send_sms === 'boolean' ? body.send_sms : Boolean(existing.send_sms),
      country_code:
        body.country_code !== undefined ? normalizeCountryCode(body.country_code) : existing.country_code,
      updated_at: new Date().toISOString(),
    };

    if (!updates.title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (!updates.content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    if (!updates.send_email && !updates.send_push && !updates.send_sms) {
      return NextResponse.json(
        { error: 'Select at least one channel (email, push, or SMS)' },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('platform_announcements')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('Update announcement error:', updateError);
      return NextResponse.json({ error: 'Failed to update announcement' }, { status: 500 });
    }

    await logAction('announcement_create', 'announcement', updated.id, {
      operation: 'update_draft',
      target: updated.target,
      country_code: updated.country_code,
      channels: {
        send_email: updated.send_email,
        send_push: updated.send_push,
        send_sms: updated.send_sms,
      },
    });

    return NextResponse.json({ success: true, announcement: updated });
  } catch (error) {
    console.error('Patch announcement error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
