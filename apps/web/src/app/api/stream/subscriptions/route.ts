export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { createClient } from '@/lib/supabase/server';
import {
  resolveAttendeeProfileByUser,
  resolvePhotographerProfileByUser,
} from '@/lib/profiles/ids';

const encoder = new TextEncoder();

function sseEvent(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function scoreSubscriptionRow(row: any): number {
  let score = 0;
  const status = String(row?.status || '').toLowerCase();
  const planCode = String(row?.plan_code || '').toLowerCase();

  if (status === 'active') score += 100;
  if (status === 'trialing') score += 80;
  if (planCode && planCode !== 'free') score += 20;
  if (row?.current_period_end) score += 5;

  const updatedAt = row?.updated_at ? Date.parse(row.updated_at) : 0;
  const createdAt = row?.created_at ? Date.parse(row.created_at) : 0;
  score += Math.floor((updatedAt || createdAt) / 1000000000);

  return score;
}

function pickBestSubscriptionRow(rows: any[] | null | undefined) {
  if (!rows || rows.length === 0) return null;
  return rows.reduce((best, row) => {
    if (!best) return row;
    return scoreSubscriptionRow(row) > scoreSubscriptionRow(best) ? row : best;
  }, null as any);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const [photographerProfile, attendeeProfile] = await Promise.all([
    resolvePhotographerProfileByUser(supabase, user.id, user.email),
    resolveAttendeeProfileByUser(supabase, user.id, user.email),
  ]);

  const photographerId = photographerProfile.data?.id || user.id;
  const attendeeId = attendeeProfile.data?.id || user.id;

  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let shutdown: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    if (heartbeat) clearInterval(heartbeat);
    if (shutdown) clearTimeout(shutdown);
  };

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return false;
        try {
          controller.enqueue(chunk);
          return true;
        } catch {
          cleanup();
          return false;
        }
      };

      const push = async () => {
        if (closed) return;
        try {
          const [{ data: photographerSub }, { data: attendeeSub }] = await Promise.all([
            supabase
              .from('subscriptions')
              .select('id, plan_code, status, current_period_end, updated_at, created_at')
              .eq('photographer_id', photographerId)
              .in('status', ['active', 'trialing'])
              .order('updated_at', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(20),
            supabase
              .from('attendee_subscriptions')
              .select('id, plan_code, status, current_period_end, updated_at, created_at')
              .eq('attendee_id', attendeeId)
              .in('status', ['active', 'trialing'])
              .order('updated_at', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(20),
          ]);

          const photographerBest = pickBestSubscriptionRow(photographerSub || []);
          const attendeeBest = pickBestSubscriptionRow(attendeeSub || []);

          const stamps = [
            photographerBest?.updated_at ? Date.parse(photographerBest.updated_at) : 0,
            attendeeBest?.updated_at ? Date.parse(attendeeBest.updated_at) : 0,
          ];
          const version = Math.max(...stamps, 0);

          safeEnqueue(
            sseEvent('subscriptions', {
              photographer: photographerBest || null,
              attendee: attendeeBest || null,
              updatedAt: version ? new Date(version).toISOString() : new Date().toISOString(),
              version: String(version || Date.now()),
            })
          );
        } catch {
          cleanup();
        }
      };

      safeEnqueue(sseEvent('ready', { ok: true }));
      void push();
      timer = setInterval(() => void push(), 10000);
      heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(': ping\n\n'));
      }, 15000);

      shutdown = setTimeout(() => {
        cleanup();
        try {
          controller.close();
        } catch {
          // no-op
        }
      }, 25000);
    },
    cancel() {
      cleanup();
    },
  });

  request.signal.addEventListener('abort', cleanup);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
