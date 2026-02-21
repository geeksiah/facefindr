export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createClientWithAccessToken } from '@/lib/supabase/server';

function resolveAuthClient(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  return accessToken
    ? createClientWithAccessToken(accessToken)
    : createClient();
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await resolveAuthClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: albums, error } = await supabase
      .from('photo_albums')
      .select('id, name, description, photo_count, cover_photo_id, is_public, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch albums' }, { status: 500 });
    }

    return NextResponse.json({ albums: albums || [] });
  } catch (error) {
    console.error('Vault albums GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await resolveAuthClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    const description = String(body?.description || '').trim();

    if (!name) {
      return NextResponse.json({ error: 'Album name is required' }, { status: 400 });
    }

    const { data: album, error } = await supabase
      .from('photo_albums')
      .insert({
        user_id: user.id,
        name,
        description: description || null,
      })
      .select('id, name, description, photo_count, cover_photo_id, is_public, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to create album' }, { status: 500 });
    }

    return NextResponse.json({ success: true, album });
  } catch (error) {
    console.error('Vault albums POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await resolveAuthClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const id = String(body?.id || '').trim();
    const name = body?.name !== undefined ? String(body.name || '').trim() : undefined;
    const description = body?.description !== undefined ? String(body.description || '').trim() : undefined;

    if (!id) {
      return NextResponse.json({ error: 'Album id is required' }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) {
      if (!name) {
        return NextResponse.json({ error: 'Album name cannot be empty' }, { status: 400 });
      }
      updatePayload.name = name;
    }
    if (description !== undefined) {
      updatePayload.description = description || null;
    }

    const { data: album, error } = await supabase
      .from('photo_albums')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, name, description, photo_count, cover_photo_id, is_public, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to update album' }, { status: 500 });
    }

    return NextResponse.json({ success: true, album });
  } catch (error) {
    console.error('Vault albums PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await resolveAuthClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get('id') || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'Album id is required' }, { status: 400 });
    }

    // Move photos out of album before deleting the album.
    const { error: clearError } = await supabase
      .from('photo_vault')
      .update({ album_id: null, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('album_id', id);
    if (clearError) {
      return NextResponse.json({ error: 'Failed to clear album photos' }, { status: 500 });
    }

    const { error } = await supabase
      .from('photo_albums')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to delete album' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Vault albums DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
