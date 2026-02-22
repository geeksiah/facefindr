export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import {
  resolveAttendeeProfileByUser,
  resolvePhotographerProfileByUser,
} from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractMissingColumnName(error: any): string | null {
  if (error?.code !== '42703' || typeof error?.message !== 'string') return null;
  const quoted = error.message.match(/column\s+"([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const bare = error.message.match(/column\s+([a-zA-Z0-9_]+)/i);
  return bare?.[1] || null;
}

function isFaceTagCollision(error: any): boolean {
  if (error?.code !== '23505') return false;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('face_tag') || message.includes('face_tag_suffix');
}

function isUsernameCollision(error: any): boolean {
  if (error?.code !== '23505') return false;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('username') || message.includes('username_registry');
}

function buildFaceTag(seed: string) {
  const base = seed.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user';
  const suffix = Math.floor(1000 + Math.random() * 9000).toString();
  return {
    faceTag: `@${base}${suffix}`,
    suffix,
  };
}

async function ensureAttendeeProfile(
  serviceClient: ReturnType<typeof createServiceClient>,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }
) {
  const { data: existing } = await resolveAttendeeProfileByUser(serviceClient, user.id, user.email);
  if (existing?.id) return existing.id as string;

  const emailLocalPart = String(user.email || '').split('@')[0] || 'user';
  const usernameBase =
    asString(user.user_metadata?.username) ||
    asString(user.user_metadata?.display_name) ||
    emailLocalPart;
  const normalizedUsername =
    usernameBase.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'user';
  const displayName =
    asString(user.user_metadata?.display_name) ||
    emailLocalPart ||
    'User';

  const makePayload = () => {
    const tag = buildFaceTag(normalizedUsername);
    return {
      id: user.id,
      user_id: user.id,
      email: user.email || null,
      display_name: displayName,
      username: normalizedUsername,
      status: 'active',
      email_verified: true,
      face_tag: tag.faceTag,
      face_tag_suffix: tag.suffix,
    } as Record<string, unknown>;
  };

  let payload = makePayload();
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await serviceClient
      .from('attendees')
      .insert(payload)
      .select('id')
      .single();

    if (!error && data?.id) {
      return data.id as string;
    }

    const missingColumn = extractMissingColumnName(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      const { [missingColumn]: _omitted, ...nextPayload } = payload;
      void _omitted;
      payload = nextPayload;
      continue;
    }

    if (isFaceTagCollision(error) || isUsernameCollision(error)) {
      payload = makePayload();
      continue;
    }

    break;
  }

  const { data: fallback } = await resolveAttendeeProfileByUser(serviceClient, user.id, user.email);
  return fallback?.id ? String(fallback.id) : null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const targetView = asString(payload?.targetView).toLowerCase();
    const ensureAttendee = payload?.ensureAttendee === true || targetView === 'attendee';
    const shouldSwitch = payload?.switchView !== false;

    let attendeeId: string | null = null;
    if (ensureAttendee) {
      attendeeId = await ensureAttendeeProfile(serviceClient, {
        id: user.id,
        email: user.email,
        user_metadata: (user.user_metadata as Record<string, unknown>) || {},
      });
      if (!attendeeId) {
        return NextResponse.json(
          { error: 'Failed to create attendee profile' },
          { status: 500 }
        );
      }
    }

    if (targetView === 'creator') {
      const { data: creatorProfile } = await resolvePhotographerProfileByUser(
        serviceClient,
        user.id,
        user.email
      );
      if (!creatorProfile?.id) {
        return NextResponse.json(
          { error: 'Creator profile not found for this account' },
          { status: 404 }
        );
      }
    }

    let switchedTo: 'creator' | 'attendee' | null = null;
    if (shouldSwitch && (targetView === 'creator' || targetView === 'attendee')) {
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          ...(user.user_metadata || {}),
          user_type: targetView,
        },
      });
      if (updateError) {
        return NextResponse.json(
          { error: updateError.message || 'Failed to switch view mode' },
          { status: 400 }
        );
      }
      switchedTo = targetView as 'creator' | 'attendee';
    }

    return NextResponse.json({
      success: true,
      attendeeProfileCreated: Boolean(attendeeId),
      switchedTo,
      redirectPath: switchedTo === 'attendee' ? '/gallery' : switchedTo === 'creator' ? '/dashboard' : null,
    });
  } catch (error: any) {
    console.error('View mode switch error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update view mode' },
      { status: 500 }
    );
  }
}
